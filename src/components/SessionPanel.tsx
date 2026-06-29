import { useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useSessionTime } from '../hooks/useSessionTime';

interface SessionPanelProps {
  device: 'ALARIS' | 'BRAUN';
  batteryLevel: number;
  isRunning: boolean;
  drugName?: string;
  rate?: number;
  volumeInfused?: number;
  onSilence: () => void;
  onDownload: () => void;
  onSimulateBatteryLow: () => void;
  onChargeBattery: () => void;
  onStartSession: () => void;
  alarmActive: boolean;
}

const SESSION_KEYS = { ALARIS: 'alaris_session_clock', BRAUN: 'braun_session_clock' };
const SESSION_MAX_MS = 60 * 60 * 1000;

function pad(n: number) { return String(Math.floor(n)).padStart(2, '0'); }
function fmt(ms: number) {
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60);
  return `${pad(h)}:${pad(m % 60)}:${pad(s % 60)}`;
}

export default function SessionPanel(props: SessionPanelProps) {
  const {
    device, batteryLevel, isRunning, drugName, rate, volumeInfused,
    onSilence, onDownload, onSimulateBatteryLow, onChargeBattery,
    onStartSession, alarmActive,
  } = props;

  const C = useTheme();
  const [open, setOpen] = useState(false);
  const { state, elapsed, summary, startSession, endSession, resetSession } = useSessionTime(SESSION_KEYS[device]);

  const accent  = device === 'ALARIS' ? '#4fc3f7' : '#4a90d9';
  const pct     = Math.min(100, (elapsed / SESSION_MAX_MS) * 100);
  const warn    = pct > 80;
  const batColor = batteryLevel > 40 ? '#4caf50' : batteryLevel > 15 ? '#ff9800' : '#f44336';

  const panelStyle: React.CSSProperties = {
    position: 'fixed', top: 60, right: open ? 0 : -230,
    width: 240, background: C.bg.panel,
    border: `1px solid ${C.border.default}`, borderRight: 'none',
    borderRadius: '8px 0 0 8px', zIndex: 200,
    transition: 'right 0.3s ease',
    fontFamily: "'Share Tech Mono', monospace",
    boxShadow: '-4px 0 24px rgba(0,0,0,0.5)',
  };

  // ── IDLE ──────────────────────────────────────────────────────────────────────
  if (state === 'idle') {
    return (
      <div style={panelStyle}>
        <Tab open={open} setOpen={setOpen} label="SESSION" alert={alarmActive} />
        <div style={{ padding: '24px 16px', textAlign: 'center' }}>
          <div style={{ color: accent, fontSize: 10, letterSpacing: 2, marginBottom: 12 }}>
            {device} · SESSION
          </div>
          <div style={{ color: C.text.secondary, fontSize: 10, lineHeight: 1.7, marginBottom: 20 }}>
            Start a session to track time, battery drain, and activity logs.
          </div>
          <Btn accent onClick={() => { onStartSession(); startSession(); }} accentColor={accent}>▶ START SESSION</Btn>
        </div>
        <GlobalStyle />
      </div>
    );
  }

  // ── ENDED ─────────────────────────────────────────────────────────────────────
  if (state === 'ended' && summary) {
    return (
      <div style={panelStyle}>
        <Tab open={open} setOpen={setOpen} label="SESSION" />
        <div style={{ padding: '16px' }}>
          <div style={{ color: accent, fontSize: 10, letterSpacing: 2, marginBottom: 12 }}>
            {device} · SESSION ENDED
          </div>

          {/* Summary box */}
          <div style={{ background: C.bg.inset, borderRadius: 6, padding: '12px', marginBottom: 14, fontSize: 10 }}>
            <div style={{ color: C.text.secondary, fontSize: 9, letterSpacing: 1, marginBottom: 8 }}>SESSION SUMMARY</div>
            <SRow label="Duration"  value={fmt(summary.durationMs)} C={C} />
            {summary.drug            && <SRow label="Drug"       value={summary.drug} C={C} />}
            {summary.rate            !== undefined && <SRow label="Final rate" value={`${summary.rate.toFixed(1)} ml/h`} C={C} />}
            {summary.volumeDelivered !== undefined && <SRow label="Delivered"  value={`${summary.volumeDelivered.toFixed(1)} ml`} C={C} />}
            {summary.batteryEnd      !== undefined && <SRow label="Batt. end"  value={`${summary.batteryEnd.toFixed(0)}%`} C={C} color={batColor} />}
            <SRow label="Ended at" value={new Date(summary.endedAt).toLocaleTimeString()} C={C} dim />
          </div>

          <Btn accent onClick={() => { onStartSession(); startSession(); }} accentColor={accent}>▶ START NEW SESSION</Btn>
          <div style={{ height: 6 }} />
          <Btn onClick={onDownload} C={C}>⬇ DOWNLOAD LOG</Btn>
          <div style={{ height: 6 }} />
          <Btn onClick={resetSession} C={C} danger>✕ CLEAR &amp; DISMISS</Btn>
        </div>
        <GlobalStyle />
      </div>
    );
  }

  // ── ACTIVE ────────────────────────────────────────────────────────────────────
  return (
    <div style={panelStyle}>
      <Tab open={open} setOpen={setOpen} label={alarmActive ? 'ALARM' : 'SESSION'} alert={alarmActive} />
      <div style={{ padding: '14px 16px 16px' }}>

        <div style={{ color: accent, fontSize: 10, letterSpacing: 2, marginBottom: 10 }}>
          {device} · SESSION INFO
        </div>

        {/* Timer */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ color: C.text.secondary, fontSize: 9, letterSpacing: 1 }}>TIME ELAPSED</div>
          <div style={{ color: warn ? '#f44336' : C.text.primary, fontSize: 20, letterSpacing: 2, marginTop: 2 }}>
            {fmt(elapsed)}
          </div>
          <Bar pct={pct} color={warn ? '#f44336' : accent} bg={C.bg.inset} />
          <div style={{ color: C.text.dim, fontSize: 9, marginTop: 2 }}>60 min session</div>
        </div>

        {/* Battery */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ color: C.text.secondary, fontSize: 9, letterSpacing: 1 }}>BATTERY</div>
            <div style={{ color: batColor, fontSize: 11 }}>{batteryLevel.toFixed(0)}%</div>
          </div>
          <Bar pct={batteryLevel} color={batColor} bg={C.bg.inset} height={6} />
        </div>

        {/* Stats */}
        <div style={{ background: C.bg.inset, borderRadius: 4, padding: '8px 10px', marginBottom: 10, fontSize: 9 }}>
          {drugName          && <SRow label="Drug"      value={drugName} C={C} />}
          {rate !== undefined && <SRow label="Rate"      value={`${rate.toFixed(1)} ml/h`} C={C} />}
          {volumeInfused !== undefined && <SRow label="Delivered" value={`${volumeInfused.toFixed(1)} ml`} C={C} />}
          <SRow label="Status" value={isRunning ? 'RUNNING' : 'STOPPED'} C={C} color={isRunning ? '#4caf50' : '#ff9800'} />
        </div>

        {/* Alarm */}
        <Btn
          onClick={onSilence}
          C={C}
          color={alarmActive ? '#ff9800' : undefined}
          bg={alarmActive ? '#3a1a00' : undefined}
          border={alarmActive ? '#ff8800' : undefined}
          blink={alarmActive}
        >🔕 SILENCE ALARM</Btn>

        <Btn onClick={onSimulateBatteryLow} C={C}>🔋 SIM BATTERY LOW</Btn>
        <Btn onClick={onChargeBattery} C={C} color="#4caf50">⚡ CHARGE TO FULL</Btn>
        <Btn onClick={onDownload} C={C}>⬇ DOWNLOAD SESSION</Btn>

        {/* End session */}
        <div style={{ borderTop: `1px solid ${C.border.default}`, marginTop: 8, paddingTop: 8 }}>
          <Btn
            onClick={() => endSession({
              drug: drugName,
              rate,
              volumeDelivered: volumeInfused,
              batteryEnd: batteryLevel,
            })}
            C={C}
            color="#ff6b6b"
            bg="#2a0a0a"
            border="#880000"
          >■ END SESSION</Btn>
        </div>

      </div>
      <GlobalStyle />
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Tab({ open, setOpen, label, alert }: {
  open: boolean; setOpen: (v: boolean) => void; label: string; alert?: boolean;
}) {
  const C = useTheme();
  return (
    <button onClick={() => setOpen(!open)} style={{
      position: 'absolute', left: -32, top: 12,
      width: 32, height: 80,
      background: alert ? '#3a1a00' : C.bg.panel,
      border: `1px solid ${alert ? '#ff8800' : C.border.default}`,
      borderRight: 'none', borderRadius: '6px 0 0 6px',
      color: alert ? '#ff9800' : C.text.secondary,
      cursor: 'pointer', fontSize: 10, writingMode: 'vertical-rl',
      letterSpacing: 1, padding: '6px 0',
      animation: alert ? 'panelBlink 1s step-end infinite' : 'none',
    }}>
      {open ? 'HIDE ▶' : `◀ ${label}`}
    </button>
  );
}

