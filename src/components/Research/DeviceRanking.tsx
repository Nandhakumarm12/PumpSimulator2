/**
 * DeviceRanking — upload training CSVs, aggregate by device (and optionally by
 * drug), then display a ranked comparison table with sortable columns.
 *
 * Workflow:
 *   1. Drag-and-drop (or click-browse) one or more CSV files.
 *   2. Each file is parsed into DeviceRankingRecord[].
 *      Combined CSVs (pump_model column present) are split automatically.
 *      Single-device CSVs can be labelled manually via a dropdown.
 *   3. Optionally filter by drug.
 *   4. Click ANALYSE → ranks devices → shows summary cards + sortable table.
 *   5. Click any table row to expand full 4-layer detail.
 */

import { useState, useCallback, useRef } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { T } from '../../styles/tokens';
import { parseCSV } from '../../ai/csvParser';
import type { DeviceRankingRecord } from '../../ai/csvParser';
import { aggregateByDevice, getUniqueDrugs } from '../../ai/deviceAggregator';
import { rankDevices, modelDisplayName, GRADE_COLOR } from '../../ai/deviceRanker';
import type { RankedDevice } from '../../ai/deviceRanker';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LoadedFile {
  id:              string;
  name:            string;
  records:         DeviceRankingRecord[];
  skipped:         number;
  detectedModels:  string[];
  /** If the CSV has no pump_model column, user can override here. */
  forceModel:      string;
}

type SortCol =
  | 'rank' | 'session_count' | 'rank_score' | 'mean_risk_score'
  | 'risk_high_pct' | 'mean_relative_error' | 'guardrail_override_pct'
  | 'drug_library_used_pct' | 'vtbi_set_pct' | 'confirmed_incorrect_pct';

