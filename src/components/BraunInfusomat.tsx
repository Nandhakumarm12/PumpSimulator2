/**
 * BraunInfusomat — React UI component for the B. Braun Infusomat Space LVP simulator.
 *
 * ARCHITECTURE ROLE:
 *   Presentation layer only — all business logic lives in useBraunPump.ts and
 *   the pure state machine in src/pump/braun/. This component renders state and
 *   calls handler functions; it contains no pump logic.
 *
 * VISUAL DESIGN:
 *   B. Braun colour scheme: blue/white LCD (vs Alaris GP green/black LCD).
 *   Blue-grey body, white screen bezel, B. Braun corporate blue (#0055A4) accents.
 *
 * KEY FEATURE SHOWN HERE (unique to B. Braun):
 *   Three-tier guardrail — the GUARDRAIL_ADVISORY screen has an "ACKNOWLEDGE"
 *   softkey not present in the Alaris GP simulator.
 *
 * SOURCE:
 *   B. Braun Infusomat Space IFU — device layout and button positions.
 *   CLAUDE.md Step 4 — B. Braun UI Tab specification.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useBraunPump } from '../hooks/useBraunPump';
import { BRAUN_DEFAULTS } from '../pump/braun/braunConstants';
import { rateToMlH, computeTimeRemaining, formatTime } from '../pump/display';
import { checkBraunGuardrail } from '../pump/braun/braunGuardrails';
import type { Drug } from '../pump/types';
import { useTheme } from '../contexts/ThemeContext';
import { T } from '../styles/tokens';

// ── Colour palette (B. Braun brand) ─────────────────────────────────────────
const C = {
  bodyBg:    '#1a2535',
  bodyBorder:'#0d1828',
  screenBg:  '#e8f0f8',
  screenBorder: '#b0c4d8',
  lcdText:   '#001f5c',
  lcdDim:    '#5a7898',
  lcdBright: '#0055a4',
  lcdAlert:  '#cc2200',
  lcdAdvisory: '#b07000',
  btnBlue:   '#0055a4',
  btnBlueDark:'#003a7a',
  btnRed:    '#c00020',
  btnGreen:  '#007030',
  btnGrey:   '#2a3a4a',
  btnText:   '#ffffff',
  chevronBg: '#0d1e35',
  chevronBorder: '#1a3a5a',
  chevronText: '#4a9eff',
  indicatorOn: '#4a9eff',
  ledGreen:  '#00cc44',
  ledAmber:  '#ffaa00',
  ledRed:    '#ff3300',
  spacecom2On:  '#00cc88',
  spacecom2Off: '#555555',
};

// ── Sub-components ───────────────────────────────────────────────────────────

function LcdLine({
  text,
  bright,
  dim,
  alert,
  advisory,
  bold,
  size,
}: {
  text: string;
  bright?: boolean;
  dim?: boolean;
  alert?: boolean;
  advisory?: boolean;
  bold?: boolean;
  size?: number;
}) {
  let color = C.lcdText;
  if (bright) color = C.lcdBright;
  if (dim)    color = C.lcdDim;
  if (alert)  color = C.lcdAlert;
  if (advisory) color = C.lcdAdvisory;

  return (
    <div style={{
      color,
      fontSize: size ?? T.nano,
      fontWeight: bold ? 700 : 400,
      letterSpacing: bright ? 1 : 0,
      marginBottom: 2,
      fontFamily: "'Share Tech Mono', monospace",
      textShadow: bright ? `0 0 6px ${C.lcdBright}44` : 'none',
    }}>{text}</div>
  );
}

interface ChevronButtonProps {
  label: string;
  onPressDown: () => void;
  onRelease: () => void;
}

function ChevronButton({ label, onPressDown, onRelease }: ChevronButtonProps) {
  return (
    <button
      onMouseDown={e => { e.preventDefault(); onPressDown(); }}
      onMouseUp={onRelease}
      onMouseLeave={onRelease}
      onTouchStart={e => { e.preventDefault(); onPressDown(); }}
      onTouchEnd={onRelease}
      style={{
        background: `linear-gradient(180deg, ${C.chevronBg} 0%, #060f1a 100%)`,
        border: `1px solid ${C.chevronBorder}`,
        borderRadius: 6,
        color: C.chevronText,
        fontSize: T.md,
        fontWeight: 'bold',
        width: 52,
        height: 34,
        cursor: 'pointer',
        userSelect: 'none',
        boxShadow: '0 2px 4px rgba(0,0,0,0.6)',
      }}>
      {label}
    </button>
  );
}

interface SoftkeyProps {
  label: string;
  primary?: boolean;
  danger?: boolean;
  advisory?: boolean;
  onClick: () => void;
}

function Softkey({ label, primary, danger, advisory, onClick }: SoftkeyProps) {
  let bg = C.btnGrey;
  if (primary)  bg = C.btnBlue;
  if (danger)   bg = C.btnRed;
  if (advisory) bg = '#7a5500';

  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        background: label ? bg : 'transparent',
        border: label ? `1px solid ${bg}88` : 'none',
        borderRadius: 4,
        color: label ? C.btnText : 'transparent',
        fontSize: T.nano,
        letterSpacing: 1,
        padding: '5px 2px',
        cursor: label ? 'pointer' : 'default',
        fontFamily: "'Share Tech Mono', monospace",
        fontWeight: 600,
        minHeight: 28,
        transition: 'all 0.08s',
      }}>
      {label}
    </button>
  );
}

interface ActionButtonProps {
  label: string;
  color: string;
  activeColor?: string;
  active?: boolean;
  led?: boolean;
  ledColor?: string;
  onClick?: () => void;
  onMouseDown?: () => void;
  onMouseUp?: () => void;
  onMouseLeave?: () => void;
}

function ActionButton({
  label, color, activeColor, active, led, ledColor,
  onClick, onMouseDown, onMouseUp, onMouseLeave,
}: ActionButtonProps) {
  const [pressed, setPressed] = useState(false);
  const bg = pressed || active ? (activeColor ?? color) : color;
  return (
    <button
      onClick={onClick}
      onMouseDown={() => { setPressed(true); onMouseDown?.(); }}
      onMouseUp={() => { setPressed(false); onMouseUp?.(); }}
      onMouseLeave={() => { setPressed(false); onMouseLeave?.(); }}
      style={{
        background: bg,
        border: `1px solid ${bg}cc`,
        borderRadius: 6,
        padding: '5px 3px',
        cursor: 'pointer',
        transition: 'all 0.08s',
        transform: pressed ? 'scale(0.92)' : 'scale(1)',
        boxShadow: pressed ? 'none' : '0 2px 4px rgba(0,0,0,0.5)',
        minWidth: 46,
      }}>
      {led && ledColor && (
        <div style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: active ? ledColor : '#333',
          boxShadow: active ? `0 0 6px ${ledColor}` : 'none',
          margin: '0 auto 3px',
          animation: active ? 'ledPulse 1s ease-in-out infinite' : 'none',
        }} />
      )}
      <div style={{
        color: pressed || active ? '#fff' : '#aac0d8',
        fontSize: T.nano,
        letterSpacing: 1,
        fontWeight: 600,
        fontFamily: "'Share Tech Mono', monospace",
      }}>{label}</div>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const BRAUN_LS_KEYS = ['braun_pump_state', 'braun_session_log', 'braun_session_start'];

export default function BraunInfusomat() {
  const TK = useTheme();
  const pump = useBraunPump();
  const { pumpState, drugLibrary } = pump;
  const [showLog, setShowLog] = useState(false);
  const [flash, setFlashState] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const prevScreen = useRef(pumpState.screen);

  const handleReset = useCallback(() => {
    if (!confirmReset) { setConfirmReset(true); return; }
    BRAUN_LS_KEYS.forEach(k => { try { localStorage.removeItem(k); } catch { /* ignore */ } });
    window.location.reload();
  }, [confirmReset]);

  // Flash LCD background on screen transitions
  function triggerFlash(type: string) {
    setFlashState(type);
    setTimeout(() => setFlashState(null), 400);
  }

  useEffect(() => {
    const prev = prevScreen.current;
    const curr = pumpState.screen;
    if (curr !== prev) {
      if (curr === 'ALARM') triggerFlash('alarm');
      else if (curr === 'GUARDRAIL_WARNING') triggerFlash('warning');
      else if (curr === 'GUARDRAIL_BLOCKED') triggerFlash('alarm');
      else if (curr === 'GUARDRAIL_ADVISORY') triggerFlash('advisory');
      prevScreen.current = curr;
    }
  }, [pumpState.screen]);

  // Derived values
  const drug = drugLibrary.find(d => d.id === pumpState.selectedDrugId) ?? drugLibrary[0];
  const displayRate = pumpState.screen === 'VTBI_ENTRY' ? pumpState.rate : pumpState.rate;
  const mlH = rateToMlH(displayRate, drug, pumpState.patientWeightKg);
  const timeRemaining = computeTimeRemaining(pumpState.vtbi, pumpState.volumeInfused, mlH);
  const guardrailStatus = checkBraunGuardrail(pumpState.rate, drug);

  // LCD background flash colour
  function getScreenBg() {
    if (flash === 'alarm') return '#ffe8e8';
    if (flash === 'warning') return '#fff4e0';
    if (flash === 'advisory') return '#fffbe0';
    return C.screenBg;
  }

  // ── Context-sensitive softkeys ──────────────────────────────────────────────
  function getSoftkeys(): Array<{ label: string; primary?: boolean; danger?: boolean; advisory?: boolean; action: () => void }> {
    switch (pumpState.screen) {
      case 'STARTUP':
        return [
          { label: 'BOOT', primary: true, action: pump.handleBoot },
          { label: '', action: () => {} },
          { label: '', action: () => {} },
        ];
      case 'DRUG_SELECT':
        return [
          { label: 'SELECT', primary: true, action: pump.handleConfirmDrugSelection },
          { label: '▲', action: () => pump.handleMoveDrugCursor(-1) },
          { label: '▼', action: () => pump.handleMoveDrugCursor(1) },
        ];
      case 'RATE_ENTRY':
        return [
          { label: 'RUN', primary: true, action: pump.handleRun },
          { label: 'VTBI', action: pump.handleOpenVtbi },
          { label: 'DRUG', action: pump.handleConfirmDrugSelection },
        ];
      case 'VTBI_ENTRY':
        return [
          { label: 'OK', primary: true, action: pump.handleConfirmVtbi },
          { label: 'CLR', action: pump.handleClearVtbi },
          { label: 'BACK', action: pump.handleBack },
        ];
      case 'GUARDRAIL_ADVISORY':
        return [
          { label: 'ACKNOWLEDGE', advisory: true, action: pump.handleAcknowledgeAdvisory },
          { label: 'RE-ENTER', action: pump.handleReEnterRate },
          { label: '', action: () => {} },
        ];
      case 'GUARDRAIL_WARNING':
        return [
          { label: 'OVERRIDE', danger: true, action: pump.handleOverrideGuardrail },
          { label: 'RE-ENTER', action: pump.handleReEnterRate },
          { label: '', action: () => {} },
        ];
      case 'GUARDRAIL_BLOCKED':
        return [
          { label: 'RE-ENTER', primary: true, action: pump.handleReEnterRate },
          { label: '', action: () => {} },
          { label: '', action: () => {} },
        ];
      case 'RUNNING':
        return [
          { label: 'VTBI', action: pump.handleOpenVtbi },
          { label: 'CLEAR VI', action: pump.handleClearVolume },
          { label: 'OPTIONS', action: pump.handleOptions },
        ];
      case 'ON_HOLD':
        return [
          { label: 'RESUME', primary: true, action: pump.handleRun },
          { label: 'RE-PROG', action: pump.handleReprogramRate },
          { label: 'OPTIONS', action: pump.handleOptions },
        ];
      case 'ALARM':
        return [
          { label: 'SILENCE', primary: true, action: pump.handleSilenceAlarm },
          { label: '', action: () => {} },
          { label: '', action: () => {} },
        ];
      case 'OPTIONS':
        return [
          { label: 'SET VTBI', action: pump.handleOpenVtbi },
          { label: 'LOG', action: () => setShowLog(true) },
          { label: 'BACK', action: pump.handleBack },
        ];
      case 'PRESSURE_VIEW':
        return [
          { label: '', action: () => {} },
          { label: '', action: () => {} },
          { label: 'BACK', action: pump.handleBack },
        ];
      default:
        return [{ label: '', action: () => {} }, { label: '', action: () => {} }, { label: '', action: () => {} }];
    }
  }

  // ── Display renderer ────────────────────────────────────────────────────────
  function renderDisplay() {
    const { screen, rate, vtbi, vtbiSet, volumeInfused, pressureLevel, alarmMessage,
            spacecom2Connected, firmwareSigned, guardrailAdvisoryShown } = pumpState;

    switch (screen) {
      case 'STARTUP':
        return (
          <div style={{ paddingTop: 20, textAlign: 'center' }}>
            <LcdLine text="B. BRAUN" bright bold size={16} />
            <LcdLine text="INFUSOMAT SPACE" bright size={13} />
            <LcdLine text="─────────────────" dim />
            <LcdLine text="SELF TEST..." dim />
            <LcdLine text="" />
            <LcdLine text={`FW: ${BRAUN_DEFAULTS.FIRMWARE_VERSION}`} dim size={10} />
            {!firmwareSigned && (
              <LcdLine text="⚠ UNSIGNED FW (CVE-2021-33885)" alert size={9} />
            )}
          </div>
        );

      case 'DRUG_SELECT':
        return (
          <div style={{ paddingTop: 8 }}>
            <LcdLine text="SELECT DRUG / MODE" dim />
            <div style={{ marginTop: 6, maxHeight: 108, overflowY: 'auto' }}>
              {drugLibrary.map((d: Drug, idx: number) => {
                const isCursor = idx === pumpState.drugCursorIndex;
                return (
                  <div key={d.id}
                    onClick={() => pump.handleDrugSelect(d)}
                    style={{
                      display: 'flex', justifyContent: 'space-between',
                      padding: '3px 4px', cursor: 'pointer',
                      background: isCursor ? '#ccdcee' : 'transparent',
                      borderLeft: isCursor ? `3px solid ${C.lcdBright}` : '3px solid transparent',
                      color: isCursor ? C.lcdBright : C.lcdDim,
                      borderBottom: '1px solid #c8d8e8',
                      fontSize: T.nano,
                    }}>
                    <span>{d.name}</span>
                    <span style={{ fontSize: T.xs, color: C.lcdDim }}>{d.unit}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );

      case 'RATE_ENTRY': {
        const guardrailIndicator =
          guardrailStatus.status === 'advisory' ? '⚡ ADVISORY ZONE' :
          guardrailStatus.status === 'warning'  ? '⚠ SOFT LIMIT'   :
          guardrailStatus.status === 'blocked'  ? '⛔ HARD LIMIT'   : '';
        return (
          <div style={{ paddingTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <LcdLine text={drug.name} bright bold />
              <LcdLine text="PROGRAM" dim />
            </div>
            <LcdLine text="RATE" dim />
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '6px 0' }}>
              <div style={{
                color: C.lcdBright, fontSize: 34, fontWeight: 'bold',
                letterSpacing: 2, textShadow: `0 0 16px ${C.lcdBright}44`,
              }}>
                {rate.toFixed(1)}
              </div>
              <div style={{ color: C.lcdDim, fontSize: T.sm }}>{drug.unit}</div>
            </div>
            {drug.id !== 'manual' && (
              <LcdLine text={`${mlH.toFixed(1)} ml/h`} dim size={10} />
            )}
            {guardrailIndicator && (
              <LcdLine text={guardrailIndicator}
                advisory={guardrailStatus.status === 'advisory'}
                alert={guardrailStatus.status === 'warning' || guardrailStatus.status === 'blocked'}
                size={10} />
            )}
            {vtbiSet && (
              <LcdLine text={`VTBI: ${vtbi} ml`} dim size={10} />
            )}
            {guardrailAdvisoryShown && (
              <LcdLine text="i Advisory shown this session" dim size={9} />
            )}
          </div>
        );
      }

      case 'VTBI_ENTRY':
        return (
          <div style={{ paddingTop: 12 }}>
            <LcdLine text={drug.name} bright bold />
            <LcdLine text="VOLUME TO BE INFUSED" dim />
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '8px 0' }}>
              <div style={{ color: C.lcdBright, fontSize: 34, fontWeight: 'bold', letterSpacing: 2 }}>
                {pumpState.vtbiBuffer.toFixed(1)}
              </div>
              <div style={{ color: C.lcdDim, fontSize: T.sm }}>ml</div>
            </div>
            <LcdLine text={`Range: ${BRAUN_DEFAULTS.VTBI_MIN}–${BRAUN_DEFAULTS.VTBI_MAX} ml`} dim size={10} />
          </div>
        );

      case 'GUARDRAIL_ADVISORY': {
        const gStatus = guardrailStatus.status === 'advisory' ? guardrailStatus : null;
        const [line1, line2] = gStatus ? gStatus.message.split('\n') : ['ADVISORY', ''];
        return (
          <div style={{ paddingTop: 10 }}>
            {/* Tier badge */}
            <div style={{
              background: '#7a5500', borderRadius: 4, padding: '3px 6px',
              marginBottom: 8, textAlign: 'center',
            }}>
              <span style={{ color: '#ffe080', fontSize: T.nano, fontWeight: 700, letterSpacing: 1 }}>
                TIER 1 — CLINICAL ADVISORY
              </span>
            </div>
            <LcdLine text="⚡ APPROACHING LIMIT" advisory bold />
            <LcdLine text={line1} advisory size={11} />
            <LcdLine text={line2} advisory size={11} />
            <div style={{ marginTop: 8, padding: '4px 6px', background: '#f8f0cc', borderRadius: 4 }}>
              <LcdLine text="Infusion will start after" dim size={10} />
              <LcdLine text="acknowledgement." dim size={10} />
            </div>
            <div style={{ marginTop: 6, color: C.lcdDim, fontSize: T.nano }}>
              Soft limits: {drug.softMin}–{drug.softMax} {drug.unit}
            </div>
          </div>
        );
      }

      case 'GUARDRAIL_WARNING': {
        const gStatus = guardrailStatus.status === 'warning' ? guardrailStatus : null;
        const [line1, line2] = gStatus ? gStatus.message.split('\n') : ['SOFT STOP', ''];
        return (
          <div style={{ paddingTop: 10 }}>
            <div style={{
              background: '#7a2000', borderRadius: 4, padding: '3px 6px',
              marginBottom: 8, textAlign: 'center',
            }}>
              <span style={{ color: '#ffb080', fontSize: T.nano, fontWeight: 700, letterSpacing: 1 }}>
                TIER 2 — SOFT STOP
              </span>
            </div>
            <LcdLine text="⚠ RATE EXCEEDS SOFT LIMIT" alert bold />
            <LcdLine text={line1} alert size={11} />
            <LcdLine text={line2} alert size={11} />
            <div style={{ marginTop: 8, padding: '4px 6px', background: '#ffe8e0', borderRadius: 4 }}>
              <LcdLine text="Override to proceed, or" dim size={10} />
              <LcdLine text="re-enter to correct." dim size={10} />
            </div>
            <div style={{ marginTop: 6, color: C.lcdDim, fontSize: T.nano }}>
              Soft limits: {drug.softMin}–{drug.softMax} {drug.unit}
            </div>
          </div>
        );
      }

      case 'GUARDRAIL_BLOCKED': {
        return (
          <div style={{ paddingTop: 10 }}>
            <div style={{
              background: '#550000', borderRadius: 4, padding: '3px 6px',
              marginBottom: 8, textAlign: 'center',
            }}>
              <span style={{ color: '#ff8080', fontSize: T.nano, fontWeight: 700, letterSpacing: 1 }}>
                TIER 3 — HARD STOP
              </span>
            </div>
            <LcdLine text="⛔ RATE EXCEEDS HARD LIMIT" alert bold />
            <LcdLine text={`${rate.toFixed(3)} ${drug.unit}`} alert size={12} />
            <div style={{ marginTop: 8, padding: '4px 6px', background: '#ffe0e0', borderRadius: 4 }}>
              <LcdLine text="Re-entry mandatory." dim size={10} />
              <LcdLine text="Override not permitted." dim size={10} />
            </div>
            <div style={{ marginTop: 6, color: C.lcdDim, fontSize: T.nano }}>
              Hard limits: {drug.hardMin}–{drug.hardMax} {drug.unit}
            </div>
          </div>
        );
      }

      case 'RUNNING': {
        const timeStr = timeRemaining !== null
          ? (timeRemaining > 86400 ? '24+h remaining' : formatTime(timeRemaining))
          : '—';
        return (
          <div style={{ paddingTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <LcdLine text={drug.name + (drug.id !== 'manual' ? ' ●' : '')} bright bold />
              <LcdLine text={pumpState.kvoActive ? 'KVO' : 'RUNNING'} dim />
            </div>
            <LcdLine text="RATE" dim />
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <div style={{ color: C.lcdBright, fontSize: 32, fontWeight: 'bold', letterSpacing: 1 }}>
                {rate.toFixed(1)}
              </div>
              <div style={{ color: C.lcdDim, fontSize: T.xs }}>{drug.unit}</div>
            </div>
            {drug.id !== 'manual' && (
              <LcdLine text={`${mlH.toFixed(1)} ml/h`} dim size={10} />
            )}
            {vtbiSet && (
              <>
                <LcdLine text={`VTBI    ${vtbi.toFixed(1)} ml`} dim size={10} />
                <LcdLine text={`VOLUME  ${volumeInfused.toFixed(1)} ml`} dim size={10} />
                <LcdLine text={timeStr} dim size={10} />
              </>
            )}
            {!vtbiSet && (
              <LcdLine text={`VOL INFUSED: ${volumeInfused.toFixed(1)} ml`} dim size={10} />
            )}
          </div>
        );
      }

      case 'ON_HOLD': {
        return (
          <div style={{ paddingTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <LcdLine text={drug.name} bright bold />
              <LcdLine text="ON HOLD" dim />
            </div>
            <LcdLine text="RATE" dim />
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '4px 0' }}>
              <div style={{ color: C.lcdBright, fontSize: 32, fontWeight: 'bold', letterSpacing: 1 }}>
                {rate.toFixed(1)}
              </div>
              <div style={{ color: C.lcdDim, fontSize: T.xs }}>{drug.unit}</div>
            </div>
            {vtbiSet && (
              <>
                <LcdLine text={`VTBI    ${vtbi.toFixed(1)} ml`} dim size={10} />
                <LcdLine text={`VOLUME  ${volumeInfused.toFixed(1)} ml`} dim size={10} />
              </>
            )}
            {!vtbiSet && (
              <LcdLine text={`VOL INFUSED: ${volumeInfused.toFixed(1)} ml`} dim size={10} />
            )}
          </div>
        );
      }

      case 'ALARM':
        return (
          <div style={{ paddingTop: 16, textAlign: 'center' }}>
            <div style={{ fontSize: T.xl, marginBottom: 8 }}>🔴</div>
            <LcdLine text="ALARM" alert bold size={16} />
            <LcdLine text={alarmMessage} alert size={13} />
            <LcdLine text="" />
            <LcdLine text="Press SILENCE to acknowledge" dim size={9} />
          </div>
        );

      case 'OPTIONS':
        return (
          <div style={{ paddingTop: 12 }}>
            <LcdLine text="OPTIONS" bright bold />
            <div style={{ marginTop: 8 }}>
              {[
                `Drug:  ${drug.name}`,
                `Rate:  ${rate.toFixed(1)} ${drug.unit}`,
                vtbiSet ? `VTBI:  ${vtbi} ml` : 'VTBI:  not set',
                `Vol:   ${volumeInfused.toFixed(1)} ml`,
                `Batt:  ${pumpState.batteryLevel.toFixed(0)}%`,
                `SC2:   ${spacecom2Connected ? 'CONNECTED' : 'DISCONNECTED'}`,
              ].map((line, i) => (
                <LcdLine key={i} text={line} dim size={10} />
              ))}
            </div>
          </div>
        );

      case 'PRESSURE_VIEW':
        return (
          <div style={{ paddingTop: 12 }}>
            <LcdLine text="DPS PRESSURE ALARM" bright bold />
            <LcdLine text="" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '8px 0' }}>
              <div style={{ color: C.lcdBright, fontSize: 28, fontWeight: 'bold' }}>
                L{pressureLevel}
              </div>
              <div style={{ color: C.lcdDim, fontSize: T.nano }}>
                {[50, 100, 150, 200, 300, 400, 600, 750][pressureLevel - 1] ?? '—'} mmHg
              </div>
            </div>
            {/* Pressure bar */}
            <div style={{ display: 'flex', gap: 2, marginTop: 6 }}>
              {Array.from({ length: 8 }, (_, i) => {
                const lvl = i + 1;
                const active = lvl <= pressureLevel;
                const colour = lvl <= 4 ? '#007030' : lvl <= 6 ? '#ffaa00' : '#cc2200';
                return (
                  <div key={lvl} style={{
                    width: 14, height: 20, borderRadius: 2,
                    background: active ? colour : '#c0c8d0',
                    border: `1px solid ${active ? colour : '#b0b8c0'}`,
                  }} />
                );
              })}
            </div>
            <LcdLine text="Use chevrons to adjust" dim size={9} />
          </div>
        );

      default:
        return <LcdLine text="—" dim />;
    }
  }

  const softkeys = getSoftkeys();
  const isRunning = pumpState.screen === 'RUNNING';
  const isHold    = pumpState.screen === 'ON_HOLD';

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-start',
      gap: 32,
      padding: '24px 16px',
      minHeight: '100vh',
      background: TK.bg.page,
      backgroundImage: `radial-gradient(ellipse at 80% 50%, ${TK.bg.inset} 0%, ${TK.bg.page} 70%)`,
    }}>

      {/* ── Left info panel ──────────────────────────────────────────── */}
      <div style={{ width: 200, paddingTop: 8 }}>
        {/* Device badge */}
        <div style={{
          background: TK.bg.panel,
          border: `1px solid ${C.btnBlue}55`,
          borderRadius: 8,
          padding: '12px 14px',
          marginBottom: 12,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ color: C.btnBlue, fontSize: T.md, fontWeight: 700, letterSpacing: 1 }}>
              B. BRAUN
            </div>
            <button
              onClick={handleReset}
              onMouseLeave={() => setConfirmReset(false)}
              title="Reset B. Braun simulator to fresh state"
              style={{
                background: confirmReset ? '#4a0a0a' : 'transparent',
                border: `1px solid ${confirmReset ? '#ff4444' : C.btnBlue + '55'}`,
                borderRadius: 4, padding: '2px 7px', cursor: 'pointer',
                color: confirmReset ? '#ff6666' : C.btnBlue,
                fontSize: T.nano, letterSpacing: 1,
                fontFamily: "'Share Tech Mono', monospace",
                transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}>
              {confirmReset ? 'CONFIRM?' : '⟳ RESET'}
            </button>
          </div>
          <div style={{ color: TK.accent.blue, fontSize: T.nano, marginTop: 2 }}>
            Infusomat Space LVP
          </div>
          <div style={{ color: TK.text.secondary, fontSize: T.nano, marginTop: 4 }}>
            FW: {BRAUN_DEFAULTS.FIRMWARE_VERSION}
          </div>
        </div>

        {/* SpaceCom2 status */}
        <div style={{
          background: TK.bg.panel,
          border: `1px solid ${pumpState.spacecom2Connected ? C.spacecom2On + '44' : '#33333344'}`,
          borderRadius: 8,
          padding: '10px 12px',
          marginBottom: 10,
        }}>
          <div style={{ fontSize: T.nano, color: TK.text.secondary, letterSpacing: 1, marginBottom: 6 }}>
            SPACECOM2 MODULE
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: pumpState.spacecom2Connected ? C.spacecom2On : '#444',
              boxShadow: pumpState.spacecom2Connected ? `0 0 6px ${C.spacecom2On}` : 'none',
            }} />
            <span style={{
              color: pumpState.spacecom2Connected ? C.spacecom2On : '#555',
              fontSize: T.xs, fontWeight: 700,
            }}>
              {pumpState.spacecom2Connected ? 'CONNECTED' : 'DISCONNECTED'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={pump.handleConnectSpaceCom2}
              style={{
                flex: 1, background: pumpState.spacecom2Connected ? '#0a2010' : '#0d3020',
                border: `1px solid ${C.spacecom2On}44`, borderRadius: 4,
                color: C.spacecom2On, fontSize: T.nano, padding: '3px 2px', cursor: 'pointer',
              }}>CONNECT</button>
            <button onClick={pump.handleDisconnectSpaceCom2}
              style={{
                flex: 1, background: !pumpState.spacecom2Connected ? '#200a0a' : '#200a0a',
                border: '1px solid #55222244', borderRadius: 4,
                color: '#cc5555', fontSize: T.nano, padding: '3px 2px', cursor: 'pointer',
              }}>DISC.</button>
          </div>
        </div>

        {/* Firmware security indicator */}
        <div style={{
          background: TK.bg.panel,
          border: `1px solid ${pumpState.firmwareSigned ? '#33553344' : '#aa222244'}`,
          borderRadius: 8,
          padding: '10px 12px',
          marginBottom: 10,
        }}>
          <div style={{ fontSize: T.nano, color: TK.text.secondary, letterSpacing: 1, marginBottom: 4 }}>
            FIRMWARE SECURITY
          </div>
          <div style={{ fontSize: T.xs, color: pumpState.firmwareSigned ? '#44aa44' : '#cc4444', fontWeight: 700 }}>
            {pumpState.firmwareSigned ? '✓ SIGNED' : '✗ UNSIGNED'}
          </div>
          {!pumpState.firmwareSigned && (
            <div style={{ fontSize: T.nano, color: '#aa4444', marginTop: 4 }}>
              CVE-2021-33885<br />CVSS 9.0 — HIGH
            </div>
          )}
        </div>

        {/* Guardrail tier legend */}
        <div style={{
          background: TK.bg.panel,
          border: `1px solid ${TK.border.subtle}`,
          borderRadius: 8,
          padding: '10px 12px',
          marginBottom: 10,
        }}>
          <div style={{ fontSize: T.nano, color: TK.text.secondary, letterSpacing: 1, marginBottom: 8 }}>
            3-TIER GUARDRAIL
          </div>
          {[
            { label: 'TIER 1 — ADVISORY', color: '#b07000', desc: 'Near soft limit' },
            { label: 'TIER 2 — SOFT STOP', color: '#cc4400', desc: 'Exceeds soft limit' },
            { label: 'TIER 3 — HARD STOP', color: '#880000', desc: 'Exceeds hard limit' },
          ].map(t => (
            <div key={t.label} style={{ marginBottom: 6 }}>
              <div style={{ color: t.color, fontSize: T.nano, fontWeight: 700 }}>{t.label}</div>
              <div style={{ color: '#2a4060', fontSize: T.nano }}>{t.desc}</div>
            </div>
          ))}
        </div>

        {/* Patient weight input */}
        <div style={{
          background: TK.bg.panel,
          border: `1px solid ${TK.border.subtle}`,
          borderRadius: 8,
          padding: '10px 12px',
          marginBottom: 10,
        }}>
          <div style={{ fontSize: T.nano, color: TK.text.secondary, letterSpacing: 1, marginBottom: 6 }}>
            PATIENT WEIGHT
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="number"
              min={BRAUN_DEFAULTS.WEIGHT_MIN}
              max={BRAUN_DEFAULTS.WEIGHT_MAX}
              step={1}
              value={pumpState.patientWeightKg}
              disabled={pumpState.screen === 'RUNNING'}
              onChange={e => pump.handleSetWeight(Number(e.target.value))}
              style={{
                width: 64, background: TK.bg.inset, border: `1px solid ${TK.border.default}`,
                borderRadius: 4, color: TK.text.primary, fontSize: T.nano,
                padding: '3px 5px', fontFamily: "'Share Tech Mono', monospace",
                opacity: pumpState.screen === 'RUNNING' ? 0.45 : 1,
              }}
            />
            <span style={{ color: TK.text.secondary, fontSize: T.nano }}>kg</span>
          </div>
          {pumpState.screen === 'RUNNING' && (
            <div style={{ color: '#777', fontSize: T.nano, marginTop: 4 }}>
              Stop infusion to change weight
            </div>
          )}
        </div>

        {/* FDA recall flag */}
        <div style={{
          background: TK.bg.panel,
          border: `1px solid ${pumpState.recallBatchAffected ? '#aa222244' : TK.border.subtle}`,
          borderRadius: 8,
          padding: '10px 12px',
        }}>
          <div style={{ fontSize: T.nano, color: TK.text.secondary, letterSpacing: 1, marginBottom: 6 }}>
            FDA RECALL STATUS
          </div>
          <div style={{
            fontSize: T.xs, fontWeight: 700,
            color: pumpState.recallBatchAffected ? '#cc4444' : '#44aa44',
            marginBottom: 6,
          }}>
            {pumpState.recallBatchAffected ? '⚠ RECALL AFFECTED' : '✓ NOT AFFECTED'}
          </div>
          {pumpState.recallBatchAffected && (
            <div style={{ fontSize: T.nano, color: '#aa4444', marginBottom: 6 }}>
              Z-0601-2024 Class I<br />BB-R05 HIGH RISK
            </div>
          )}
          <button
            onClick={pump.handleToggleRecall}
            style={{
              width: '100%', background: pumpState.recallBatchAffected ? '#2a0808' : '#081808',
              border: `1px solid ${pumpState.recallBatchAffected ? '#aa333344' : '#33aa3344'}`,
              borderRadius: 4, color: pumpState.recallBatchAffected ? '#cc6666' : '#66aa66',
              fontSize: T.nano, padding: '3px 6px', cursor: 'pointer',
              fontFamily: "'Share Tech Mono', monospace", letterSpacing: 1,
            }}>
            {pumpState.recallBatchAffected ? 'CLEAR RECALL FLAG' : 'SET RECALL FLAG'}
          </button>
        </div>
      </div>

      {/* ── Pump body ─────────────────────────────────────────────────── */}
      <div style={{
        background: `linear-gradient(160deg, #1e2e42 0%, ${C.bodyBg} 60%, #0d1825 100%)`,
        borderRadius: 16,
        padding: '16px 14px',
        width: 260,
        boxShadow: '0 8px 32px rgba(0,0,0,0.7), 0 2px 8px rgba(0,85,164,0.2)',
        border: `1px solid ${C.bodyBorder}`,
        position: 'relative',
      }}>

        {/* Manufacturer label */}
        <div style={{
          textAlign: 'center', marginBottom: 10,
          color: '#0055a4', fontSize: T.nano, letterSpacing: 3, fontWeight: 700,
        }}>
          B|BRAUN
        </div>

        {/* ── Indicator LEDs ─────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
          {[
            { id: 'AC',   label: 'AC',   color: C.ledGreen, active: true },
            { id: 'BAT',  label: 'BATT', color: C.ledAmber, active: pumpState.batteryLevel < 30 },
            { id: 'RUN',  label: 'RUN',  color: C.ledGreen, active: isRunning },
            { id: 'HOLD', label: 'HOLD', color: C.ledAmber, active: isHold },
            { id: 'ALM',  label: 'ALARM',color: C.ledRed,   active: pumpState.screen === 'ALARM' },
          ].map(led => (
            <div key={led.id} style={{ textAlign: 'center' }}>
              <div style={{
                width: 7, height: 7, borderRadius: '50%',
                background: led.active ? led.color : '#1a2a3a',
                boxShadow: led.active ? `0 0 6px ${led.color}` : 'none',
                margin: '0 auto 2px',
                animation: (led.id === 'RUN' && isRunning) ? 'ledPulse 1s ease-in-out infinite' : 'none',
              }} />
              <div style={{ color: '#2a4060', fontSize: T.nano }}>{led.label}</div>
            </div>
          ))}
        </div>

        {/* ── LCD Screen ─────────────────────────────────────────────── */}
        <div style={{
          background: getScreenBg(),
          border: `2px solid ${C.screenBorder}`,
          borderRadius: 8,
          padding: '10px 12px',
          minHeight: 170,
          marginBottom: 10,
          position: 'relative',
          transition: 'background 0.15s',
          boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.12)',
          fontFamily: "'Share Tech Mono', monospace",
        }}>
          {/* SpaceCom2 icon top-right */}
          <div style={{
            position: 'absolute', top: 6, right: 8,
            color: pumpState.spacecom2Connected ? C.spacecom2On : '#888',
            fontSize: T.nano,
          }}>
            {pumpState.spacecom2Connected ? '⊙' : '○'} SC2
          </div>

          {/* Battery bar top-left */}
          <div style={{ position: 'absolute', top: 6, left: 8 }}>
            <div style={{
              width: 20, height: 8, border: '1px solid #8090a8', borderRadius: 2,
              overflow: 'hidden', display: 'flex', alignItems: 'center',
            }}>
              <div style={{
                height: '100%',
                width: `${pumpState.batteryLevel}%`,
                background: pumpState.batteryLevel > 30 ? '#3ab04a' : pumpState.batteryLevel > 15 ? '#ffaa00' : '#ff3333',
                transition: 'width 0.3s',
              }} />
            </div>
          </div>

          {/* Screen content */}
          <div style={{ marginTop: 14 }}>
            {renderDisplay()}
          </div>
        </div>

        {/* ── Softkey labels ─────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
          {softkeys.map((sk, i) => (
            <Softkey
              key={i}
              label={sk.label}
              primary={sk.primary}
              danger={sk.danger}
              advisory={sk.advisory}
              onClick={sk.action}
            />
          ))}
        </div>

        {/* ── Chevrons ──────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginBottom: 10 }}>
          <ChevronButton label="««" {...pump.largeDnChevron} />
          <ChevronButton label="«"  {...pump.smallDnChevron} />
          <ChevronButton label="»"  {...pump.smallUpChevron} />
          <ChevronButton label="»»" {...pump.largeUpChevron} />
        </div>

        {/* ── Action buttons ─────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5, marginBottom: 8 }}>
          <ActionButton
            label="RUN"
            color={C.btnGreen}
            activeColor="#00aa44"
            active={isRunning}
            led
            ledColor={C.ledGreen}
            onClick={pump.handleRun}
          />
          <ActionButton
            label="HOLD"
            color={C.btnGrey}
            activeColor="#4a5a6a"
            active={isHold}
            led
            ledColor={C.ledAmber}
            onClick={pump.handleHold}
          />
          <ActionButton
            label="MUTE"
            color={C.btnGrey}
            active={pumpState.mutedUntil > Date.now()}
            onClick={pump.handleMute}
          />
          <ActionButton
            label="BOLUS"
            color={C.btnGrey}
            active={pumpState.bolusActive}
            onMouseDown={pump.handleStartBolus}
            onMouseUp={pump.handleStopBolus}
            onMouseLeave={pump.handleStopBolus}
          />
          <ActionButton
            label="OPTIONS"
            color={C.btnGrey}
            onClick={pump.handleOptions}
          />
          <ActionButton
            label="PRESSURE"
            color={C.btnGrey}
            onClick={pump.handlePressureView}
          />
        </div>

        {/* ── Alarm triggers (research panel) ──────────────────────── */}
        <div style={{
          borderTop: '1px solid #1a3050',
          paddingTop: 8,
          marginTop: 2,
        }}>
          <div style={{ color: '#2a4060', fontSize: T.nano, letterSpacing: 1, marginBottom: 5 }}>
            SIMULATE ALARMS
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {(['OCCLUSION', 'AIR_IN_LINE', 'SPACECOM2_FAULT', 'FIRMWARE_UNSIGNED'] as const).map(a => (
              <button key={a}
                onClick={() => pump.handleTriggerAlarm(a)}
                style={{
                  background: '#0a1828',
                  border: '1px solid #1a3a5a',
                  borderRadius: 4,
                  color: '#3a6080',
                  fontSize: T.nano,
                  padding: '3px 5px',
                  cursor: 'pointer',
                  letterSpacing: 0.5,
                }}>
                {a.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* ── Power button ─────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
          <button
            onMouseDown={pump.handlePowerDown}
            onMouseUp={pump.handlePowerRelease}
            onMouseLeave={pump.handlePowerRelease}
            style={{
              width: 36, height: 36, borderRadius: '50%',
              background: pump.poweringOff ? '#cc2200' : '#0d1e35',
              border: '2px solid #1a3a5a',
              color: '#3a6080', fontSize: T.md,
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(0,0,0,0.6)',
              transition: 'all 0.08s',
            }}>
            ⏻
          </button>
        </div>
        {pump.poweringOff && (
          <div style={{ color: '#cc4444', fontSize: T.nano, textAlign: 'center', marginTop: 4 }}>
            Hold to power off...
          </div>
        )}

      </div>

      {/* ── Right session log panel ─────────────────────────────────── */}
      <div style={{ width: 260, paddingTop: 8 }}>
        <div style={{
          background: TK.bg.panel,
          border: `1px solid ${TK.border.subtle}`,
          borderRadius: 8,
          padding: '12px',
          marginBottom: 12,
        }}>
          <div style={{ color: TK.text.secondary, fontSize: T.nano, letterSpacing: 1, marginBottom: 8 }}>
            GUARDRAIL STATE
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {[
              { label: 'Advisory shown', value: pumpState.guardrailAdvisoryShown, color: '#b07000' },
              { label: 'Advisory ack.', value: pumpState.guardrailAdvisoryAcknowledged, color: '#b07000' },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#2a4060', fontSize: T.nano }}>{row.label}</span>
                <span style={{
                  color: row.value ? row.color : '#2a4060',
                  fontSize: T.nano, fontWeight: row.value ? 700 : 400,
                }}>
                  {row.value ? 'YES' : 'no'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Session log toggle + export */}
        <div style={{ marginBottom: 8, display: 'flex', gap: 4 }}>
          <button
            onClick={() => setShowLog(v => !v)}
            style={{
              flex: 1, background: TK.bg.panel,
              border: `1px solid ${TK.border.default}`, borderRadius: 6,
              color: TK.accent.blue, fontSize: T.nano, padding: '6px',
              cursor: 'pointer', letterSpacing: 1,
            }}>
            {showLog ? '▲ HIDE' : '▼ SHOW'} LOG ({pump.sessionLog.length})
          </button>
          <button
            onClick={() => {
              if (pump.sessionLog.length === 0) return;
              const header = 'timestamp,screen,event,rate,delta,newRate,drug,vtbi,guardrailStatus,overrideChoice,alarmType,bolusVolume,pressureLevel,newWeight\n';
              const rows = pump.sessionLog.map(e =>
                [e.timestamp, e.screen, e.event,
                 e.rate ?? '', e.delta ?? '', e.newRate ?? '',
                 e.drug ?? '', e.vtbi ?? '', e.guardrailStatus ?? '',
                 e.overrideChoice ?? '', e.alarmType ?? '',
                 e.bolusVolume ?? '', e.pressureLevel ?? '', e.newWeight ?? '',
                ].join(',')
              ).join('\n');
              const blob = new Blob([header + rows], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = `braun_session_${Date.now()}.csv`; a.click();
              URL.revokeObjectURL(url);
            }}
            style={{
              background: TK.bg.panel, border: `1px solid ${TK.border.default}`,
              borderRadius: 6, color: TK.accent.cyan ?? TK.accent.blue,
              fontSize: T.nano, padding: '6px 8px', cursor: 'pointer', letterSpacing: 1,
            }}
            title="Export session log as CSV">
            ↓ CSV
          </button>
        </div>

        {showLog && (
          <div style={{
            background: TK.bg.panel,
            border: `1px solid ${TK.border.default}`,
            borderRadius: 8,
            maxHeight: 360,
            overflowY: 'auto',
            padding: '8px',
          }}>
            {pump.sessionLog.length === 0 ? (
              <div style={{ color: TK.text.dim, fontSize: T.nano, textAlign: 'center', padding: 12 }}>
                No events yet
              </div>
            ) : (
              [...pump.sessionLog].reverse().map((entry, i) => (
                <div key={i} style={{
                  borderBottom: `1px solid ${TK.border.subtle}`,
                  padding: '3px 0',
                  display: 'flex',
                  gap: 6,
                  alignItems: 'flex-start',
                }}>
                  <span style={{ color: TK.text.secondary, fontSize: T.nano, minWidth: 36, flexShrink: 0 }}>
                    {(entry.timestamp / 1000).toFixed(1)}s
                  </span>
                  <span style={{
                    color: entry.event.includes('guardrail') ? TK.accent.amber :
                           entry.event.includes('alarm')     ? TK.accent.red :
                           entry.event.includes('advisory')  ? TK.accent.amber : TK.accent.blue,
                    fontSize: T.nano,
                  }}>
                    {entry.event}
                    {entry.rate !== undefined ? ` @${entry.rate.toFixed(1)}` : ''}
                    {entry.delta !== undefined ? ` Δ${entry.delta > 0 ? '+' : ''}${entry.delta}` : ''}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

    </div>
  );
}
