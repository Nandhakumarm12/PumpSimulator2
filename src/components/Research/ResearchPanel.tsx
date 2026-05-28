import { useState, useEffect, useRef } from 'react';
import { T } from '../../styles/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { usePumpContext } from '../../contexts/PumpContext';
import { DRUG_LIBRARY } from '../../pump/drugLibrary';
import { FACTORY_DEFAULTS } from '../../pump/constants';
import { rateToMlH } from '../../pump/display';
import type { Drug } from '../../pump/types';
import { generateDataset, generateBraunDataset, generateGrasebyDataset, generateCombinedDataset, summariseDistribution } from '../../ai/datasetBuilder';
import { toCSV } from '../../ai/featureExtractor';
import type { TrainingRecord } from '../../ai/featureExtractor';
import { api } from '../../api/researchApi';
import type { DatasetMeta, ModelMeta, PredictResult } from '../../api/researchApi';
import { explainRow } from '../../ai/ruleExplainer';
import type { RuleExplanation } from '../../ai/ruleExplainer';
import DeviceRanking from './DeviceRanking';
import { useBraunPumpContext } from '../../contexts/BraunPumpContext';
import { useNetworkContext } from '../../contexts/NetworkContext';
import { useGrasebyPumpContext } from '../../contexts/GrasebyPumpContext';
import { BRAUN_DRUG_LIBRARY } from '../../pump/braun/braunDrugLibrary';
import { rateToMlH as braunRateToMlH } from '../../pump/display';
import {
  buildTrainingRecord,
  DEFAULT_UI_DEVICE_CONTEXT,
  type UIDeviceContext,
} from '../../ai/sessionAdapter';
import { computeDesignScore, getDesignScoreLeaderboard } from '../../ai/deviceDesign';
import type { DesignGrade } from '../../ai/deviceDesign';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TaskResult {
  targetRateMlH: number;
  finalRateMlH: number;
  errorMagnitudeMlH: number;
  relativeError: number;
  entryTimeMs: number;
  keypresses: number;
  corrections: number;
  boundaryHits: number;
  guardrailWarning: boolean;
  guardrailOverride: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  timestamp: number;
}

type Tab = 'task' | 'datasets' | 'scenarios' | 'training' | 'labeller' | 'unified' | 'ranking';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeRiskLevel(r: TaskResult): 'low' | 'medium' | 'high' {
  if (r.relativeError >= 0.5 || r.guardrailOverride) return 'high';
  if (r.relativeError >= 0.1 || r.corrections > 5 || r.boundaryHits > 0 || r.guardrailWarning) return 'medium';
  return 'low';
}

function riskColor(level: 'low' | 'medium' | 'high'): string {
  return level === 'high' ? '#ff4444' : level === 'medium' ? '#ffaa00' : '#3aff3a';
}

type Grade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

function gradeColor(grade: Grade | string): string {
  if (grade === 'A+' || grade === 'A') return '#3aff3a';
  if (grade === 'B') return '#7adf7a';
  if (grade === 'C') return '#ffaa00';
  if (grade === 'D') return '#ff8800';
  return '#ff4444'; // E or F
}

// ─── Layer score helpers (mirrors labellingRules.ts logic, for frontend use) ──

const RULE_SCORES_FRONTEND: Record<string, number> = {
  R01: 1.0, R02: 0.85, R03: 0.80, R04: 0.75, R05: 0.70, R06: 0.65, R07: 0.90, R08: 0.80,
  R10: 0.40, R11: 0.45, R12: 0.30, R13: 0.25, R14: 0.30, R15: 0.20,
  R16: 0.25, R17: 0.35, R18: 0.30, R19: 0.30, R20: 0.40, R21: 0.20,
};
const L1_IDS = new Set(['R01', 'R02', 'R08', 'R10', 'R14', 'R15', 'R21']);
const L2_IDS = new Set(['R03', 'R04', 'R07', 'R11', 'R12', 'R13']);
const L3_IDS = new Set(['R05', 'R06', 'R16', 'R17', 'R18', 'R19', 'R20']);

function computeFrontendLayerScore(ids: string[]): number {
  if (ids.length === 0) return 0;
  const scores = ids.map(id => RULE_SCORES_FRONTEND[id] ?? 0.1);
  const maxScore = Math.max(...scores);
  const sumRemaining = scores.filter(s => s < maxScore).reduce((acc, s) => acc + s * 0.1, 0);
  return Math.min(1.0, maxScore + sumRemaining);
}

/**
 * Compute all four layer scores plus the composite score and grade.
 * @param firedIds     - Rule IDs that fired (R01–R21), used for Layers 1–3.
 * @param designScore  - Optional pre-computed Layer 0 design score; defaults to 0.0
 *                       when not provided (e.g. when pump_model is not in the CSV row).
 */