const MODEL_OPTIONS = [
  { value: '',                label: 'Auto-detect' },
  { value: 'alaris_gp',       label: 'Alaris GP' },
  { value: 'braun_infusomat', label: 'B. Braun Infusomat' },
  { value: 'graseby_3100',    label: 'Graseby 3100' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: number, decimals = 3): string { return v.toFixed(decimals); }
function pct(v: number): string { return `${(v * 100).toFixed(1)}%`; }
function ms(v: number): string { return v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`; }

// ─── StatRow sub-component ────────────────────────────────────────────────────

function StatRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  const C = useTheme();
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
      <span style={{ color: C.text.dim, fontSize: T.nano }}>{label}</span>
      <span style={{
        color: highlight ? C.accent.amber : C.text.primary,
        fontSize: T.nano,
        fontWeight: highlight ? 700 : 400,
      }}>{value}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DeviceRanking() {
  const C = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files,       setFiles]       = useState<LoadedFile[]>([]);
  const [drugFilter,  setDrugFilter]  = useState<string>('all');
  const [ranked,      setRanked]      = useState<RankedDevice[] | null>(null);
  const [sortCol,     setSortCol]     = useState<SortCol>('rank');
  const [sortDir,     setSortDir]     = useState<'asc' | 'desc'>('asc');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [dragging,    setDragging]    = useState(false);

  // ── File loading ────────────────────────────────────────────────────────────

  function ingestFiles(fileList: FileList | null) {
    if (!fileList) return;
    Array.from(fileList).forEach(file => {
      const reader = new FileReader();
      reader.onload = e => {
        const text = e.target?.result as string ?? '';
        const { records, skipped } = parseCSV(text);
        const detectedModels = [...new Set(records.map(r => r.pump_model))];
        setFiles(prev => [
          ...prev,
          { id: `${file.name}-${Date.now()}`, name: file.name, records, skipped, detectedModels, forceModel: '' },
        ]);
        setRanked(null);
      };
      reader.readAsText(file);
    });
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    ingestFiles(e.dataTransfer.files);
  }, []);

  function removeFile(id: string) {
    setFiles(prev => prev.filter(f => f.id !== id));
    setRanked(null);
  }

  function setFileModel(id: string, model: string) {
    setFiles(prev => prev.map(f => {
      if (f.id !== id) return f;
      // Re-parse with override applied
      return { ...f, forceModel: model, records: f.records.map(r => ({ ...r, pump_model: model || r.pump_model })) };
    }));
    setRanked(null);
  }

  // ── Analysis ────────────────────────────────────────────────────────────────

  const allRecords: DeviceRankingRecord[] = files.flatMap(f => f.records);
  const allDrugs = getUniqueDrugs(allRecords);
  const uniqueModels = [...new Set(allRecords.map(r => r.pump_model))];

  function analyse() {
    const filter = drugFilter === 'all' ? null : drugFilter;
    const stats  = aggregateByDevice(allRecords, filter);
    setRanked(rankDevices(stats));
    setExpandedRow(null);
  }

  // ── Sorting ─────────────────────────────────────────────────────────────────

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  const sorted: RankedDevice[] = ranked
    ? [...ranked].sort((a, b) => {
        const av = a[sortCol] as number;
        const bv = b[sortCol] as number;
        return sortDir === 'asc' ? av - bv : bv - av;
      })
    : [];

  // ── Style helpers ───────────────────────────────────────────────────────────

  const card: React.CSSProperties = {
    background: C.bg.panel,
    border:     `1px solid ${C.border.default}`,
    borderRadius: 10,
    padding: 16,
  };

  function thStyle(col: SortCol): React.CSSProperties {
    const active = sortCol === col;
    return {
      padding: '8px 10px',
      cursor: 'pointer',
      userSelect: 'none',
      color: active ? C.accent.blue : C.text.secondary,
      fontSize: T.nano,
      letterSpacing: 1,
      textAlign: 'left',
      borderBottom: `1px solid ${C.border.default}`,
      whiteSpace: 'nowrap',
      background: C.bg.hover,
    };
  }

  function sortArrow(col: SortCol) {
    if (sortCol !== col) return <span style={{ color: C.text.dim, marginLeft: 3 }}>↕</span>;
    return <span style={{ color: C.accent.blue, marginLeft: 3 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Upload zone ─────────────────────────────────────────────────────── */}
      <div style={card}>
        <div style={{ color: C.text.secondary, fontSize: T.nano, letterSpacing: 2, marginBottom: 12 }}>
          UPLOAD TRAINING DATA
        </div>

        {/* Drop target */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border:       `2px dashed ${dragging ? C.accent.blue : C.border.default}`,
            borderRadius: 8,
            padding:      '28px 16px',
            textAlign:    'center',
            cursor:       'pointer',
            background:   dragging ? C.bg.hover : 'transparent',
            transition:   'all 0.15s',
            marginBottom: files.length ? 14 : 0,
          }}>
          <div style={{ color: dragging ? C.accent.blue : C.text.secondary, fontSize: T.sm, letterSpacing: 1 }}>
            {dragging ? '↓  DROP HERE' : 'DROP CSV(s) HERE'}
          </div>
          <div style={{ color: C.text.dim, fontSize: T.nano, marginTop: 6 }}>
            or click to browse — Alaris, B. Braun, Graseby or combined CSV with pump_model column
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          multiple
          style={{ display: 'none' }}
          onChange={e => { ingestFiles(e.target.files); e.target.value = ''; }}
        />

        {/* Loaded files list */}
        {files.map(f => (
          <div key={f.id} style={{
            display:      'flex',
            alignItems:   'center',
            gap:          10,
            marginTop:    8,
            background:   C.bg.hover,
            borderRadius: 6,
            padding:      '8px 12px',
            flexWrap:     'wrap',
          }}>
            <div style={{ color: C.accent.green, fontSize: T.xs, flexShrink: 0 }}>✓</div>

            {/* File info */}
            <div style={{ flex: 1, minWidth: 120 }}>
              <div style={{ color: C.text.primary, fontSize: T.nano }}>{f.name}</div>
              <div style={{ color: C.text.dim, fontSize: T.nano, marginTop: 2 }}>
                {f.records.length} records
                {f.skipped > 0 && <span style={{ color: C.accent.amber }}> · {f.skipped} skipped</span>}
                {f.detectedModels.length > 0 && (
                  <span style={{ color: C.text.secondary }}>
                    {' · '}{f.detectedModels.map(modelDisplayName).join(', ')}
                  </span>
                )}
              </div>
            </div>

            {/* Model override */}
            <select
              value={f.forceModel}
              onClick={e => e.stopPropagation()}
              onChange={e => setFileModel(f.id, e.target.value)}
              style={{
                background: C.bg.panel,
                border:     `1px solid ${C.border.default}`,
                color:      C.text.secondary,
                fontSize:   T.nano,
                padding:    '3px 6px',
                borderRadius: 4,
                fontFamily: "'Share Tech Mono', monospace",
                cursor:     'pointer',
                flexShrink: 0,
              }}>
              {MODEL_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            {/* Remove */}
            <button
              onClick={() => removeFile(f.id)}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: C.accent.red, fontSize: T.md, lineHeight: 1,
                padding: '0 4px', flexShrink: 0,
              }}>×</button>
          </div>
        ))}
      </div>

      {/* ── Controls ────────────────────────────────────────────────────────── */}
      {files.length > 0 && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ color: C.text.secondary, fontSize: T.nano, letterSpacing: 1, flexShrink: 0 }}>
            FILTER BY DRUG:
          </div>
          <select
            value={drugFilter}
            onChange={e => { setDrugFilter(e.target.value); setRanked(null); }}
            style={{
              background: C.bg.panel,
              border:     `1px solid ${C.border.default}`,
              color:      C.text.primary,
              fontSize:   T.nano,
              padding:    '5px 10px',
              borderRadius: 4,
              fontFamily: "'Share Tech Mono', monospace",
              cursor:     'pointer',
            }}>
            <option value="all">ALL DRUGS</option>
            {allDrugs.map(d => (
              <option key={d} value={d}>{d.toUpperCase()}</option>
            ))}
          </select>

          <div style={{ color: C.text.dim, fontSize: T.nano }}>
            {allRecords.length} records · {uniqueModels.length} device(s)
          </div>

          <button
            onClick={analyse}
            disabled={allRecords.length === 0}
            style={{
              marginLeft:   'auto',
              background:   allRecords.length ? C.bg.hover : C.bg.inset,
              border:       `1px solid ${allRecords.length ? C.accent.blue + '66' : C.border.default}`,
              color:        allRecords.length ? C.accent.blue : C.text.dim,
              fontSize:     T.nano,
              letterSpacing: 2,
              padding:      '9px 24px',
              borderRadius: 6,
              cursor:       allRecords.length ? 'pointer' : 'not-allowed',
              fontFamily:   "'Share Tech Mono', monospace",
              transition:   'all 0.15s',
            }}>
            ▶ ANALYSE
          </button>
        </div>
      )}

      {/* ── No-results state ─────────────────────────────────────────────────── */}
      {ranked !== null && ranked.length === 0 && (
        <div style={{ ...card, textAlign: 'center', padding: '30px 20px', color: C.text.secondary }}>
          No records match the selected drug filter. Try "ALL DRUGS" or upload additional data.
        </div>
      )}

      {/* ── Results ──────────────────────────────────────────────────────────── */}
      {ranked !== null && ranked.length > 0 && (
        <>
          {/* Section header */}
          <div style={{ color: C.text.secondary, fontSize: T.nano, letterSpacing: 2 }}>
            DEVICE RANKING
            {drugFilter !== 'all' && (
              <span style={{ color: C.accent.amber, marginLeft: 8 }}>
                — {drugFilter.toUpperCase()} ONLY
              </span>
            )}
          </div>

          {/* ── Summary cards ────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {ranked.map(d => {
              const gradeColor = GRADE_COLOR[d.rank_grade];
              const rankColor  = d.rank === 1 ? C.accent.green : d.rank === 2 ? C.accent.blue : C.text.dim;
              return (
                <div key={d.pump_model} style={{
                  ...card,
                  flex:        '1 1 200px',
                  minWidth:    190,
                  borderColor: d.rank === 1 ? C.accent.green + '66' : C.border.default,
                }}>
                  {/* Rank + grade badges */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%',
                      background: rankColor,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#000', fontSize: T.nano, fontWeight: 700, flexShrink: 0,
                    }}>#{d.rank}</div>
                    <div style={{
                      background:   gradeColor + '22',
                      border:       `1px solid ${gradeColor}66`,
                      color:        gradeColor,
                      borderRadius: 4,
                      padding:      '2px 10px',
                      fontSize:     T.sm,
                      fontWeight:   700,
                    }}>{d.rank_grade}</div>
                  </div>

                  {/* Device name */}
                  <div style={{ color: C.text.primary, fontSize: T.xs, fontWeight: 600, marginBottom: 2 }}>
                    {modelDisplayName(d.pump_model)}
                  </div>
                  <div style={{ color: C.text.dim, fontSize: T.nano, marginBottom: 12 }}>
                    {d.session_count} sessions
                    {d.drug_filter && <span style={{ color: C.accent.amber }}> · {d.drug_filter}</span>}
                  </div>

                  {/* Risk distribution bar */}
                  <div style={{ height: 8, borderRadius: 4, overflow: 'hidden', display: 'flex', marginBottom: 5 }}>
                    <div style={{ flex: d.risk_low_pct,    background: C.accent.green, transition: 'flex 0.4s' }} />
                    <div style={{ flex: d.risk_medium_pct, background: C.accent.amber, transition: 'flex 0.4s' }} />
                    <div style={{ flex: d.risk_high_pct,   background: C.accent.red,   transition: 'flex 0.4s' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ color: C.accent.green, fontSize: T.nano }}>{pct(d.risk_low_pct)} LOW</span>
                    <span style={{ color: C.accent.amber, fontSize: T.nano }}>{pct(d.risk_medium_pct)} MED</span>
                    <span style={{ color: C.accent.red,   fontSize: T.nano }}>{pct(d.risk_high_pct)} HIGH</span>
                  </div>

                  {/* Key metrics */}
                  <div style={{ borderTop: `1px solid ${C.border.subtle}`, paddingTop: 8 }}>
                    <StatRow label="Rank score"  value={fmt(d.rank_score)} />
                    <StatRow label="Rel. error"  value={pct(d.mean_relative_error)} highlight={d.mean_relative_error > 0.2} />
                    <StatRow label="Override %"  value={pct(d.guardrail_override_pct)} highlight={d.guardrail_override_pct > 0.1} />
                    <StatRow label="Lib used %"  value={pct(d.drug_library_used_pct)} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Sortable table ────────────────────────────────────────────────── */}
          <div style={card}>
            <div style={{ color: C.text.secondary, fontSize: T.nano, letterSpacing: 2, marginBottom: 12 }}>
              COMPARISON TABLE
              <span style={{ color: C.text.dim, marginLeft: 8, letterSpacing: 0, fontStyle: 'italic' }}>
                click headers to sort · click row to expand 4-layer detail
              </span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{
                width: '100%', borderCollapse: 'collapse',
                fontSize: T.nano, fontFamily: "'Share Tech Mono', monospace",
              }}>
                <thead>
                  <tr>
                    <th onClick={() => toggleSort('rank')}                    style={thStyle('rank')}>RANK {sortArrow('rank')}</th>
                    <th style={{ ...thStyle('rank'), cursor: 'default' }}>   DEVICE</th>
                    <th onClick={() => toggleSort('session_count')}            style={thStyle('session_count')}>SESSIONS {sortArrow('session_count')}</th>
                    <th style={{ ...thStyle('rank'), cursor: 'default' }}>   GRADE</th>
                    <th onClick={() => toggleSort('rank_score')}               style={thStyle('rank_score')}>RANK SCORE {sortArrow('rank_score')}</th>
                    <th onClick={() => toggleSort('mean_risk_score')}          style={thStyle('mean_risk_score')}>RISK SCORE {sortArrow('mean_risk_score')}</th>
                    <th onClick={() => toggleSort('risk_high_pct')}            style={thStyle('risk_high_pct')}>HIGH% {sortArrow('risk_high_pct')}</th>
                    <th onClick={() => toggleSort('mean_relative_error')}      style={thStyle('mean_relative_error')}>REL. ERROR {sortArrow('mean_relative_error')}</th>
                    <th onClick={() => toggleSort('guardrail_override_pct')}   style={thStyle('guardrail_override_pct')}>OVERRIDE% {sortArrow('guardrail_override_pct')}</th>
                    <th onClick={() => toggleSort('drug_library_used_pct')}    style={thStyle('drug_library_used_pct')}>LIB USED% {sortArrow('drug_library_used_pct')}</th>
                    <th onClick={() => toggleSort('vtbi_set_pct')}             style={thStyle('vtbi_set_pct')}>VTBI SET% {sortArrow('vtbi_set_pct')}</th>
                    <th onClick={() => toggleSort('confirmed_incorrect_pct')}  style={thStyle('confirmed_incorrect_pct')}>WRONG% {sortArrow('confirmed_incorrect_pct')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(d => {
                    const gradeColor = GRADE_COLOR[d.rank_grade];
                    const isExpanded = expandedRow === d.pump_model;
                    return (
                      <>
                        <tr
                          key={d.pump_model}
                          onClick={() => setExpandedRow(isExpanded ? null : d.pump_model)}
                          style={{
                            borderBottom: `1px solid ${C.border.subtle}`,
                            cursor:       'pointer',
                            background:   isExpanded ? C.bg.hover : 'transparent',
                            transition:   'background 0.1s',
                          }}
                          onMouseEnter={e => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = C.bg.inset; }}
                          onMouseLeave={e => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                        >
                          <td style={{ padding: '10px', color: d.rank === 1 ? C.accent.green : C.text.primary, fontWeight: d.rank === 1 ? 700 : 400 }}>
                            #{d.rank}
                          </td>
                          <td style={{ padding: '10px', color: C.text.primary, fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {modelDisplayName(d.pump_model)}
                          </td>
                          <td style={{ padding: '10px', color: C.text.secondary }}>{d.session_count}</td>
                          <td style={{ padding: '10px' }}>
                            <span style={{
                              background: gradeColor + '22', color: gradeColor,
                              padding: '2px 7px', borderRadius: 3, fontWeight: 700,
                            }}>{d.rank_grade}</span>
                          </td>
                          <td style={{ padding: '10px', color: C.text.primary, fontWeight: 700 }}>{fmt(d.rank_score)}</td>
                          <td style={{ padding: '10px', color: C.text.secondary }}>{fmt(d.mean_risk_score)}</td>
                          <td style={{ padding: '10px', color: d.risk_high_pct > 0.3 ? C.accent.red : C.text.secondary }}>{pct(d.risk_high_pct)}</td>
                          <td style={{ padding: '10px', color: d.mean_relative_error > 0.2 ? C.accent.amber : C.text.secondary }}>{pct(d.mean_relative_error)}</td>
                          <td style={{ padding: '10px', color: d.guardrail_override_pct > 0.1 ? C.accent.amber : C.text.secondary }}>{pct(d.guardrail_override_pct)}</td>
                          <td style={{ padding: '10px', color: d.drug_library_used_pct < 0.5 ? C.accent.red : C.text.secondary }}>{pct(d.drug_library_used_pct)}</td>
                          <td style={{ padding: '10px', color: d.vtbi_set_pct < 0.5 ? C.accent.amber : C.text.secondary }}>{pct(d.vtbi_set_pct)}</td>
                          <td style={{ padding: '10px', color: d.confirmed_incorrect_pct > 0.05 ? C.accent.red : C.text.secondary }}>{pct(d.confirmed_incorrect_pct)}</td>
                        </tr>

                        {/* ── Expanded detail row ── */}
                        {isExpanded && (
                          <tr key={`${d.pump_model}-detail`}>
                            <td colSpan={12} style={{
                              padding: '18px 20px',
                              background: C.bg.inset,
                              borderBottom: `1px solid ${C.border.default}`,
                            }}>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 20 }}>

                                {/* Layer 0 — Design */}
                                <div>
                                  <div style={{ color: C.accent.blue, fontSize: T.nano, letterSpacing: 2, marginBottom: 8 }}>
                                    LAYER 0 — DESIGN
                                  </div>
                                  <StatRow label="Design score" value={fmt(d.mean_design_score)} />
                                  <StatRow label="Composite score" value={fmt(d.mean_composite_score)} />
                                </div>

                                {/* Layer 1 — Interaction */}
                                <div>
                                  <div style={{ color: C.accent.cyan, fontSize: T.nano, letterSpacing: 2, marginBottom: 8 }}>
                                    LAYER 1 — INTERACTION
                                  </div>
                                  <StatRow label="Interaction score"  value={fmt(d.mean_interaction_score)} />
                                  <StatRow label="Mean corrections"   value={d.mean_correction_count.toFixed(1)} />
                                  <StatRow label="Mean entry time"    value={ms(d.mean_entry_time_ms)} />
                                  <StatRow label="Boundary hits"      value={d.mean_boundary_hits.toFixed(1)} />
                                  <StatRow label="Golden path ratio"  value={d.mean_golden_path_ratio.toFixed(2)} />
                                  <StatRow label="Error magnitude"    value={`${d.mean_error_magnitude_ml_h.toFixed(2)} ml/h`} />
                                </div>

                                {/* Layer 2 — Configuration */}
                                <div>
                                  <div style={{ color: C.accent.amber, fontSize: T.nano, letterSpacing: 2, marginBottom: 8 }}>
                                    LAYER 2 — CONFIGURATION
                                  </div>
                                  <StatRow label="Config score"       value={fmt(d.mean_configuration_score)} />
                                  <StatRow label="Drug library used"  value={pct(d.drug_library_used_pct)} highlight={d.drug_library_used_pct < 0.5} />
                                  <StatRow label="VTBI set"           value={pct(d.vtbi_set_pct)} highlight={d.vtbi_set_pct < 0.5} />
                                  <StatRow label="Guardrail warn"     value={pct(d.guardrail_warning_pct)} />
                                  <StatRow label="Override"           value={pct(d.guardrail_override_pct)} highlight={d.guardrail_override_pct > 0.1} />
                                  <StatRow label="Blocked (hard)"     value={pct(d.guardrail_blocked_pct)} />
                                  <StatRow label="Bolus delivered"    value={pct(d.bolus_delivered_pct)} />
                                </div>

                                {/* Layer 3 — System */}
                                <div>
                                  <div style={{ color: C.accent.green, fontSize: T.nano, letterSpacing: 2, marginBottom: 8 }}>
                                    LAYER 3 — SYSTEM
                                  </div>
                                  <StatRow label="System score"       value={fmt(d.mean_system_score)} />
                                  <StatRow label="Battery level"      value={`${d.mean_battery_pct.toFixed(0)}%`} highlight={d.mean_battery_pct < 20} />
                                  <StatRow label="Network connected"  value={pct(d.network_connected_pct)} />
                                  <StatRow label="Firmware CVE"       value={pct(d.firmware_cve_pct)} highlight={d.firmware_cve_pct > 0} />
                                  <StatRow label="Days since maint."  value={d.mean_days_maintenance.toFixed(0)} highlight={d.mean_days_maintenance > 365} />
                                  <StatRow label="Config drift"       value={d.mean_config_drift.toFixed(2)} />
                                  <StatRow label="Occlusion alarms"   value={d.mean_occlusion_alarms.toFixed(1)} />
                                </div>
                              </div>

                              {/* Drugs in dataset */}
                              <div style={{
                                marginTop: 14, paddingTop: 10,
                                borderTop: `1px solid ${C.border.subtle}`,
                                color: C.text.dim, fontSize: T.nano,
                              }}>
                                Drugs in dataset: {d.drugs_seen.join(' · ')}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Formula reference ─────────────────────────────────────────────── */}
          <div style={{
            background: C.bg.panel,
            border:     `1px solid ${C.border.default}`,
            borderRadius: 8,
            padding:    '12px 16px',
          }}>
            <div style={{ color: C.text.secondary, fontSize: T.nano, letterSpacing: 2, marginBottom: 6 }}>
              RANKING FORMULA
            </div>
            <div style={{ color: C.text.dim, fontSize: T.nano, lineHeight: 2, fontFamily: "'Share Tech Mono', monospace" }}>
              rank_score = 0.30 × mean_risk_score + 0.25 × mean_relative_error + 0.20 × risk_high_pct + 0.15 × guardrail_override_pct + 0.10 × confirmed_incorrect_pct
            </div>
            <div style={{ color: C.text.dim, fontSize: T.nano, marginTop: 6, lineHeight: 1.8 }}>
              Lower score = safer device &nbsp;|&nbsp;
              A+ ≤ 0.15 &nbsp; A ≤ 0.25 &nbsp; B ≤ 0.38 &nbsp; C ≤ 0.52 &nbsp; D ≤ 0.65 &nbsp; E ≤ 0.80 &nbsp; F &gt; 0.80
            </div>
          </div>
        </>
      )}

      {/* ── Empty state (no files yet) ─────────────────────────────────────── */}
      {files.length === 0 && (
        <div style={{
          ...card,
          textAlign: 'center',
          padding: '40px 20px',
          color: C.text.dim,
        }}>
          <div style={{ fontSize: T.lg, marginBottom: 10 }}>↑</div>
          <div style={{ fontSize: T.nano, letterSpacing: 1, marginBottom: 6 }}>
            Upload CSV files exported from SCENARIO RUNNER or UNIFIED VIEW to compare devices.
          </div>
          <div style={{ fontSize: T.nano, color: C.text.dim }}>
            Combined CSVs (pump_model column) are split automatically.
            Single-device CSVs can be labelled using the dropdown next to each file.
          </div>
        </div>
      )}
    </div>
  );
}