function Bar({ pct, color, bg, height = 3 }: { pct: number; color: string; bg: string; height?: number }) {
  return (
    <div style={{ height, background: bg, borderRadius: height, marginTop: 4 }}>
      <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color, borderRadius: height, transition: 'width 1s linear' }} />
    </div>
  );
}

function SRow({ label, value, C, color, dim }: {
  label: string; value: string;
  C: ReturnType<typeof useTheme>; color?: string; dim?: boolean;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
      <span style={{ color: C.text.dim }}>{label}</span>
      <span style={{ color: dim ? C.text.dim : color ?? C.text.primary }}>{value}</span>
    </div>
  );
}

function Btn({ children, onClick, C, color, bg, border, blink, accent, accentColor, danger }: {
  children: React.ReactNode;
  onClick: () => void;
  C?: ReturnType<typeof useTheme>;
  color?: string;
  bg?: string;
  border?: string;
  blink?: boolean;
  accent?: boolean;
  accentColor?: string;
  danger?: boolean;
}) {
  const theme = useTheme();
  const t = C ?? theme;
  return (
    <button onClick={onClick} style={{
      width: '100%', marginBottom: 5, padding: accent ? '10px 0' : '7px 0',
      background: accent ? (accentColor ?? '#4fc3f7') : danger ? '#1a0000' : bg ?? t.bg.inset,
      border: `1px solid ${accent ? 'transparent' : danger ? '#660000' : border ?? t.border.default}`,
      borderRadius: 4,
      color: accent ? '#fff' : color ?? t.text.secondary,
      fontSize: accent ? 12 : 10, letterSpacing: accent ? 2 : 1,
      cursor: 'pointer', fontFamily: "'Share Tech Mono', monospace",
      animation: blink ? 'panelBlink 1s step-end infinite' : 'none',
    }}>
      {children}
    </button>
  );
}

function GlobalStyle() {
  return <style>{`@keyframes panelBlink { 50% { opacity: 0.35; } }`}</style>;
}