function computeFrontendLayeredScores(firedIds: string[], designScore = 0.0): {
  interaction: number;
  configuration: number;
  system: number;
  design: number;
  composite: number;
  grade: Grade;
} {
  const l1 = firedIds.filter(id => L1_IDS.has(id));
  const l2 = firedIds.filter(id => L2_IDS.has(id));
  const l3 = firedIds.filter(id => L3_IDS.has(id));
  const interaction   = computeFrontendLayerScore(l1);
  const configuration = computeFrontendLayerScore(l2);
  const system        = computeFrontendLayerScore(l3);
  const design        = designScore;
  const compositeRaw  = 0.20 * design + 0.30 * interaction + 0.25 * configuration + 0.25 * system;
  const composite     = Math.min(1.0, compositeRaw);
  let grade: Grade;
  if (composite <= 0.10) grade = 'A+';
  else if (composite <= 0.20) grade = 'A';
  else if (composite <= 0.35) grade = 'B';
  else if (composite <= 0.50) grade = 'C';
  else if (composite <= 0.65) grade = 'D';
  else if (composite <= 0.80) grade = 'E';
  else grade = 'F';
  return { interaction, configuration, system, design, composite, grade };
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function countRuleHits(records: TrainingRecord[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of records) {
    for (const reason of r.risk_reasons) {
      const id = reason.split(':')[0]?.trim() ?? reason;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function BarRow({ label, count, total, color }: {
  label: string; count: number; total: number; color: string;
}) {
  const C = useTheme();
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ color: C.text.secondary, fontSize: T.nano, letterSpacing: 1 }}>{label}</span>
        <span style={{ color, fontSize: T.nano }}>{count} ({pct.toFixed(1)}%)</span>
      </div>
      <div style={{ height: 10, background: C.bg.inset, borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  const C = useTheme();
  return (
    <div style={{ background: C.bg.panel, border: `1px solid ${C.border.default}`, borderRadius: 10, padding: 20, ...style }}>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  const C = useTheme();
  return (
    <div style={{ color: C.text.secondary, fontSize: T.nano, letterSpacing: 2, marginBottom: 12 }}>
      {children}
    </div>
  );
}

function OfflineNotice() {
  const C = useTheme();
  return (
    <div style={{
      background: C.bg.panel, border: `1px solid ${C.accent.red}44`, borderRadius: 8,
      padding: '16px 20px', color: C.accent.red, fontSize: T.nano, lineHeight: 1.8,
    }}>
      <div style={{ fontSize: T.nano, marginBottom: 6 }}>Backend server offline</div>
      <div style={{ color: C.text.secondary, fontFamily: 'monospace' }}>
        Run: cd server &amp;&amp; uvicorn main:app --reload
      </div>
    </div>
  );
}

// ─── Tab: Task Mode ───────────────────────────────────────────────────────────

/** Subset of DeviceMode used in Task Mode (no 'combined' option). */
type TaskDeviceMode = 'alaris_gp' | 'braun_infusomat' | 'graseby_3100';

const DEVICE_LABEL: Record<TaskDeviceMode, string> = {
  alaris_gp:        'ALARIS GP',
  braun_infusomat:  'B. BRAUN',
  graseby_3100:     'GRASEBY 3100',
};

const CTX_FIELD_LABELS: Record<keyof UIDeviceContext, string> = {
  days_since_maintenance:  'Days since maint.',
  battery_level_pct:       'Battery %',
  network_connected:       'Network (0/1)',
  drug_library_age_days:   'Drug lib age (days)',
  config_drift_score:      'Config drift (0–1)',
  recent_occlusion_alarms: 'Recent occlusions',
};

function TaskModeTab({
  savedRecords,
  onCapture,
}: {
  savedRecords: TrainingRecord[];
  onCapture: (r: TrainingRecord) => void;
}) {
  // All hooks called unconditionally
  const alarisPump    = usePumpContext();
  const braunPump     = useBraunPumpContext();
  const grasebyPump   = useGrasebyPumpContext();
  const networkCtx    = useNetworkContext();

  const [deviceMode, setDeviceMode]     = useState<TaskDeviceMode>('alaris_gp');
  const [uiCtx, setUiCtx]              = useState<UIDeviceContext>({ ...DEFAULT_UI_DEVICE_CONTEXT });
  const [targetRate, setTargetRate]     = useState<number>(2.0);
  const [targetDrug, setTargetDrug]     = useState<Drug>(DRUG_LIBRARY[1]);
  const [taskActive, setTaskActive]     = useState(false);
  const [taskStartTime, setTaskStartTime] = useState<number | null>(null);
  const [saveStatus, setSaveStatus]     = useState<string>('');

  // Auto-sync network_connected from live simulators
  useEffect(() => {
    if (deviceMode === 'alaris_gp') {
      setUiCtx(prev => ({ ...prev, network_connected: networkCtx.isConnected ? 1 : 0 }));
    }
  }, [networkCtx.isConnected, deviceMode]);

  useEffect(() => {
    if (deviceMode === 'braun_infusomat') {
      setUiCtx(prev => ({ ...prev, network_connected: braunPump.pumpState.spacecom2Connected ? 1 : 0 }));
    }
  }, [braunPump.pumpState.spacecom2Connected, deviceMode]);

  // Graseby 3100 has no network — force network_connected = 0
  useEffect(() => {
    if (deviceMode === 'graseby_3100') {
      setUiCtx(prev => ({ ...prev, network_connected: 0 }));
    }
  }, [deviceMode]);

  const prevAlLogLen  = useRef(alarisPump.sessionLog.length);
  const prevBrLogLen  = useRef(braunPump.sessionLog.length);
  const prevGrLogLen  = useRef(grasebyPump.sessionLog.length);

  // Active pump-agnostic values
  const isAlaris  = deviceMode === 'alaris_gp';
  const isGraseby = deviceMode === 'graseby_3100';
  const activePump      = isAlaris ? alarisPump : isGraseby ? grasebyPump : braunPump;
  const activePumpState = activePump.pumpState;
  // Graseby only has DRUG_LIBRARY[0] (manual); show Alaris library for Graseby drug picker (both manual-only)
  const activeDrugLib   = isAlaris ? DRUG_LIBRARY : isGraseby ? DRUG_LIBRARY.slice(0, 1) : BRAUN_DRUG_LIBRARY;

  // Convert target rate (drug units) to ml/h for display
  const targetMlH = isAlaris || isGraseby
    ? rateToMlH(targetRate, targetDrug, FACTORY_DEFAULTS.WEIGHT_DEFAULT)
    : braunRateToMlH(targetRate, targetDrug, FACTORY_DEFAULTS.WEIGHT_DEFAULT);

  // Watch for infusion_started on the active pump
  useEffect(() => {
    if (!taskActive) { prevAlLogLen.current = alarisPump.sessionLog.length; return; }
    const log = alarisPump.sessionLog;
    if (log.length <= prevAlLogLen.current) { prevAlLogLen.current = log.length; return; }
    prevAlLogLen.current = log.length;
    const latest = log[log.length - 1];
    if (latest.event === 'infusion_started') {
      handleCapture('alaris_gp');
    }
  }, [alarisPump.sessionLog.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!taskActive) { prevBrLogLen.current = braunPump.sessionLog.length; return; }
    const log = braunPump.sessionLog;
    if (log.length <= prevBrLogLen.current) { prevBrLogLen.current = log.length; return; }
    prevBrLogLen.current = log.length;
    const latest = log[log.length - 1];
    if (latest.event === 'infusion_started') {
      handleCapture('braun_infusomat');
    }
  }, [braunPump.sessionLog.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!taskActive) { prevGrLogLen.current = grasebyPump.sessionLog.length; return; }
    const log = grasebyPump.sessionLog;
    if (log.length <= prevGrLogLen.current) { prevGrLogLen.current = log.length; return; }
    prevGrLogLen.current = log.length;
    const latest = log[log.length - 1];
    if (latest.event === 'infusion_started') {
      handleCapture('graseby_3100');
    }
  }, [grasebyPump.sessionLog.length]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleCapture(device: TaskDeviceMode) {
    if (device !== deviceMode) return;
    const pump = device === 'alaris_gp' ? alarisPump
                : device === 'graseby_3100' ? grasebyPump
                : braunPump;
    const entryMs  = taskStartTime ? Date.now() - taskStartTime : 0;
    const alarmsDuring = pump.sessionLog.filter(e => e.event === 'alarm_triggered').length;
    const record = buildTrainingRecord(
      device,
      pump.sessionLog,
      pump.pumpState,
      uiCtx,
      targetMlH,
      alarmsDuring,
    );
    // Patch entry_time_ms with actual wall-clock time (buildTrainingRecord uses log timestamps)
    const patched: TrainingRecord = { ...record, entry_time_ms: entryMs };
    onCapture(patched);
    setTaskActive(false);
    setSaveStatus('');
  }

  function startTask() {
    setTaskActive(true);
    setTaskStartTime(Date.now());
    prevAlLogLen.current = alarisPump.sessionLog.length;
    prevBrLogLen.current = braunPump.sessionLog.length;
    prevGrLogLen.current = grasebyPump.sessionLog.length;
  }

  function exportCSV() {
    if (savedRecords.length === 0) return;
    downloadFile(toCSV(savedRecords), `task_mode_${Date.now()}.csv`, 'text/csv');
  }

  function exportJSON() {
    if (savedRecords.length === 0) return;
    downloadFile(JSON.stringify(savedRecords, null, 2), `task_mode_${Date.now()}.json`, 'application/json');
  }

  async function saveToServer() {
    if (savedRecords.length === 0) return;
    setSaveStatus('Saving...');
    try {
      await api.saveDataset(`task_mode_${deviceMode}_${Date.now()}`, savedRecords);
      setSaveStatus(`Saved ${savedRecords.length} records`);
    } catch {
      setSaveStatus('Server offline');
    }
  }

  const latestRecord = savedRecords[0] ?? null;

  return (
    <div>
      {/* Top row: device picker + context panel */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

        {/* Left: device + task config */}
        <Card>
          <SectionLabel>DEVICE SELECTION</SectionLabel>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {(['alaris_gp', 'braun_infusomat', 'graseby_3100'] as TaskDeviceMode[]).map(d => (
              <button key={d} onClick={() => { setDeviceMode(d); setTargetDrug(activeDrugLib[1] as Drug); }}
                disabled={taskActive}
                style={{
                  flex: 1, padding: '8px 4px', borderRadius: 6, cursor: taskActive ? 'not-allowed' : 'pointer',
                  fontSize: T.xs, letterSpacing: 1, fontFamily: "'Share Tech Mono', monospace",
                  background: deviceMode === d ? '#0d2a3a' : 'transparent',
                  border: `1px solid ${deviceMode === d ? '#4a9eff' : '#1e2d45'}`,
                  color: deviceMode === d ? '#4a9eff' : '#3a6080',
                }}>
                {DEVICE_LABEL[d]}
              </button>
            ))}
          </div>

          <SectionLabel>TASK CONFIGURATION</SectionLabel>

          <div style={{ marginBottom: 12 }}>
            <div style={{ color: '#2a6a4a', fontSize: T.nano, marginBottom: 5 }}>TARGET DRUG</div>
            <select value={targetDrug.id} onChange={e => {
              const lib = isAlaris ? DRUG_LIBRARY : BRAUN_DRUG_LIBRARY;
              const d = lib.find(x => x.id === e.target.value) ?? lib[1];
              setTargetDrug(d as Drug);
              setTargetRate(d.defaultRate);
            }} style={{
              width: '100%', background: '#0d1520', border: '1px solid #1e3a5f',
              color: '#4a9eff', padding: '5px 8px', borderRadius: 4, fontSize: T.xs,
              fontFamily: "'Share Tech Mono', monospace", cursor: 'pointer',
            }}>
              {activeDrugLib.map(d => (
                <option key={d.id} value={d.id} style={{ background: '#0d1520' }}>
                  {d.name} ({d.unit})
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ color: '#2a6a4a', fontSize: T.nano, marginBottom: 5 }}>
              TARGET RATE ({targetDrug.unit})
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="number" value={targetRate}
                onChange={e => setTargetRate(parseFloat(e.target.value) || 0)}
                step={targetDrug.unit.includes('kg') ? 0.01 : 0.1}
                min={targetDrug.softMin} max={targetDrug.softMax}
                style={{
                  flex: 1, background: '#0d1520', border: '1px solid #1e3a5f',
                  color: '#3aff3a', padding: '7px 10px', borderRadius: 4,
                  fontSize: T.nano, fontFamily: "'Share Tech Mono', monospace", outline: 'none',
                }} />
              <span style={{ color: '#1a6a3a', fontSize: T.nano }}>{targetDrug.unit}</span>
            </div>
            <div style={{ color: '#1a5a3a', fontSize: T.nano, marginTop: 3 }}>
              = {targetMlH.toFixed(2)} ml/h &nbsp;|&nbsp; Soft: {targetDrug.softMin}–{targetDrug.softMax}
            </div>
          </div>

          {!taskActive ? (
            <button onClick={startTask} style={{
              width: '100%', background: '#0d2a1a', border: '1px solid #1a5a2a',
              color: '#3aff3a', padding: '10px', borderRadius: 6, cursor: 'pointer',
              fontSize: T.nano, letterSpacing: 2, fontFamily: "'Share Tech Mono', monospace",
            }}>▶ START TASK ({DEVICE_LABEL[deviceMode]})</button>
          ) : (
            <div>
              <div style={{
                background: '#0a1a0a', border: '1px solid #1a4a1a', borderRadius: 6,
                padding: 10, marginBottom: 8, textAlign: 'center',
              }}>
                <div style={{ color: '#3aff3a', fontSize: T.nano }}>
                  ● TASK ACTIVE — Program the {DEVICE_LABEL[deviceMode]} now
                </div>
                <div style={{ color: '#1a5a3a', fontSize: T.nano, marginTop: 4 }}>
                  Target: {targetRate} {targetDrug.unit} ({targetMlH.toFixed(2)} ml/h)
                </div>
              </div>
              <button onClick={() => setTaskActive(false)} style={{
                width: '100%', background: '#1a0a0a', border: '1px solid #3a1a1a',
                color: '#ff6644', padding: '8px', borderRadius: 6, cursor: 'pointer',
                fontSize: T.nano, fontFamily: "'Share Tech Mono', monospace",
              }}>CANCEL TASK</button>
            </div>
          )}
        </Card>

        {/* Right: device context panel */}
        <Card>
          <SectionLabel>DEVICE CONTEXT (LAYER 3)</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {(Object.keys(uiCtx) as (keyof UIDeviceContext)[]).map(field => (
              <div key={field}>
                <div style={{ color: '#2a5a7a', fontSize: T.nano, marginBottom: 3 }}>
                  {CTX_FIELD_LABELS[field]}
                </div>
                <input
                  type="number"
                  value={uiCtx[field]}
                  step={field === 'config_drift_score' ? 0.01 : 1}
                  min={field === 'network_connected' ? 0 : 0}
                  max={field === 'network_connected' ? 1 : field === 'config_drift_score' ? 1 : field === 'battery_level_pct' ? 100 : 9999}
                  onChange={e => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v)) setUiCtx(prev => ({ ...prev, [field]: field === 'network_connected' ? (v >= 0.5 ? 1 : 0) : v }));
                  }}
                  style={{
                    width: '100%', background: '#0d1520', border: '1px solid #1e3a5f',
                    color: '#4a9eff', padding: '5px 8px', borderRadius: 4, fontSize: T.xs,
                    fontFamily: "'Share Tech Mono', monospace", outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
            ))}
          </div>
          <button onClick={() => setUiCtx({ ...DEFAULT_UI_DEVICE_CONTEXT })} style={{
            marginTop: 12, width: '100%', background: 'transparent', border: '1px solid #1e2d45',
            color: '#3a6080', padding: '6px', borderRadius: 4, cursor: 'pointer',
            fontSize: T.nano, letterSpacing: 1, fontFamily: "'Share Tech Mono', monospace",
          }}>RESET TO DEFAULTS</button>
        </Card>
      </div>

      {/* Middle row: live metrics + latest saved record */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <Card>
          <SectionLabel>LIVE SESSION METRICS — {DEVICE_LABEL[deviceMode]}</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {[
              { label: 'KEYPRESSES',   value: activePump.keypressCount },
              { label: 'CORRECTIONS',  value: activePump.correctionCount },
              { label: 'BOUNDARY HITS',value: activePump.boundaryHitCount },
              { label: 'OVERRIDES',    value: activePump.overrideCount },
              { label: 'SCREEN',       value: activePumpState.screen.replace('_', ' ').slice(0, 10) },
              {
                label: 'DRUG',
                value: isAlaris
                  ? alarisPump.pumpState.selectedDrug.name.slice(0, 10)
                  : isGraseby
                    ? 'MANUAL'
                    : (BRAUN_DRUG_LIBRARY.find(d => d.id === braunPump.pumpState.selectedDrugId)?.name ?? '').slice(0, 10),
              },
            ].map(m => (
              <div key={m.label} style={{ background: '#0d1520', border: '1px solid #1e2d45', borderRadius: 6, padding: '6px 8px' }}>
                <div style={{ color: '#2a5a7a', fontSize: T.nano, letterSpacing: 1 }}>{m.label}</div>
                <div style={{ color: '#4a9eff', fontSize: typeof m.value === 'number' ? 18 : 10, fontWeight: 'bold', marginTop: 2 }}>{m.value}</div>
              </div>
            ))}
          </div>
        </Card>

        {latestRecord ? (
          <Card style={{ border: `1px solid ${riskColor(latestRecord.risk_label)}44` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <SectionLabel>LATEST CAPTURED RECORD</SectionLabel>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: T.xs, color: '#3a6080' }}>{latestRecord.pump_model === 'alaris_gp' ? 'ALARIS GP' : 'B. BRAUN'}</span>
                <span style={{
                  fontSize: T.md, fontWeight: 'bold',
                  color: gradeColor(latestRecord.grade),
                  background: '#0d1520', border: `1px solid ${gradeColor(latestRecord.grade)}44`,
                  borderRadius: 4, padding: '2px 8px',
                }}>{latestRecord.grade}</span>
                <span style={{ color: riskColor(latestRecord.risk_label), fontSize: T.xs }}>
                  {latestRecord.risk_label.toUpperCase()}
                </span>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
              {[
                { label: 'COMPOSITE', value: latestRecord.composite_score.toFixed(3) },
                { label: 'DESIGN',    value: latestRecord.design_score.toFixed(3) },
                { label: 'INTERACT',  value: latestRecord.interaction_score.toFixed(3) },
                { label: 'CONFIG',    value: latestRecord.configuration_score.toFixed(3) },
                { label: 'TARGET',    value: `${latestRecord.intended_rate_ml_h.toFixed(2)} ml/h` },
                { label: 'ACTUAL',    value: `${latestRecord.final_rate_ml_h.toFixed(2)} ml/h` },
              ].map(item => (
                <div key={item.label} style={{ background: '#0d1520', borderRadius: 4, padding: '5px 8px' }}>
                  <div style={{ color: '#2a5a7a', fontSize: T.nano }}>{item.label}</div>
                  <div style={{ color: '#3aff3a', fontSize: T.nano, marginTop: 1 }}>{item.value}</div>
                </div>
              ))}
            </div>
            {latestRecord.risk_reasons.length > 0 && (
              <div style={{ marginTop: 8, padding: '6px 8px', background: '#0d1520', borderRadius: 4 }}>
                <div style={{ color: '#2a5a7a', fontSize: T.nano, marginBottom: 4 }}>TRIGGERED RULES</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {latestRecord.risk_reasons.map(r => (
                    <span key={r} style={{
                      fontSize: T.nano, padding: '2px 6px', borderRadius: 3,
                      background: '#1a0808', color: '#ff6644', border: '1px solid #3a1a1a',
                    }}>{r.split(':')[0]}</span>
                  ))}
                </div>
              </div>
            )}
          </Card>
        ) : (
          <Card>
            <SectionLabel>LATEST CAPTURED RECORD</SectionLabel>
            <div style={{ color: '#2a5a7a', fontSize: T.xs, textAlign: 'center', padding: '20px 0' }}>
              No records yet. Start a task and complete an infusion.
            </div>
          </Card>
        )}
      </div>

      {/* Saved records collection */}
      {savedRecords.length > 0 && (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <SectionLabel>SAVED RECORDS ({savedRecords.length})</SectionLabel>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {saveStatus && (
                <span style={{ color: saveStatus.startsWith('Saved') ? '#3aff3a' : '#ffaa00', fontSize: T.nano }}>
                  {saveStatus}
                </span>
              )}
              <button onClick={exportCSV} style={{
                background: '#0d2a1a', border: '1px solid #1a5a2a', color: '#3aff3a',
                padding: '5px 12px', borderRadius: 4, cursor: 'pointer',
                fontSize: T.nano, letterSpacing: 1, fontFamily: "'Share Tech Mono', monospace",
              }}>EXPORT CSV</button>
              <button onClick={exportJSON} style={{
                background: '#0d1a2a', border: '1px solid #1a3a5a', color: '#4a9eff',
                padding: '5px 12px', borderRadius: 4, cursor: 'pointer',
                fontSize: T.nano, letterSpacing: 1, fontFamily: "'Share Tech Mono', monospace",
              }}>EXPORT JSON</button>
              <button onClick={saveToServer} style={{
                background: '#1a1a0d', border: '1px solid #3a3a1a', color: '#aacc44',
                padding: '5px 12px', borderRadius: 4, cursor: 'pointer',
                fontSize: T.nano, letterSpacing: 1, fontFamily: "'Share Tech Mono', monospace",
              }}>SAVE TO SERVER</button>
              <span style={{ color: '#2a5a7a', fontSize: T.nano }}>See UNIFIED tab to clear / merge</span>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: T.nano, fontFamily: "'Share Tech Mono', monospace" }}>
              <thead>
                <tr style={{ background: '#0d1a2a' }}>
                  {['#', 'DEVICE', 'DRUG', 'TARGET ml/h', 'ACTUAL ml/h', 'ERR%', 'GRADE', 'COMPOSITE', 'RISK', 'RULES'].map(h => (
                    <th key={h} style={{ padding: '4px 8px', color: '#3a6080', textAlign: 'left', borderBottom: '1px solid #1e2d45', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {savedRecords.map((r, i) => (
                  <tr key={r.record_id} style={{ borderBottom: '1px solid #0d1520' }}>
                    <td style={{ padding: '3px 8px', color: '#2a6090' }}>{savedRecords.length - i}</td>
                    <td style={{ padding: '3px 8px', color: '#4a9eff' }}>
                      {r.pump_model === 'alaris_gp' ? 'ALARIS' : 'BRAUN'}
                    </td>
                    <td style={{ padding: '3px 8px', color: '#aaccaa' }}>{r.drug_name.slice(0, 10)}</td>
                    <td style={{ padding: '3px 8px', color: '#aacc88' }}>{r.intended_rate_ml_h.toFixed(2)}</td>
                    <td style={{ padding: '3px 8px', color: '#aacc88' }}>{r.final_rate_ml_h.toFixed(2)}</td>
                    <td style={{ padding: '3px 8px', color: riskColor(r.risk_label) }}>
                      {(r.relative_error * 100).toFixed(1)}%
                    </td>
                    <td style={{ padding: '3px 8px', fontWeight: 'bold', color: gradeColor(r.grade) }}>{r.grade}</td>
                    <td style={{ padding: '3px 8px', color: '#aaaaff' }}>{r.composite_score.toFixed(3)}</td>
                    <td style={{ padding: '3px 8px', color: riskColor(r.risk_label) }}>{r.risk_label.toUpperCase()}</td>
                    <td style={{ padding: '3px 8px', color: '#ff8844' }}>
                      {r.risk_reasons.map(x => x.split(':')[0]).join(' ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Tab: Datasets ─────────────────────────────────────────────────────────────

function DatasetsTab() {
  const [datasets, setDatasets] = useState<DatasetMeta[]>([]);
  const [loading, setLoading]   = useState(true);
  const [offline, setOffline]   = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const list = await api.listDatasets();
      setDatasets(list);
      setOffline(false);
    } catch {
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  async function handleDelete(filename: string) {
    if (!confirm(`Delete dataset "${filename}"?`)) return;
    try {
      await api.deleteDataset(filename);
      await refresh();
    } catch (e) {
      alert(`Delete failed: ${String(e)}`);
    }
  }

  if (offline) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <OfflineNotice />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ color: '#2a5a7a', fontSize: T.nano, letterSpacing: 2 }}>
          {loading ? 'LOADING…' : `${datasets.length} DATASET${datasets.length !== 1 ? 'S' : ''} SAVED`}
        </div>
        <button onClick={() => void refresh()} style={{
          background: '#080e18', border: '1px solid #1e3a5f', color: '#4a9eff',
          padding: '5px 12px', borderRadius: 4, cursor: 'pointer',
          fontSize: T.nano, fontFamily: "'Share Tech Mono', monospace",
        }}>⟳ REFRESH</button>
      </div>

      {datasets.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#2a5a7a', fontSize: T.nano }}>
          No datasets saved yet. Generate one in the SCENARIO RUNNER tab.
        </div>
      )}

      {datasets.map(ds => (
        <Card key={ds.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <div style={{ color: '#4a9eff', fontSize: T.nano, marginBottom: 4 }}>{ds.name}</div>
              <div style={{ color: '#2a5a7a', fontSize: T.nano }}>
                {ds.record_count} records · {fmtDate(ds.created_at)}
              </div>
              <div style={{ color: '#2a4a4a', fontSize: T.nano, marginTop: 2, fontFamily: 'monospace' }}>
                {ds.filename}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 12 }}>
              <button onClick={() => window.open(api.downloadCSVUrl(ds.filename))} style={{
                background: '#0d2a1a', border: '1px solid #1a5a2a', color: '#3aff3a',
                padding: '5px 10px', borderRadius: 4, cursor: 'pointer',
                fontSize: T.nano, fontFamily: "'Share Tech Mono', monospace",
              }}>⤓ CSV</button>
              <button onClick={() => window.open(api.downloadJSONUrl(ds.filename))} style={{
                background: '#0d1a2a', border: '1px solid #1a3a5a', color: '#4a9eff',
                padding: '5px 10px', borderRadius: 4, cursor: 'pointer',
                fontSize: T.nano, fontFamily: "'Share Tech Mono', monospace",
              }}>⤓ JSON</button>
              <button onClick={() => void handleDelete(ds.filename)} style={{
                background: '#1a0808', border: '1px solid #3a1a1a', color: '#ff4444',
                padding: '5px 10px', borderRadius: 4, cursor: 'pointer',
                fontSize: T.nano, fontFamily: "'Share Tech Mono', monospace",
              }}>✕ DELETE</button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {(['low', 'medium', 'high'] as const).map(level => {
              const count = ds.distribution[level];
              const color = riskColor(level);
              const pct = ds.record_count > 0 ? (count / ds.record_count * 100).toFixed(1) : '0.0';
              return (
                <div key={level} style={{ background: '#0d1520', borderRadius: 6, padding: '8px 10px' }}>
                  <div style={{ color, fontSize: T.nano, letterSpacing: 1 }}>{level.toUpperCase()} RISK</div>
                  <div style={{ color, fontSize: T.nano, fontWeight: 'bold', marginTop: 2 }}>{count}</div>
                  <div style={{ color: '#2a4a4a', fontSize: T.nano }}>{pct}%</div>
                </div>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}

// ─── Tab: Scenario Runner ─────────────────────────────────────────────────────

type DeviceMode = 'alaris_gp' | 'braun_infusomat' | 'graseby_3100' | 'combined';

const DEVICE_MODE_LABELS: Record<DeviceMode, string> = {
  alaris_gp:        'ALARIS GP',
  braun_infusomat:  'B. BRAUN',
  graseby_3100:     'GRASEBY 3100',
  combined:         'COMBINED (×3)',
};

function ScenarioRunnerTab({ onLastRunChange }: {
  onLastRunChange: (records: TrainingRecord[]) => void;
}) {
  const today = new Date();
  const dateStr = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;

  const [count, setCount]         = useState(100);
  const [seed, setSeed]           = useState(42);
  const [deviceMode, setDeviceMode] = useState<DeviceMode>('alaris_gp');
  const [running, setRunning]     = useState(false);
  const [progress, setProgress]   = useState<string | null>(null);
  const [datasetName, setDatasetName] = useState(`alaris_${count}rec_${dateStr}`);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'offline'>('idle');
  const [lastRun, setLastRun]     = useState<{
    records: TrainingRecord[];
    dist: ReturnType<typeof summariseDistribution>;
    elapsed: number;
    deviceMode: DeviceMode;
  } | null>(null);

  // Keep datasetName default in sync with count and deviceMode
  useEffect(() => {
    const prefix = deviceMode === 'combined' ? 'combined3'
                 : deviceMode === 'braun_infusomat' ? 'braun'
                 : deviceMode === 'graseby_3100' ? 'graseby'
                 : 'alaris';
    setDatasetName(`${prefix}_${count}rec_${dateStr}`);
  }, [count, deviceMode]); // eslint-disable-line react-hooks/exhaustive-deps

  function runScenarios() {
    setRunning(true);
    const totalLabel = deviceMode === 'combined' ? `${count * 3} records (${count} per device × 3)` : `${count} records`;
    setProgress(`Generating ${totalLabel}…`);
    setSaveStatus('idle');
    setTimeout(() => {
      const t0 = performance.now();
      let records: TrainingRecord[];
      if (deviceMode === 'braun_infusomat') {
        records = generateBraunDataset(count, seed) as TrainingRecord[];
      } else if (deviceMode === 'graseby_3100') {
        records = generateGrasebyDataset(count, seed);
      } else if (deviceMode === 'combined') {
        records = generateCombinedDataset(count, seed);
      } else {
        records = generateDataset(count, seed);
      }
      const elapsed = performance.now() - t0;
      const dist    = summariseDistribution(records);
      setLastRun({ records, dist, elapsed, deviceMode });
      onLastRunChange(records);
      setProgress(null);
      setRunning(false);
    }, 16);
  }

  async function saveToServer() {
    if (!lastRun) return;
    setSaveStatus('saving');
    try {
      await api.saveDataset(datasetName, lastRun.records);
      setSaveStatus('saved');
    } catch (err) {
      const msg = String(err);
      setSaveStatus(msg.includes('fetch') ? 'offline' : 'error');
    }
  }

  function exportCSV() {
    if (!lastRun) return;
    const csv = toCSV(lastRun.records);
    downloadFile(csv, `${datasetName}.csv`, 'text/csv');
  }

  function exportJSON() {
    if (!lastRun) return;
    downloadFile(JSON.stringify(lastRun.records, null, 2), `${datasetName}.json`, 'application/json');
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <Card>
          <SectionLabel>GENERATOR CONFIGURATION</SectionLabel>

          <div style={{ marginBottom: 14 }}>
            <div style={{ color: '#2a6a4a', fontSize: T.nano, marginBottom: 6 }}>DEVICE</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {(Object.keys(DEVICE_MODE_LABELS) as DeviceMode[]).map(mode => (
                <button key={mode} onClick={() => setDeviceMode(mode)} style={{
                  flex: 1,
                  background: deviceMode === mode ? '#0d1a2a' : '#080e18',
                  border: `1px solid ${deviceMode === mode ? '#1a4a7a' : '#1e2d45'}`,
                  color: deviceMode === mode ? '#4a9eff' : '#2a5a80',
                  padding: '5px 4px', borderRadius: 4, cursor: 'pointer',
                  fontSize: T.nano, letterSpacing: 1, fontFamily: "'Share Tech Mono', monospace",
                }}>{DEVICE_MODE_LABELS[mode]}</button>
              ))}
            </div>
            {deviceMode === 'combined' && (
              <div style={{ color: '#1a4a6a', fontSize: T.nano, marginTop: 4 }}>
                Generates N records per device ({count}×3 = {count * 3} total). pump_model one-hot encoded for ML.
              </div>
            )}
            {deviceMode === 'graseby_3100' && (
              <div style={{ color: '#6a4a1a', fontSize: T.nano, marginTop: 4 }}>
                Graseby 3100: no guardrails, no drug library, no VTBI — highest Layer 0 design risk.
              </div>
            )}
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ color: '#2a6a4a', fontSize: T.nano, marginBottom: 6 }}>RECORD COUNT {deviceMode === 'combined' ? '(per device)' : ''}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {[50, 100, 250, 500].map(n => (
                <button key={n} onClick={() => setCount(n)} style={{
                  background: count === n ? '#0d2a1a' : '#080e18',
                  border: `1px solid ${count === n ? '#1a5a2a' : '#1e2d45'}`,
                  color: count === n ? '#3aff3a' : '#2a6a4a',
                  padding: '4px 10px', borderRadius: 4, cursor: 'pointer',
                  fontSize: T.nano, fontFamily: "'Share Tech Mono', monospace",
                }}>{n}</button>
              ))}
              <input type="number" value={count} min={10} max={2000}
                onChange={e => setCount(Math.max(10, parseInt(e.target.value) || 100))}
                style={{
                  width: 60, background: '#0d1520', border: '1px solid #1e3a5f',
                  color: '#4a9eff', padding: '4px 6px', borderRadius: 4,
                  fontSize: T.nano, fontFamily: "'Share Tech Mono', monospace", outline: 'none',
                }} />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ color: '#2a6a4a', fontSize: T.nano, marginBottom: 6 }}>RANDOM SEED (for reproducibility)</div>
            <input type="number" value={seed} min={0} max={999999}
              onChange={e => setSeed(parseInt(e.target.value) || 42)}
              style={{
                width: 100, background: '#0d1520', border: '1px solid #1e3a5f',
                color: '#4a9eff', padding: '6px 8px', borderRadius: 4,
                fontSize: T.nano, fontFamily: "'Share Tech Mono', monospace", outline: 'none',
              }} />
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ color: '#2a6a4a', fontSize: T.nano, marginBottom: 6 }}>DATASET NAME (for server save)</div>
            <input type="text" value={datasetName}
              onChange={e => setDatasetName(e.target.value)}
              style={{
                width: '100%', background: '#0d1520', border: '1px solid #1e3a5f',
                color: '#4a9eff', padding: '6px 8px', borderRadius: 4, boxSizing: 'border-box',
                fontSize: T.nano, fontFamily: "'Share Tech Mono', monospace", outline: 'none',
              }} />
          </div>

          <button onClick={runScenarios} disabled={running} style={{
            width: '100%', background: running ? '#0a1a0a' : '#0d2a1a',
            border: `1px solid ${running ? '#1a3a1a' : '#1a5a2a'}`,
            color: running ? '#1a5a3a' : '#3aff3a',
            padding: '10px', borderRadius: 6,
            cursor: running ? 'not-allowed' : 'pointer',
            fontSize: T.nano, letterSpacing: 2, fontFamily: "'Share Tech Mono', monospace",
          }}>
            {running ? '⟳ RUNNING…' : '▶ RUN SCENARIO BATCH'}
          </button>

          {progress && (
            <div style={{ marginTop: 8, color: '#1a7a4a', fontSize: T.nano, textAlign: 'center', animation: 'ledPulse 1s ease-in-out infinite' }}>
              {progress}
            </div>
          )}
        </Card>

        <Card>
          <SectionLabel>SCENARIO PROFILES (weighted mix)</SectionLabel>
          {[
            { id: 'ideal',      name: 'Well-maintained, connected', weight: '50%', color: '#3aff3a', desc: 'Recent maintenance, current library, full network' },
            { id: 'neglected',  name: 'Overdue maintenance, isolated', weight: '20%', color: '#ffaa00', desc: 'Old library, low battery, offline' },
            { id: 'cyber_risk', name: 'Known vulnerable firmware', weight: '10%', color: '#ff6644', desc: 'CVE firmware, connected (attack surface)' },
            { id: 'emergency',  name: 'Emergency — MANUAL mode', weight: '20%', color: '#ff4444', desc: 'No drug library, variable state' },
          ].map(p => (
            <div key={p.id} style={{ marginBottom: 10, padding: '8px 10px', background: '#0d1520', borderRadius: 6, borderLeft: `3px solid ${p.color}33` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: p.color, fontSize: T.nano, fontWeight: 'bold' }}>{p.name}</span>
                <span style={{ color: '#2a6a4a', fontSize: T.nano }}>{p.weight}</span>
              </div>
              <div style={{ color: '#2a5a7a', fontSize: T.nano, marginTop: 2 }}>{p.desc}</div>
            </div>
          ))}
        </Card>
      </div>

      {lastRun && (
        <Card style={{ border: '1px solid #1e3a1e' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ color: '#3aff3a', fontSize: T.nano, letterSpacing: 2 }}>
                ✓ GENERATION COMPLETE — {lastRun.dist.total} records in {lastRun.elapsed.toFixed(0)}ms
              </div>
              <div style={{ color: '#2a6a4a', fontSize: T.nano, marginTop: 2 }}>
                Device: {DEVICE_MODE_LABELS[lastRun.deviceMode]}
                {lastRun.deviceMode === 'combined' && ` (${lastRun.dist.total / 3} Alaris + ${lastRun.dist.total / 3} B. Braun + ${lastRun.dist.total / 3} Graseby)`}
                {' · '}Target: ~30% low / ~40% medium / ~30% high
              </div>
              {lastRun.deviceMode === 'combined' && (
                <div style={{ color: '#1a4a6a', fontSize: T.nano, marginTop: 2 }}>
                  pump_model column: 'alaris_gp' / 'braun_infusomat' / 'graseby_3100' — use as categorical feature
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={exportCSV} style={{
                background: '#0d2a1a', border: '1px solid #1a5a2a', color: '#3aff3a',
                padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
                fontSize: T.nano, letterSpacing: 1, fontFamily: "'Share Tech Mono', monospace",
              }}>⤓ CSV</button>
              <button onClick={exportJSON} style={{
                background: '#0d1a2a', border: '1px solid #1a3a5a', color: '#4a9eff',
                padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
                fontSize: T.nano, letterSpacing: 1, fontFamily: "'Share Tech Mono', monospace",
              }}>⤓ JSON</button>
              <button onClick={() => void saveToServer()} disabled={saveStatus === 'saving'} style={{
                background: saveStatus === 'saved' ? '#0d2a1a' : saveStatus === 'error' || saveStatus === 'offline' ? '#1a0808' : '#0d1a2a',
                border: `1px solid ${saveStatus === 'saved' ? '#1a5a2a' : saveStatus === 'error' || saveStatus === 'offline' ? '#3a1a1a' : '#1a3a5a'}`,
                color: saveStatus === 'saved' ? '#3aff3a' : saveStatus === 'error' || saveStatus === 'offline' ? '#ff4444' : '#ffaa00',
                padding: '6px 14px', borderRadius: 6, cursor: saveStatus === 'saving' ? 'not-allowed' : 'pointer',
                fontSize: T.nano, letterSpacing: 1, fontFamily: "'Share Tech Mono', monospace",
              }}>
                {saveStatus === 'saving' ? '⟳ SAVING…'
                  : saveStatus === 'saved' ? '✓ SAVED'
                  : saveStatus === 'error' ? '✕ ERROR'
                  : saveStatus === 'offline' ? '✕ OFFLINE'
                  : '↑ SAVE TO SERVER'}
              </button>
            </div>
          </div>

          {(saveStatus === 'error' || saveStatus === 'offline') && (
            <div style={{ marginBottom: 12 }}>
              <OfflineNotice />
            </div>
          )}

          <div style={{ marginBottom: 12 }}>
            <BarRow label="LOW RISK"    count={lastRun.dist.low.count}    total={lastRun.dist.total} color="#3aff3a" />
            <BarRow label="MEDIUM RISK" count={lastRun.dist.medium.count} total={lastRun.dist.total} color="#ffaa00" />
            <BarRow label="HIGH RISK"   count={lastRun.dist.high.count}   total={lastRun.dist.total} color="#ff4444" />
          </div>

          <div style={{ color: '#1a5a3a', fontSize: T.nano, textAlign: 'right' }}>
            Seed: {seed} | device: {DEVICE_MODE_LABELS[lastRun.deviceMode]} | {lastRun.dist.low.count} low · {lastRun.dist.medium.count} medium · {lastRun.dist.high.count} high
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Tab: Training ─────────────────────────────────────────────────────────────

function TrainingTab() {
  const [datasets, setDatasets]     = useState<DatasetMeta[]>([]);
  const [models, setModels]         = useState<ModelMeta[]>([]);
  const [offline, setOffline]       = useState(false);
  const [selected, setSelected]     = useState<Set<string>>(new Set());
  const [algorithm, setAlgorithm]   = useState<'random_forest' | 'decision_tree' | 'logistic_regression'>('random_forest');
  const [testSplit, setTestSplit]    = useState(20);
  const [versionName, setVersionName] = useState('');
  const [training, setTraining]     = useState(false);
  const [trainError, setTrainError] = useState<string | null>(null);
  const [expandedModel, setExpandedModel] = useState<string | null>(null);

  async function loadAll() {
    try {
      const [dsList, mList] = await Promise.all([api.listDatasets(), api.listModels()]);
      setDatasets(dsList);
      setModels(mList);
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }

  useEffect(() => { void loadAll(); }, []);

  function toggleDataset(filename: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename);
      else next.add(filename);
      return next;
    });
  }

  async function handleTrain() {
    if (selected.size === 0 || training) return;
    setTraining(true);
    setTrainError(null);
    try {
      const newModel = await api.trainModel({
        dataset_filenames: Array.from(selected),
        algorithm,
        test_split: testSplit / 100,
        version_name: versionName || undefined,
      });
      setModels(prev => [newModel, ...prev]);
      setExpandedModel(newModel.id);
    } catch (e) {
      setTrainError(String(e));
    } finally {
      setTraining(false);
    }
  }

  async function handleDeleteModel(modelId: string) {
    if (!confirm('Delete this model?')) return;
    try {
      await api.deleteModel(modelId);
      setModels(prev => prev.filter(m => m.id !== modelId));
      if (expandedModel === modelId) setExpandedModel(null);
    } catch (e) {
      alert(`Delete failed: ${String(e)}`);
    }
  }

  if (offline) {
    return <OfflineNotice />;
  }

  const algoBtns: Array<{ id: 'random_forest' | 'decision_tree' | 'logistic_regression'; label: string }> = [
    { id: 'random_forest',       label: 'Random Forest' },
    { id: 'decision_tree',       label: 'Decision Tree' },
    { id: 'logistic_regression', label: 'Logistic Regression' },
  ];

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {/* Dataset selection */}
        <Card>
          <SectionLabel>SELECT DATASETS ({selected.size} selected)</SectionLabel>
          {datasets.length === 0 && (
            <div style={{ color: '#2a5a7a', fontSize: T.nano, textAlign: 'center', padding: '20px 0' }}>
              No datasets available. Save one in the SCENARIO RUNNER tab.
            </div>
          )}
          <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {datasets.map(ds => (
              <label key={ds.filename} style={{
                display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer',
                padding: '8px 10px', borderRadius: 6,
                background: selected.has(ds.filename) ? '#0d2a1a' : '#0d1520',
                border: `1px solid ${selected.has(ds.filename) ? '#1a5a2a' : '#1e2d45'}`,
              }}>
                <input type="checkbox" checked={selected.has(ds.filename)}
                  onChange={() => toggleDataset(ds.filename)}
                  style={{ marginTop: 2, accentColor: '#3aff3a', flexShrink: 0 }} />
                <div>
                  <div style={{ color: '#4a9eff', fontSize: T.nano }}>{ds.name}</div>
                  <div style={{ color: '#2a5a7a', fontSize: T.nano, marginTop: 2 }}>
                    {ds.record_count} records · {fmtDate(ds.created_at)}
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                    {(['low', 'medium', 'high'] as const).map(lv => (
                      <span key={lv} style={{ color: riskColor(lv), fontSize: T.nano }}>
                        {lv.charAt(0).toUpperCase()}: {ds.distribution[lv]}
                      </span>
                    ))}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </Card>

        {/* Training configuration */}
        <Card>
          <SectionLabel>TRAINING CONFIGURATION</SectionLabel>

          <div style={{ marginBottom: 14 }}>
            <div style={{ color: '#2a6a4a', fontSize: T.nano, marginBottom: 6 }}>ALGORITHM</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {algoBtns.map(btn => (
                <button key={btn.id} onClick={() => setAlgorithm(btn.id)} style={{
                  background: algorithm === btn.id ? '#0d2a1a' : '#0d1520',
                  border: `1px solid ${algorithm === btn.id ? '#1a5a2a' : '#1e2d45'}`,
                  color: algorithm === btn.id ? '#3aff3a' : '#2a6a4a',
                  padding: '7px 12px', borderRadius: 4, cursor: 'pointer',
                  fontSize: T.nano, fontFamily: "'Share Tech Mono', monospace", textAlign: 'left',
                }}>{btn.label}</button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ color: '#2a6a4a', fontSize: T.nano }}>TEST SPLIT</div>
              <div style={{ color: '#4a9eff', fontSize: T.nano }}>{testSplit}%</div>
            </div>
            <input type="range" min={10} max={40} value={testSplit}
              onChange={e => setTestSplit(parseInt(e.target.value))}
              style={{ width: '100%', accentColor: '#4a9eff' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
              <span style={{ color: '#2a4a6a', fontSize: T.nano }}>10%</span>
              <span style={{ color: '#2a4a6a', fontSize: T.nano }}>40%</span>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ color: '#2a6a4a', fontSize: T.nano, marginBottom: 6 }}>VERSION NAME (optional)</div>
            <input type="text" value={versionName}
              onChange={e => setVersionName(e.target.value)}
              placeholder="e.g. rf_v1_100rec"
              style={{
                width: '100%', background: '#0d1520', border: '1px solid #1e3a5f',
                color: '#4a9eff', padding: '6px 8px', borderRadius: 4, boxSizing: 'border-box',
                fontSize: T.nano, fontFamily: "'Share Tech Mono', monospace", outline: 'none',
              }} />
          </div>

          <button onClick={() => void handleTrain()}
            disabled={selected.size === 0 || training}
            style={{
              width: '100%', background: selected.size === 0 || training ? '#0a1a0a' : '#0d2a1a',
              border: `1px solid ${selected.size === 0 || training ? '#1a3a1a' : '#1a5a2a'}`,
              color: selected.size === 0 || training ? '#1a5a3a' : '#3aff3a',
              padding: '10px', borderRadius: 6,
              cursor: selected.size === 0 || training ? 'not-allowed' : 'pointer',
              fontSize: T.nano, letterSpacing: 2, fontFamily: "'Share Tech Mono', monospace",
            }}>
            {training ? '⟳ TRAINING…' : `▶ TRAIN MODEL (${selected.size} dataset${selected.size !== 1 ? 's' : ''})`}
          </button>

          {trainError && (
            <div style={{ marginTop: 8, color: '#ff4444', fontSize: T.nano, background: '#1a0808', border: '1px solid #3a1a1a', padding: '6px 8px', borderRadius: 4 }}>
              {trainError}
            </div>
          )}
        </Card>
      </div>

      {/* Model versions */}
      <div>
        <div style={{ color: '#2a5a7a', fontSize: T.nano, letterSpacing: 2, marginBottom: 12 }}>
          MODEL VERSIONS ({models.length})
        </div>

        {models.length === 0 && (
          <div style={{ textAlign: 'center', padding: '30px 20px', color: '#2a5a7a', fontSize: T.nano }}>
            No models trained yet.
          </div>
        )}

        {models.map(m => (
          <div key={m.id} style={{ marginBottom: 10 }}>
            <div style={{ background: '#080e18', border: '1px solid #1e2d45', borderRadius: 8, overflow: 'hidden' }}>
              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: expandedModel === m.id ? '1px solid #1e2d45' : 'none' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#4a9eff', fontSize: T.nano }}>{m.version_name}</div>
                  <div style={{ color: '#2a5a7a', fontSize: T.nano, marginTop: 2 }}>
                    {m.algorithm.replace('_', ' ')} · {m.total_records} records · {fmtDate(m.created_at)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: T.nano }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ color: '#2a5a7a', fontSize: T.nano }}>ACCURACY</div>
                    <div style={{ color: '#3aff3a', fontSize: T.nano }}>{(m.accuracy * 100).toFixed(1)}%</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ color: '#2a5a7a', fontSize: T.nano }}>F1 MACRO</div>
                    <div style={{ color: '#4a9eff', fontSize: T.nano }}>{m.f1_macro.toFixed(3)}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setExpandedModel(expandedModel === m.id ? null : m.id)} style={{
                    background: '#0d1a2a', border: '1px solid #1e3a5f', color: '#4a9eff',
                    padding: '5px 10px', borderRadius: 4, cursor: 'pointer',
                    fontSize: T.nano, fontFamily: "'Share Tech Mono', monospace",
                  }}>{expandedModel === m.id ? '▲ HIDE' : '▼ DETAILS'}</button>
                  <button onClick={() => void handleDeleteModel(m.id)} style={{
                    background: '#1a0808', border: '1px solid #3a1a1a', color: '#ff4444',
                    padding: '5px 10px', borderRadius: 4, cursor: 'pointer',
                    fontSize: T.nano, fontFamily: "'Share Tech Mono', monospace",
                  }}>✕</button>
                </div>
              </div>

              {expandedModel === m.id && (
                <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  {/* Confusion Matrix */}
                  <div>
                    <div style={{ color: '#2a5a7a', fontSize: T.nano, letterSpacing: 2, marginBottom: 8 }}>CONFUSION MATRIX (rows=Actual, cols=Predicted)</div>
                    <table style={{ borderCollapse: 'collapse', fontSize: T.nano, fontFamily: "'Share Tech Mono', monospace", width: '100%' }}>
                      <thead>
                        <tr>
                          <th style={{ color: '#2a4a6a', padding: '4px 8px', textAlign: 'left', fontSize: T.nano }}>ACT\PRE</th>
                          {(['LOW', 'MED', 'HIGH'] as const).map(l => (
                            <th key={l} style={{ color: riskColor(l.toLowerCase() === 'med' ? 'medium' : l.toLowerCase() as 'low' | 'high'), padding: '4px 8px', textAlign: 'center', fontSize: T.nano }}>{l}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(['LOW', 'MED', 'HIGH'] as const).map((rowLabel, ri) => (
                          <tr key={rowLabel}>
                            <td style={{ color: riskColor(rowLabel.toLowerCase() === 'med' ? 'medium' : rowLabel.toLowerCase() as 'low' | 'high'), padding: '4px 8px', fontSize: T.nano }}>{rowLabel}</td>
                            {(m.confusion_matrix[ri] ?? [0,0,0]).map((val, ci) => (
                              <td key={ci} style={{
                                textAlign: 'center', padding: '4px 8px',
                                background: ri === ci ? '#0d2a0d' : val > 0 ? '#1a0808' : '#0d1520',
                                color: ri === ci ? '#3aff3a' : val > 0 ? '#ff6644' : '#2a5a7a',
                                borderRadius: 3, fontSize: T.nano, fontWeight: ri === ci ? 'bold' : 'normal',
                              }}>{val}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div style={{ marginTop: 12 }}>
                      <div style={{ color: '#2a5a7a', fontSize: T.nano, letterSpacing: 2, marginBottom: 6 }}>F1 PER CLASS</div>
                      {(['low', 'medium', 'high'] as const).map(lv => (
                        <div key={lv} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ color: riskColor(lv), fontSize: T.nano, width: 40 }}>{lv.toUpperCase()}</span>
                          <div style={{ flex: 1, height: 8, background: '#0d1520', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${m.f1_per_class[lv] * 100}%`, background: riskColor(lv), borderRadius: 3 }} />
                          </div>
                          <span style={{ color: riskColor(lv), fontSize: T.nano, width: 36, textAlign: 'right' }}>{m.f1_per_class[lv].toFixed(3)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Feature importances */}
                  <div>
                    <div style={{ color: '#2a5a7a', fontSize: T.nano, letterSpacing: 2, marginBottom: 8 }}>TOP FEATURE IMPORTANCES</div>
                    {m.feature_importance.slice(0, 10).map((fi, idx) => {
                      const maxImp = m.feature_importance[0]?.importance ?? 1;
                      const pct = maxImp > 0 ? (fi.importance / maxImp) * 100 : 0;
                      return (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <span style={{ color: '#2a6a8a', fontSize: T.nano, width: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
                            {fi.feature}
                          </span>
                          <div style={{ flex: 1, height: 8, background: '#0d1520', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: '#4a9eff', borderRadius: 3 }} />
                          </div>
                          <span style={{ color: '#4a9eff', fontSize: T.nano, width: 40, textAlign: 'right', flexShrink: 0 }}>
                            {fi.importance.toFixed(4)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


// ─── Tab: Risk Labeller (CSV upload + explainable prediction) ─────────────────

/** Parse a string value from CSV into a number if possible, else keep as string. */
function parseField(val: string): number | string {
  const trimmed = val.trim();
  if (trimmed === '' || trimmed === 'null' || trimmed === 'undefined') return 0;
  const n = Number(trimmed);
  return isNaN(n) ? trimmed : n;
}

/** Convert a CSV row (Record<string, string>) to a Partial<TrainingRecord> with numeric fields parsed. */
function parseRowAsNumbers(row: Record<string, string>): Partial<TrainingRecord> {
  const result: Record<string, number | string | string[]> = {};
  for (const [key, val] of Object.entries(row)) {
    if (key === 'risk_reasons') {
      // risk_reasons is pipe-separated in CSV
      result[key] = val ? val.replace(/^"|"$/g, '').split('|') : [];
    } else {
      result[key] = parseField(val);
    }
  }
  return result as Partial<TrainingRecord>;
}

/** Parse a CSV string into an array of row objects (header row → keys). */
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split('\n').map(l => l.trimEnd()).filter(l => l.length > 0);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (values[idx] ?? '').trim();
    });
    rows.push(row);
  }
  return rows;
}

/** Row background tint by risk label. */
function riskRowBg(label: string): string {
  if (label === 'high')   return '#1a0808';
  if (label === 'medium') return '#1a1200';
  return '#081a0a';
}

/** Row border color by risk label. */
function riskRowBorder(label: string): string {
  if (label === 'high')   return '#3a1a1a';
  if (label === 'medium') return '#3a2a00';
  return '#0d3a1a';
}

function RiskLabellerTab({ lastScenarioRecords }: { lastScenarioRecords: TrainingRecord[] }) {
  // ── State ─────────────────────────────────────────────────────────────────
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [csvFilename, setCsvFilename] = useState('');
  const [selectedRow, setSelectedRow] = useState<Record<string, string> | null>(null);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const [labellerModelId, setLabellerModelId] = useState('');
  const [prediction, setPrediction] = useState<PredictResult | null>(null);
  const [predicting, setPredicting] = useState(false);
  const [ruleExplanation, setRuleExplanation] = useState<RuleExplanation | null>(null);
  const [models, setModels] = useState<ModelMeta[]>([]);
  const [predError, setPredError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load models on mount
  useEffect(() => {
    api.listModels().then(list => {
      setModels(list);
      if (list.length > 0 && !labellerModelId) setLabellerModelId(list[0].id);
    }).catch(() => { /* ignore — offline handled per-action */ });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When a row is selected: run rule explainer immediately, auto-predict if model set
  useEffect(() => {
    if (!selectedRow) { setRuleExplanation(null); setPrediction(null); return; }
    const parsed = parseRowAsNumbers(selectedRow);
    setRuleExplanation(explainRow(parsed));
    if (labellerModelId) {
      void runPredict(parsed);
    } else {
      setPrediction(null);
    }
  }, [selectedRow, labellerModelId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function runPredict(parsed: Partial<TrainingRecord>) {
    if (!labellerModelId) return;
    setPredicting(true);
    setPredError(null);
    try {
      const numericFeatures: Record<string, number> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'number') numericFeatures[k] = v;
      }
      const res = await api.predict(labellerModelId, numericFeatures);
      setPrediction(res);
    } catch (e) {
      setPredError(String(e));
    } finally {
      setPredicting(false);
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFilename(file.name);
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      setCsvRows(rows);
      setSelectedRow(null);
      setSelectedRowIndex(null);
      setPrediction(null);
      setRuleExplanation(null);
    };
    reader.readAsText(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  }

  function useLastGenerated() {
    if (lastScenarioRecords.length === 0) return;
    const rows = lastScenarioRecords.map(r => {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(r)) {
        out[k] = Array.isArray(v) ? (v as string[]).join('|') : String(v ?? '');
      }
      return out;
    });
    setCsvRows(rows);
    setCsvFilename(`last_generated_${lastScenarioRecords.length}rec`);
    setSelectedRow(null);
    setSelectedRowIndex(null);
    setPrediction(null);
    setRuleExplanation(null);
  }

  function selectRow(row: Record<string, string>, idx: number) {
    setSelectedRow(row);
    setSelectedRowIndex(idx);
    setPrediction(null);
    setPredError(null);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Section A: Data Source */}
      <Card>
        <SectionLabel>DATA SOURCE</SectionLabel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            style={{ display: 'none' }}
            onChange={handleFileUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              background: '#0d1a2a', border: '1px solid #1e3a5f', color: '#4a9eff',
              padding: '7px 14px', borderRadius: 5, cursor: 'pointer',
              fontSize: T.nano, letterSpacing: 1, fontFamily: "'Share Tech Mono', monospace",
            }}
          >
            ↑ UPLOAD CSV
          </button>

          <button
            onClick={useLastGenerated}
            disabled={lastScenarioRecords.length === 0}
            style={{
              background: lastScenarioRecords.length === 0 ? '#0a0d10' : '#0d2a1a',
              border: `1px solid ${lastScenarioRecords.length === 0 ? '#1e2d45' : '#1a5a2a'}`,
              color: lastScenarioRecords.length === 0 ? '#2a4a5a' : '#3aff3a',
              padding: '7px 14px', borderRadius: 5,
              cursor: lastScenarioRecords.length === 0 ? 'not-allowed' : 'pointer',
              fontSize: T.nano, letterSpacing: 1, fontFamily: "'Share Tech Mono', monospace",
            }}
          >
            USE LAST GENERATED {lastScenarioRecords.length > 0 ? `(${lastScenarioRecords.length})` : ''}
          </button>

          <div style={{ flex: 1, minWidth: 140 }}>
            <div style={{ color: '#2a5a7a', fontSize: T.nano, marginBottom: 4 }}>MODEL</div>
            <select
              value={labellerModelId}
              onChange={e => setLabellerModelId(e.target.value)}
              style={{
                width: '100%', background: '#0d1520', border: '1px solid #1e3a5f',
                color: '#4a9eff', padding: '5px 8px', borderRadius: 4,
                fontSize: T.nano, fontFamily: "'Share Tech Mono', monospace", cursor: 'pointer',
              }}
            >
              <option value="" style={{ background: '#0d1520' }}>— no model —</option>
              {models.map(m => (
                <option key={m.id} value={m.id} style={{ background: '#0d1520' }}>
                  {m.version_name} ({m.algorithm.replace(/_/g, ' ')}) — {(m.accuracy * 100).toFixed(1)}%
                </option>
              ))}
            </select>
          </div>

          {csvRows.length > 0 && (
            <div style={{ color: '#2a6a4a', fontSize: T.nano }}>
              {csvRows.length} rows — {csvFilename}
            </div>
          )}
        </div>
      </Card>

      {/* Section B: Row Table */}
      {csvRows.length > 0 && (
        <Card>
          <SectionLabel>
            ROWS ({csvRows.length}) — {csvFilename} — click a row to inspect
          </SectionLabel>
          <div style={{ maxHeight: 320, overflowY: 'auto', overflowX: 'auto' }}>
            <table style={{
              width: '100%', borderCollapse: 'collapse',
              fontSize: T.nano, fontFamily: "'Share Tech Mono', monospace",
            }}>
              <thead>
                <tr style={{ background: '#0d1a2a', position: 'sticky', top: 0, zIndex: 1 }}>
                  {['#', 'drug_name', 'final_rate_ml_h', 'entry_time_ms', 'relative_error', 'override', 'days_maint', 'battery_%', 'risk_label'].map(h => (
                    <th key={h} style={{
                      padding: '5px 8px', color: '#3a6080', textAlign: 'left',
                      borderBottom: '1px solid #1e2d45', whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {csvRows.map((row, i) => {
                  const label = row['risk_label'] ?? '';
                  const isSelected = selectedRowIndex === i;
                  return (
                    <tr
                      key={i}
                      onClick={() => selectRow(row, i)}
                      style={{
                        background: isSelected ? (label === 'high' ? '#2a0808' : label === 'medium' ? '#2a1e00' : '#0a2a0a') : riskRowBg(label),
                        border: isSelected ? `2px solid ${riskColor(label as 'low'|'medium'|'high')}` : `1px solid ${riskRowBorder(label)}`,
                        cursor: 'pointer',
                        transition: 'background 0.15s',
                      }}
                    >
                      <td style={{ padding: '4px 8px', color: '#2a6090' }}>{i + 1}</td>
                      <td style={{ padding: '4px 8px', color: '#aaccee', whiteSpace: 'nowrap' }}>{row['drug_name'] ?? '—'}</td>
                      <td style={{ padding: '4px 8px', color: '#aacc88' }}>
                        {row['final_rate_ml_h'] ? parseFloat(row['final_rate_ml_h']).toFixed(2) : '—'}
                      </td>
                      <td style={{ padding: '4px 8px', color: '#4a9eff' }}>{row['entry_time_ms'] ?? '—'}</td>
                      <td style={{ padding: '4px 8px', color: riskColor((parseFloat(row['relative_error'] ?? '0') >= 0.5 ? 'high' : parseFloat(row['relative_error'] ?? '0') >= 0.1 ? 'medium' : 'low')) }}>
                        {row['relative_error'] ? parseFloat(row['relative_error']).toFixed(3) : '—'}
                      </td>
                      <td style={{ padding: '4px 8px', color: row['guardrail_override'] === '1' ? '#ffaa00' : '#2a5a7a' }}>
                        {row['guardrail_override'] === '1' ? 'YES' : 'NO'}
                      </td>
                      <td style={{ padding: '4px 8px', color: '#4a9eff' }}>{row['days_since_maintenance'] ?? '—'}</td>
                      <td style={{ padding: '4px 8px', color: '#4a9eff' }}>{row['battery_level_pct'] ?? '—'}</td>
                      <td style={{ padding: '4px 8px', color: riskColor((label || 'low') as 'low'|'medium'|'high'), fontWeight: 'bold' }}>
                        {label.toUpperCase() || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Section C: Explanation Panel */}
      {selectedRow !== null && selectedRowIndex !== null && (
        <div>
          {/* Header */}
          <div style={{ color: '#4a9eff', fontSize: T.nano, letterSpacing: 2, marginBottom: 12 }}>
            ROW {selectedRowIndex + 1} — {selectedRow['drug_name'] ?? '?'} / {
              selectedRow['final_rate_ml_h']
                ? `${parseFloat(selectedRow['final_rate_ml_h']).toFixed(2)} ml/h`
                : '? ml/h'
            }
          </div>

          {/* Device Design Profile card (shown when pump_model is recognised) */}
          {(() => {
            const pumpModel = selectedRow['pump_model'];
            if (!pumpModel) return null;
            const designResult = computeDesignScore(pumpModel);
            if (!designResult.profile) return null;

            const { profile, score, reasons } = designResult;
            const rawGrade: DesignGrade = score <= 0.10 ? 'A+' : score <= 0.20 ? 'A' :
              score <= 0.35 ? 'B' : score <= 0.50 ? 'C' : score <= 0.65 ? 'D' :
              score <= 0.80 ? 'E' : 'F';

            // Parse design_reasons from CSV if present (pipe-separated), else use computed reasons
            const csvDesignReasons = selectedRow['design_reasons'];
            const displayReasons = csvDesignReasons && csvDesignReasons.length > 0
              ? csvDesignReasons.split('|').slice(0, 3)
              : reasons.slice(0, 3);

            return (
              <Card style={{ marginBottom: 16, borderColor: '#2a3a5a' }}>
                <SectionLabel>DEVICE DESIGN PROFILE — LAYER 0</SectionLabel>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'start' }}>
                  <div>
                    {/* Device info row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                      <div>
                        <div style={{ color: '#aaccee', fontSize: T.nano, fontWeight: 'bold' }}>
                          {profile.display_name}
                        </div>
                        <div style={{ color: '#4a6a8a', fontSize: T.nano, marginTop: 2 }}>
                          {profile.manufacturer} · {profile.device_class.replace(/_/g, ' ').toUpperCase()}
                        </div>
                      </div>
                    </div>

                    {/* Design score bar */}
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ color: '#2a5a7a', fontSize: T.nano, letterSpacing: 1 }}>DESIGN SCORE (Layer 0)</span>
                        <span style={{ color: gradeColor(rawGrade), fontSize: T.nano }}>
                          {score.toFixed(3)} / 1.000
                        </span>
                      </div>
                      <div style={{ height: 10, background: '#0d1a0a', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
                        <div style={{
                          height: '100%',
                          width: `${score * 100}%`,
                          background: gradeColor(rawGrade),
                          borderRadius: 4,
                          transition: 'width 0.6s ease',
                        }} />
                      </div>
                    </div>

                    {/* Top 3 design reasons */}
                    {displayReasons.length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        <div style={{ color: '#2a5a7a', fontSize: T.nano, letterSpacing: 1, marginBottom: 4 }}>
                          TOP DESIGN FACTORS
                        </div>
                        {displayReasons.map((reason, i) => (
                          <div key={i} style={{
                            color: '#5a7a9a', fontSize: T.nano, marginBottom: 3,
                            paddingLeft: 8, borderLeft: '1px solid #2a3a5a',
                            lineHeight: 1.5,
                          }}>
                            {reason}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Feature flags */}
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                      {[
                        { label: 'DRUG LIB', ok: profile.has_drug_library },
                        { label: 'VTBI', ok: profile.has_vtbi },
                        { label: 'ANTI-FF', ok: profile.has_anti_freeflow },
                        { label: 'KVO', ok: profile.has_kvo },
                        { label: 'NETWORK', ok: profile.has_network },
                        { label: 'FW SIGNED', ok: profile.firmware_signed },
                        { label: 'CLEARTEXT', ok: !profile.transmits_cleartext },
                      ].map(flag => (
                        <div key={flag.label} style={{
                          padding: '2px 6px', borderRadius: 3, fontSize: T.nano,
                          background: flag.ok ? '#0a1a0a' : '#1a0808',
                          border: `1px solid ${flag.ok ? '#1a4a1a' : '#4a1a1a'}`,
                          color: flag.ok ? '#3aff3a' : '#ff4444',
                        }}>
                          {flag.ok ? '✓' : '✗'} {flag.label}
                        </div>
                      ))}
                      <div style={{
                        padding: '2px 6px', borderRadius: 3, fontSize: T.nano,
                        background: '#0a0a1a', border: '1px solid #2a2a5a', color: '#7a7aff',
                      }}>
                        {profile.cve_count} CVE{profile.cve_count !== 1 ? 's' : ''}
                        {profile.max_cvss_score > 0 ? ` (max CVSS ${profile.max_cvss_score.toFixed(1)})` : ''}
                      </div>
                    </div>
                  </div>

                  {/* Grade badge */}
                  <div style={{ textAlign: 'center', minWidth: 60 }}>
                    <div style={{ color: '#2a5a7a', fontSize: T.nano, letterSpacing: 1, marginBottom: 4 }}>GRADE</div>
                    <div style={{
                      fontSize: 32, fontWeight: 'bold', color: gradeColor(rawGrade),
                      textShadow: `0 0 20px ${gradeColor(rawGrade)}66`,
                      letterSpacing: 2,
                    }}>
                      {rawGrade}
                    </div>
                    <div style={{ color: '#2a5a7a', fontSize: T.nano, marginTop: 4 }}>
                      design only
                    </div>
                  </div>
                </div>
              </Card>
            );
          })()}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

            {/* LEFT: Model Prediction */}
            <Card>
              <SectionLabel>MODEL PREDICTION</SectionLabel>

              {!labellerModelId ? (
                <div style={{ color: '#2a5a7a', fontSize: T.nano, padding: '20px 0', textAlign: 'center' }}>
                  Select a trained model above to get a prediction.
                </div>
              ) : predicting ? (
                <div style={{ color: '#1a7a4a', fontSize: T.nano, padding: '20px 0', textAlign: 'center', animation: 'ledPulse 1s ease-in-out infinite' }}>
                  ⟳ PREDICTING…
                </div>
              ) : predError ? (
                <div style={{ color: '#ff4444', fontSize: T.nano, marginBottom: 12 }}>{predError}</div>
              ) : prediction ? (
                <div>
                  {/* Predicted label */}
                  <div style={{ marginBottom: 8, textAlign: 'center' }}>
                    <span style={{ color: '#2a5a7a', fontSize: T.nano }}>Model: </span>
                    <span style={{
                      color: riskColor(prediction.label),
                      fontSize: T.sm, fontWeight: 'bold', letterSpacing: 3,
                    }}>{prediction.label.toUpperCase()}</span>
                    <span style={{ color: '#2a5a7a', fontSize: T.nano, marginLeft: 8 }}>
                      ({(prediction.confidence * 100).toFixed(1)}%)
                    </span>
                  </div>

                  {/* Grade display */}
                  <div style={{ marginBottom: 14, textAlign: 'center' }}>
                    <div style={{ color: '#2a5a7a', fontSize: T.nano, letterSpacing: 1, marginBottom: 4 }}>ENERGY GRADE</div>
                    <span style={{
                      color: gradeColor(prediction.grade),
                      fontSize: 28, fontWeight: 'bold', letterSpacing: 4,
                      textShadow: `0 0 16px ${gradeColor(prediction.grade)}66`,
                    }}>{prediction.grade}</span>
                    <div style={{ color: '#2a5a7a', fontSize: T.nano, marginTop: 2 }}>
                      (approximate — based on predicted label)
                    </div>
                  </div>

                  {/* Probability bars */}
                  {(['low', 'medium', 'high'] as const).map(lv => {
                    const pct = (prediction.probabilities[lv] ?? 0) * 100;
                    return (
                      <div key={lv} style={{ marginBottom: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                          <span style={{ color: riskColor(lv), fontSize: T.nano }}>{lv.toUpperCase()}</span>
                          <span style={{ color: riskColor(lv), fontSize: T.nano }}>{pct.toFixed(1)}%</span>
                        </div>
                        <div style={{ height: 10, background: '#0d1520', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: riskColor(lv), borderRadius: 3, transition: 'width 0.5s ease' }} />
                        </div>
                      </div>
                    );
                  })}

                  {/* Top features */}
                  {prediction.top_features.length > 0 && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ color: '#2a5a7a', fontSize: T.nano, letterSpacing: 1, marginBottom: 8 }}>TOP FEATURES</div>
                      {prediction.top_features.map((fi, idx) => {
                        const maxC = prediction.top_features[0]?.contribution ?? 1;
                        const pct = maxC > 0 ? (fi.contribution / maxC) * 100 : 0;
                        return (
                          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                            <span style={{
                              color: '#2a6a8a', fontSize: T.nano,
                              width: 120, overflow: 'hidden', textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap', flexShrink: 0,
                            }}>
                              {fi.feature}
                            </span>
                            <div style={{ flex: 1, height: 8, background: '#0d1520', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: '#4a9eff', borderRadius: 2 }} />
                            </div>
                            <span style={{ color: '#2a6a8a', fontSize: T.nano, width: 38, textAlign: 'right', flexShrink: 0 }}>
                              {typeof fi.value === 'number' ? fi.value.toFixed(2) : fi.value}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ color: '#2a5a7a', fontSize: T.nano, padding: '20px 0', textAlign: 'center' }}>
                  Awaiting prediction…
                </div>
              )}
            </Card>

            {/* RIGHT: Rule Explanation */}
            <Card>
              <SectionLabel>RULE EXPLANATION (R01–R21)</SectionLabel>

              {ruleExplanation ? (
                <div>
                  {/* Ground truth vs model comparison */}
                  <div style={{ marginBottom: 12, padding: '8px 10px', background: '#0d1520', borderRadius: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#2a5a7a', fontSize: T.nano }}>Ground truth:</span>
                      <span style={{
                        color: riskColor((selectedRow['risk_label'] || 'low') as 'low'|'medium'|'high'),
                        fontSize: T.nano, fontWeight: 'bold',
                      }}>
                        {(selectedRow['risk_label'] ?? 'unknown').toUpperCase()}
                      </span>
                    </div>
                    {prediction && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                        <span style={{ color: '#2a5a7a', fontSize: T.nano }}>Model says:</span>
                        <span style={{ color: riskColor(prediction.label), fontSize: T.nano, fontWeight: 'bold' }}>
                          {prediction.label.toUpperCase()}
                          {' '}
                          {prediction.label === (selectedRow['risk_label'] ?? '') ? (
                            <span style={{ color: '#3aff3a' }}>✓</span>
                          ) : (
                            <span style={{ color: '#ff4444' }}>✗</span>
                          )}
                        </span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                      <span style={{ color: '#2a5a7a', fontSize: T.nano }}>Rules assign:</span>
                      <span style={{
                        color: riskColor(ruleExplanation.assignedLabel),
                        fontSize: T.nano, fontWeight: 'bold',
                      }}>
                        {ruleExplanation.assignedLabel.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  {/* HIGH rules */}
                  {ruleExplanation.highRules.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ color: '#ff4444', fontSize: T.nano, letterSpacing: 1, marginBottom: 6 }}>HIGH RISK RULES</div>
                      {ruleExplanation.highRules.map(rule => (
                        <div key={rule.id} style={{ marginBottom: 6, paddingLeft: 6, borderLeft: '2px solid #ff4444' }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                            <span style={{ color: '#ff4444', fontSize: T.nano }}>●</span>
                            <span style={{ color: '#cc3333', fontSize: T.nano, fontWeight: 'bold', flexShrink: 0 }}>{rule.id}</span>
                            <span style={{ color: '#ffaaaa', fontSize: T.nano }}>{rule.label}</span>
                          </div>
                          <div style={{ color: '#5a2a2a', fontSize: T.nano, marginTop: 2, paddingLeft: 16 }}>
                            {rule.source}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* MEDIUM rules */}
                  {ruleExplanation.mediumRules.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ color: '#ffaa00', fontSize: T.nano, letterSpacing: 1, marginBottom: 6 }}>MEDIUM RISK RULES</div>
                      {ruleExplanation.mediumRules.map(rule => (
                        <div key={rule.id} style={{ marginBottom: 6, paddingLeft: 6, borderLeft: '2px solid #ffaa00' }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                            <span style={{ color: '#ffaa00', fontSize: T.nano }}>◎</span>
                            <span style={{ color: '#cc8800', fontSize: T.nano, fontWeight: 'bold', flexShrink: 0 }}>{rule.id}</span>
                            <span style={{ color: '#ffddaa', fontSize: T.nano }}>{rule.label}</span>
                          </div>
                          <div style={{ color: '#4a3a00', fontSize: T.nano, marginTop: 2, paddingLeft: 16 }}>
                            {rule.source}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* No rules fired */}
                  {ruleExplanation.firedRules.length === 0 && (
                    <div style={{ color: '#3aff3a', fontSize: T.nano, padding: '10px 0', textAlign: 'center' }}>
                      No risk rules triggered → LOW
                    </div>
                  )}

                  {/* Layer breakdown */}
                  {(() => {
                    const firedIds = ruleExplanation.firedRules.map(r => r.id);
                    // Use design_score from CSV row if present; otherwise compute from pump_model
                    const csvDesignScore = selectedRow['design_score']
                      ? parseFloat(selectedRow['design_score'])
                      : undefined;
                    const pumpModel = selectedRow['pump_model'];
                    const resolvedDesignScore = csvDesignScore !== undefined && !isNaN(csvDesignScore)
                      ? csvDesignScore
                      : pumpModel
                        ? computeDesignScore(pumpModel).score
                        : 0.0;
                    const ls = computeFrontendLayeredScores(firedIds, resolvedDesignScore);
                    const layers: Array<{ label: string; score: number; color: string }> = [
                      { label: 'INTERACTION',   score: ls.interaction,   color: '#4a9eff' },
                      { label: 'CONFIG',        score: ls.configuration, color: '#ffaa00' },
                      { label: 'SYSTEM',        score: ls.system,        color: '#ff8844' },
                      { label: 'DESIGN',        score: ls.design,        color: '#7a7aff' },
                    ];
                    return (
                      <div style={{ marginTop: 14, padding: '10px', background: '#0a1520', borderRadius: 6, border: '1px solid #1e2d45' }}>
                        <div style={{ color: '#2a5a7a', fontSize: T.nano, letterSpacing: 1, marginBottom: 8 }}>LAYER BREAKDOWN</div>
                        {layers.map(lyr => (
                          <div key={lyr.label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                            <span style={{ color: '#2a6a8a', fontSize: T.nano, width: 76, flexShrink: 0 }}>{lyr.label}</span>
                            <div style={{ flex: 1, height: 8, background: '#0d1520', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${lyr.score * 100}%`, background: lyr.color, borderRadius: 2, transition: 'width 0.4s ease' }} />
                            </div>
                            <span style={{ color: lyr.color, fontSize: T.nano, width: 32, textAlign: 'right', flexShrink: 0 }}>
                              {lyr.score.toFixed(2)}
                            </span>
                          </div>
                        ))}
                        <div style={{ borderTop: '1px solid #1e2d45', marginTop: 6, paddingTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: '#2a5a7a', fontSize: T.nano }}>COMPOSITE</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 80, height: 8, background: '#0d1520', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${ls.composite * 100}%`, background: gradeColor(ls.grade), borderRadius: 2 }} />
                            </div>
                            <span style={{ color: '#aaccaa', fontSize: T.nano, width: 32, textAlign: 'right' }}>{ls.composite.toFixed(2)}</span>
                            <span style={{ color: gradeColor(ls.grade), fontSize: T.nano, fontWeight: 'bold', width: 20, textAlign: 'right' }}>
                              {ls.grade}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div style={{ color: '#2a5a7a', fontSize: T.nano, padding: '20px 0', textAlign: 'center' }}>
                  Select a row to see rule explanation.
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* Empty state */}
      {csvRows.length === 0 && (
        <Card>
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#2a5a7a', fontSize: T.nano }}>
            <div style={{ fontSize: T.nano, marginBottom: 8 }}>No data loaded</div>
            <div>Upload a CSV file or use the last generated scenario dataset.</div>
            <div style={{ marginTop: 6, color: '#1e3a5f' }}>
              CSV must have a header row with TrainingRecord field names.
            </div>
          </div>
        </Card>
      )}

      {/* Design Score Leaderboard — always visible, no row selection needed */}
      <Card style={{ marginTop: 8 }}>
        <SectionLabel>DEVICE DESIGN SCORES — LAYER 0 LEADERBOARD</SectionLabel>
        <div style={{ color: '#4a6a8a', fontSize: T.nano, marginBottom: 12 }}>
          Fixed per-device scores based on manufacturer DFU/IFU, CVE databases, and FDA recall history.
          Lower score = better design. Sorted safest first.
        </div>
        <table style={{
          width: '100%', borderCollapse: 'collapse',
          fontSize: T.nano, fontFamily: "'Share Tech Mono', monospace",
        }}>
          <thead>
            <tr style={{ background: '#0d1a2a' }}>
              {['Device', 'Score', 'Grade', ''].map(h => (
                <th key={h} style={{
                  padding: '5px 8px', color: '#3a6080', textAlign: 'left',
                  borderBottom: '1px solid #1e2d45', whiteSpace: 'nowrap',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {getDesignScoreLeaderboard().map((entry, i) => {
              const barPct = entry.design_score * 100;
              const barColor = gradeColor(entry.grade);
              return (
                <tr key={entry.model_id} style={{
                  background: i % 2 === 0 ? '#080e18' : '#090f1a',
                  borderBottom: '1px solid #1e2d45',
                }}>
                  <td style={{ padding: '6px 8px', color: '#aaccee', whiteSpace: 'nowrap' }}>
                    {entry.display_name}
                  </td>
                  <td style={{ padding: '6px 8px', color: barColor, whiteSpace: 'nowrap', width: 52 }}>
                    {entry.design_score.toFixed(3)}
                  </td>
                  <td style={{ padding: '6px 8px', width: 32 }}>
                    <span style={{
                      color: barColor,
                      fontSize: T.nano,
                      fontWeight: 'bold',
                    }}>{entry.grade}</span>
                  </td>
                  <td style={{ padding: '6px 8px', width: '40%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ flex: 1, height: 8, background: '#0d1520', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', width: `${barPct}%`,
                          background: barColor, borderRadius: 2,
                          transition: 'width 0.6s ease',
                        }} />
                      </div>
                      <span style={{ color: '#2a4a6a', fontSize: T.nano, width: 34, textAlign: 'right', flexShrink: 0 }}>
                        {barPct.toFixed(0)}%
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ marginTop: 10, color: '#1e3a5f', fontSize: T.nano, lineHeight: 1.7 }}>
          Sources: CISA ICS-CERT medical device advisories · FDA MedWatch recall database ·
          Manufacturer DFU/IFU documents · IEC 60601-2-24:2012 · FDA TPLC Guidance (Dec 2014)
        </div>
      </Card>
    </div>
  );
}

// ─── Tab: Unified Dataset ─────────────────────────────────────────────────────

function UnifiedDatasetTab({
  taskRecords,
  scenarioRecords,
  onClearTask,
}: {
  taskRecords:     TrainingRecord[];
  scenarioRecords: TrainingRecord[];
  onClearTask:     () => void;
}) {
  const [deviceFilter, setDeviceFilter] = useState<'all' | 'alaris_gp' | 'braun_infusomat'>('all');
  const [riskFilter,   setRiskFilter]   = useState<'all' | 'low' | 'medium' | 'high'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'task' | 'scenario'>('all');
  const [saveStatus,   setSaveStatus]   = useState('');

  const tagged = [
    ...taskRecords.map(r => ({ ...r, _source: 'task' as const })),
    ...scenarioRecords.map(r => ({ ...r, _source: 'scenario' as const })),
  ];

  const filtered = tagged.filter(r =>
    (deviceFilter === 'all' || r.pump_model === deviceFilter) &&
    (riskFilter   === 'all' || r.risk_label === riskFilter) &&
    (sourceFilter === 'all' || r._source    === sourceFilter)
  );

  const total  = tagged.length;
  const counts = {
    low:    tagged.filter(r => r.risk_label === 'low').length,
    medium: tagged.filter(r => r.risk_label === 'medium').length,
    high:   tagged.filter(r => r.risk_label === 'high').length,
    alaris: tagged.filter(r => r.pump_model === 'alaris_gp').length,
    braun:  tagged.filter(r => r.pump_model === 'braun_infusomat').length,
    task:   taskRecords.length,
    synth:  scenarioRecords.length,
  };

  function mergedCSV() {
    const base = tagged.map(({ _source: _, ...r }) => r);
    downloadFile(toCSV(base), `unified_dataset_${Date.now()}.csv`, 'text/csv');
  }

  function mergedJSON() {
    const base = tagged.map(({ _source: _, ...r }) => r);
    downloadFile(JSON.stringify(base, null, 2), `unified_dataset_${Date.now()}.json`, 'application/json');
  }

  async function saveToServer() {
    if (tagged.length === 0) return;
    setSaveStatus('Saving…');
    try {
      const base = tagged.map(({ _source: _, ...r }) => r);
      await api.saveDataset(`unified_${Date.now()}`, base);
      setSaveStatus(`Saved ${base.length} records`);
    } catch {
      setSaveStatus('Server offline');
    }
  }

  function filterBtn(
    label: string,
    active: boolean,
    onClick: () => void,
    color = '#4a9eff',
  ): React.ReactNode {
    return (
      <button onClick={onClick} style={{
        padding: '4px 10px', borderRadius: 4, cursor: 'pointer',
        fontSize: T.nano, letterSpacing: 1, fontFamily: "'Share Tech Mono', monospace",
        background: active ? '#0d1a2a' : 'transparent',
        border: `1px solid ${active ? color : '#1e2d45'}`,
        color: active ? color : '#2a5a7a',
      }}>{label}</button>
    );
  }

  return (
    <div>
      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'TOTAL RECORDS', value: total,        color: '#4a9eff' },
          { label: 'TASK MODE',     value: counts.task,  color: '#aacc44' },
          { label: 'SYNTHETIC',     value: counts.synth, color: '#aa88ff' },
          { label: 'B. BRAUN',      value: counts.braun, color: '#0088cc' },
        ].map(s => (
          <Card key={s.label}>
            <div style={{ color: '#2a5a7a', fontSize: T.nano, marginBottom: 4 }}>{s.label}</div>
            <div style={{ color: s.color, fontSize: T.xxl, fontWeight: 'bold' }}>{s.value}</div>
          </Card>
        ))}
      </div>

      {/* Risk distribution */}
      <Card style={{ marginBottom: 16 }}>
        <SectionLabel>RISK DISTRIBUTION — ALL SOURCES</SectionLabel>
        <BarRow label="LOW"    count={counts.low}    total={total} color="#3aff3a" />
        <BarRow label="MEDIUM" count={counts.medium} total={total} color="#ffaa00" />
        <BarRow label="HIGH"   count={counts.high}   total={total} color="#ff4444" />
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <span style={{ color: '#2a5a7a', fontSize: T.nano, alignSelf: 'center' }}>DEVICE SPLIT:</span>
          <span style={{ color: '#4a9eff', fontSize: T.nano }}>Alaris GP: {counts.alaris}</span>
          <span style={{ color: '#0088cc', fontSize: T.nano }}>B. Braun: {counts.braun}</span>
        </div>
      </Card>

      {/* Filters + actions */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              <span style={{ color: '#2a5a7a', fontSize: T.nano }}>SOURCE:</span>
              {filterBtn('ALL',      sourceFilter === 'all',      () => setSourceFilter('all'))}
              {filterBtn('TASK',     sourceFilter === 'task',     () => setSourceFilter('task'),     '#aacc44')}
              {filterBtn('SCENARIO', sourceFilter === 'scenario', () => setSourceFilter('scenario'), '#aa88ff')}
            </div>
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              <span style={{ color: '#2a5a7a', fontSize: T.nano }}>DEVICE:</span>
              {filterBtn('ALL',     deviceFilter === 'all',             () => setDeviceFilter('all'))}
              {filterBtn('ALARIS',  deviceFilter === 'alaris_gp',       () => setDeviceFilter('alaris_gp'))}
              {filterBtn('B.BRAUN', deviceFilter === 'braun_infusomat', () => setDeviceFilter('braun_infusomat'), '#0088cc')}
            </div>
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              <span style={{ color: '#2a5a7a', fontSize: T.nano }}>RISK:</span>
              {filterBtn('ALL',    riskFilter === 'all',    () => setRiskFilter('all'))}
              {filterBtn('LOW',    riskFilter === 'low',    () => setRiskFilter('low'),    '#3aff3a')}
              {filterBtn('MEDIUM', riskFilter === 'medium', () => setRiskFilter('medium'), '#ffaa00')}
              {filterBtn('HIGH',   riskFilter === 'high',   () => setRiskFilter('high'),   '#ff4444')}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {saveStatus && (
              <span style={{ color: saveStatus.startsWith('Saved') ? '#3aff3a' : '#ffaa00', fontSize: T.nano }}>
                {saveStatus}
              </span>
            )}
            <button onClick={mergedCSV} disabled={total === 0} style={{
              background: '#0d2a1a', border: '1px solid #1a5a2a', color: '#3aff3a',
              padding: '5px 10px', borderRadius: 4, cursor: total === 0 ? 'not-allowed' : 'pointer',
              fontSize: T.nano, fontFamily: "'Share Tech Mono', monospace",
            }}>EXPORT CSV</button>
            <button onClick={mergedJSON} disabled={total === 0} style={{
              background: '#0d1a2a', border: '1px solid #1a3a5a', color: '#4a9eff',
              padding: '5px 10px', borderRadius: 4, cursor: total === 0 ? 'not-allowed' : 'pointer',
              fontSize: T.nano, fontFamily: "'Share Tech Mono', monospace",
            }}>EXPORT JSON</button>
            <button onClick={saveToServer} disabled={total === 0} style={{
              background: '#1a1a0d', border: '1px solid #3a3a1a', color: '#aacc44',
              padding: '5px 10px', borderRadius: 4, cursor: total === 0 ? 'not-allowed' : 'pointer',
              fontSize: T.nano, fontFamily: "'Share Tech Mono', monospace",
            }}>SAVE TO SERVER</button>
            {taskRecords.length > 0 && (
              <button onClick={onClearTask} style={{
                background: '#1a0808', border: '1px solid #3a1a1a', color: '#ff6644',
                padding: '5px 10px', borderRadius: 4, cursor: 'pointer',
                fontSize: T.nano, fontFamily: "'Share Tech Mono', monospace",
              }}>CLEAR TASK</button>
            )}
          </div>
        </div>
      </Card>

      {/* Records table */}
      {filtered.length === 0 ? (
        <Card>
          <div style={{ textAlign: 'center', padding: '32px 0', color: '#2a5a7a', fontSize: T.xs }}>
            {total === 0
              ? 'No records yet. Capture sessions in Task Mode or generate records in Scenario Runner.'
              : 'No records match the current filters.'}
          </div>
        </Card>
      ) : (
        <Card>
          <SectionLabel>RECORDS — {filtered.length} shown of {total}</SectionLabel>
          <div style={{ overflowX: 'auto', maxHeight: 460, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: T.nano, fontFamily: "'Share Tech Mono', monospace" }}>
              <thead style={{ position: 'sticky', top: 0, background: '#080e18' }}>
                <tr style={{ background: '#0d1a2a' }}>
                  {['SRC', 'DEVICE', 'DRUG', 'TARGET', 'ACTUAL', 'ERR%', 'GRADE', 'COMP', 'DSN', 'INT', 'CFG', 'SYS', 'RISK', 'RULES'].map(h => (
                    <th key={h} style={{ padding: '4px 6px', color: '#3a6080', textAlign: 'left', borderBottom: '1px solid #1e2d45', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.record_id + i} style={{ borderBottom: '1px solid #0d1520' }}>
                    <td style={{ padding: '3px 5px' }}>
                      <span style={{
                        fontSize: T.nano, padding: '1px 4px', borderRadius: 3,
                        background: r._source === 'task' ? '#0d2a0a' : '#120d2a',
                        color: r._source === 'task' ? '#aacc44' : '#aa88ff',
                        border: `1px solid ${r._source === 'task' ? '#2a5a1a' : '#3a2a6a'}`,
                      }}>{r._source === 'task' ? 'TASK' : 'SYNTH'}</span>
                    </td>
                    <td style={{ padding: '3px 5px', color: '#4a9eff' }}>
                      {r.pump_model === 'alaris_gp' ? 'ALARIS' : 'BRAUN'}
                    </td>
                    <td style={{ padding: '3px 5px', color: '#aaccaa' }}>{r.drug_name.slice(0, 8)}</td>
                    <td style={{ padding: '3px 5px', color: '#aacc88' }}>{r.intended_rate_ml_h.toFixed(1)}</td>
                    <td style={{ padding: '3px 5px', color: '#aacc88' }}>{r.final_rate_ml_h.toFixed(1)}</td>
                    <td style={{ padding: '3px 5px', color: riskColor(r.risk_label) }}>{(r.relative_error * 100).toFixed(1)}%</td>
                    <td style={{ padding: '3px 5px', fontWeight: 'bold', color: gradeColor(r.grade) }}>{r.grade}</td>
                    <td style={{ padding: '3px 5px', color: '#aaaaff' }}>{r.composite_score.toFixed(3)}</td>
                    <td style={{ padding: '3px 5px', color: '#6688cc' }}>{r.design_score.toFixed(3)}</td>
                    <td style={{ padding: '3px 5px', color: '#5599aa' }}>{r.interaction_score.toFixed(3)}</td>
                    <td style={{ padding: '3px 5px', color: '#5599aa' }}>{r.configuration_score.toFixed(3)}</td>
                    <td style={{ padding: '3px 5px', color: '#5599aa' }}>{r.system_score.toFixed(3)}</td>
                    <td style={{ padding: '3px 5px', color: riskColor(r.risk_label), whiteSpace: 'nowrap' }}>{r.risk_label.toUpperCase()}</td>
                    <td style={{ padding: '3px 5px', color: '#ff8844' }}>
                      {r.risk_reasons.map(x => x.split(':')[0]).join(' ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ResearchPanel() {
  const C = useTheme();
  const [activeTab, setActiveTab]           = useState<Tab>('task');
  const [taskRecords, setTaskRecords]       = useState<TrainingRecord[]>([]);
  const [lastScenarioRecords, setLastScenarioRecords] = useState<TrainingRecord[]>([]);

  const tabStyle = (t: Tab): React.CSSProperties => ({
    padding: '8px 20px', cursor: 'pointer', fontSize: T.nano, letterSpacing: 2,
    fontFamily: "'Share Tech Mono', monospace",
    background: activeTab === t ? C.bg.hover : C.bg.panel,
    border: `1px solid ${activeTab === t ? C.accent.green + '66' : C.border.default}`,
    color: activeTab === t ? C.accent.green : C.text.secondary,
    borderRadius: 6,
  });

  return (
    <div style={{
      padding: '24px 20px',
      fontFamily: "'Share Tech Mono', monospace",
      color: C.text.primary,
      maxWidth: 960,
      margin: '0 auto',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Rajdhani:wght@300;500;700&display=swap');
        @keyframes ledPulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
      `}</style>

      {/* Header + tabs */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ color: C.accent.blue, fontSize: T.nano, letterSpacing: 3, fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>
          RESEARCH PANEL
        </div>
        <div style={{ color: C.text.secondary, fontSize: T.nano, letterSpacing: 2, marginTop: 2, marginBottom: 14 }}>
          Task accuracy · Datasets · Scenario generation · ML training · Risk prediction
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={tabStyle('task')}      onClick={() => setActiveTab('task')}>      TASK MODE       </button>
          <button style={tabStyle('unified')}   onClick={() => setActiveTab('unified')}>   UNIFIED VIEW    </button>
          <button style={tabStyle('datasets')}  onClick={() => setActiveTab('datasets')}>  DATASETS        </button>
          <button style={tabStyle('scenarios')} onClick={() => setActiveTab('scenarios')}> SCENARIO RUNNER </button>
          <button style={tabStyle('training')}  onClick={() => setActiveTab('training')}>  TRAINING        </button>
          <button style={tabStyle('labeller')}  onClick={() => setActiveTab('labeller')}>  RISK LABELLER   </button>
          <button style={tabStyle('ranking')}   onClick={() => setActiveTab('ranking')}>   DEVICE RANKING  </button>
        </div>
      </div>

      {activeTab === 'task'      && <TaskModeTab savedRecords={taskRecords} onCapture={r => setTaskRecords(prev => [r, ...prev])} />}
      {activeTab === 'unified'   && <UnifiedDatasetTab taskRecords={taskRecords} scenarioRecords={lastScenarioRecords} onClearTask={() => setTaskRecords([])} />}
      {activeTab === 'datasets'  && <DatasetsTab />}
      {activeTab === 'scenarios' && <ScenarioRunnerTab onLastRunChange={setLastScenarioRecords} />}
      {activeTab === 'training'  && <TrainingTab />}
      {activeTab === 'labeller'  && <RiskLabellerTab lastScenarioRecords={lastScenarioRecords} />}
      {activeTab === 'ranking'   && <DeviceRanking />}
    </div>
  );
}
