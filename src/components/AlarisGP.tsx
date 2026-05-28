import { useState, useEffect, useRef } from 'react';
import { usePumpContext } from '../contexts/PumpContext';
import { FACTORY_DEFAULTS } from '../pump/constants';
import { rateToMlH, formatTime, computeTimeRemaining } from '../pump/display';
import { checkGuardrail } from '../pump/guardrails';
import type { Drug } from '../pump/types';
import { useTheme } from '../contexts/ThemeContext';
import { T } from '../styles/tokens';

// ─── Sub-components ───────────────────────────────────────────────────────────

function LcdLine({ text, bright, dim }: { text: string; bright?: boolean; dim?: boolean }) {
  return (
    <div style={{
      color: bright ? "#3aff3a" : dim ? "#1a5a2a" : "#2a9a2a",
      fontSize: bright ? T.sm : T.nano,
      letterSpacing: bright ? 1 : 0,
      marginBottom: 2,
      textShadow: bright ? "0 0 8px rgba(58,255,58,0.4)" : "none"
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
      className="chevron-btn"
      onMouseDown={(e) => { e.preventDefault(); onPressDown(); }}
      onMouseUp={onRelease}
      onMouseLeave={onRelease}
      onTouchStart={(e) => { e.preventDefault(); onPressDown(); }}
      onTouchEnd={onRelease}
      style={{
        background: "linear-gradient(180deg, #1a2a4a 0%, #0d1a30 100%)",
        border: "1px solid #2a4a7a", borderRadius: 6,
        color: "#4a9eff", fontSize: T.md, fontWeight: "bold",
        width: 56, height: 36, cursor: "pointer",
        boxShadow: "0 2px 4px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)",
        transition: "transform 0.05s, box-shadow 0.05s",
        userSelect: "none",
      }}>
      {label}
    </button>
  );
}

interface PumpButtonProps {
  label: string;
  color: string;
  activeColor: string;
  active?: boolean;
  led?: boolean;
  ledColor?: string;
  onClick?: () => void;
  onMouseDown?: () => void;
  onMouseUp?: () => void;
  onMouseLeave?: () => void;
}

function PumpButton({ label, color, activeColor, active, led, ledColor, onClick, onMouseDown, onMouseUp, onMouseLeave }: PumpButtonProps) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseDown={() => { setPressed(true); onMouseDown?.(); }}
      onMouseUp={() => { setPressed(false); onMouseUp?.(); }}
      onMouseLeave={() => { setPressed(false); onMouseLeave?.(); }}
      style={{
        background: pressed || active ? activeColor : color,
        border: `1px solid ${pressed || active ? activeColor : color}`,
        borderRadius: 6, padding: "6px 4px", cursor: "pointer",
        position: "relative", transition: "all 0.08s",
        transform: pressed ? "scale(0.92)" : "scale(1)",
        boxShadow: pressed ? "none" : "0 2px 4px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)"
      }}>
      {led && ledColor && (
        <div style={{
          width: 5, height: 5, borderRadius: "50%",
          background: ledColor,
          boxShadow: `0 0 6px ${ledColor}`,
          margin: "0 auto 3px",
          animation: active ? "ledPulse 1s ease-in-out infinite" : "none",
        }} />
      )}
      <div style={{
        color: pressed || active ? "#ffffff" : "#8090a0",
        fontSize: T.nano, letterSpacing: 1, fontWeight: 600,
        fontFamily: "'Rajdhani', sans-serif"
      }}>{label}</div>
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const ALARIS_LS_KEYS = ['alaris_pump_state', 'alaris_session_log', 'alaris_session_start'];

export default function AlarisGP() {
  const C = useTheme();
  const pump = usePumpContext();
  const { pumpState, drugLibrary } = pump;
  const [showLog, setShowLog] = useState(false);
  const [displayFlash, setDisplayFlash] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const prevScreen = useRef(pumpState.screen);

  function handleReset() {
    if (!confirmReset) { setConfirmReset(true); return; }
    ALARIS_LS_KEYS.forEach(k => { try { localStorage.removeItem(k); } catch { /* ignore */ } });
    window.location.reload();
  }

  function flash(type: string) {
    setDisplayFlash(type);
    setTimeout(() => setDisplayFlash(null), 400);
  }

  // Auto-flash LCD when state machine transitions into ALARM or GUARDRAIL screens
  useEffect(() => {
    const prev = prevScreen.current;
    const curr = pumpState.screen;
    if (curr !== prev) {
      if (curr === "ALARM") flash("alarm");
      else if (curr === "GUARDRAIL_WARNING") flash("guardrail");
      else if (curr === "GUARDRAIL_BLOCKED") flash("alarm");
      prevScreen.current = curr;
    }
  }, [pumpState.screen]);

  // Derived display values
  const mlH = rateToMlH(
    pumpState.screen === "RATE_ENTRY" ? pumpState.rateBuffer : pumpState.rate,
    pumpState.selectedDrug,
    pumpState.patientWeight
  );
  const timeRemaining = computeTimeRemaining(pumpState.vtbi, pumpState.volumeInfused, mlH);
  const guardrailStatus = checkGuardrail(pumpState.rateBuffer, pumpState.selectedDrug);

  function exportCSV() {
    const headers = "timestamp_ms,screen,event,rate,drug,delta,newRate\n";
    const rows = pump.sessionLog.map(e =>
      [e.timestamp, e.screen, e.event, e.rate ?? "", e.drug ?? "", e.delta ?? "", e.newRate ?? ""].join(",")
    ).join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `alaris_session_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Context-sensitive softkeys ─────────────────────────────────────────────
  function getSoftkeys(): Array<{ label: string; primary?: boolean; action: () => void }> {
    switch (pumpState.screen) {
      case "LANGUAGE_SELECT":
        return [
          { label: "OK", primary: true, action: pump.handleLanguageSelect },
          { label: "", action: () => {} },
          { label: "", action: () => {} },
        ];
      case "DRUG_SELECT":
        return [
          { label: "SELECT", primary: true, action: pump.handleConfirmDrugSelection },
          { label: "↑", action: () => pump.handleMoveDrugCursor(-1) },
          { label: "↓", action: () => pump.handleMoveDrugCursor(1) },
        ];
      case "RATE_ENTRY":
        return [
          { label: "RUN", primary: true, action: pump.handleRun },
          { label: "VTBI", action: pump.handleOpenVtbi },
          { label: "DRUG", action: pump.handleGoToDrugSelect },
        ];
      case "WEIGHT_ENTRY":
        return [
          { label: "OK", primary: true, action: pump.handleConfirmWeight },
          { label: "DEFAULT", action: pump.handleResetWeightBuffer },
          { label: "BACK", action: pump.handleCancelWeight },
        ];
      case "VTBI_ENTRY":
        return [
          { label: "OK", primary: true, action: pump.handleConfirmVtbi },
          { label: "CLR", action: pump.handleClearVtbi },
          { label: "BACK", action: pump.handleBack },
        ];
      case "GUARDRAIL_WARNING":
        return [
          { label: "OVERRIDE", primary: true, action: () => { flash("guardrail"); pump.handleOverrideGuardrail(); } },
          { label: "RE-ENTER", action: pump.handleReEnterRate },
          { label: "", action: () => {} },
        ];
      case "GUARDRAIL_BLOCKED":
        return [
          { label: "RE-ENTER", primary: true, action: pump.handleReEnterRate },
          { label: "", action: () => {} },
          { label: "", action: () => {} },
        ];
      case "RUNNING":
        return [
          { label: "CLEAR VI", action: pump.handleClearVolume },
          { label: "VTBI", action: pump.handleOpenVtbi },
          { label: "OPTIONS", action: pump.handleOptions },
        ];
      case "ON_HOLD":
        return [
          { label: "RESUME", primary: true, action: pump.handleRun },
          { label: "RE-PROG", action: pump.handleReprogramRate },
          { label: "OPTIONS", action: pump.handleOptions },
        ];
      case "ALARM":
        return [
          { label: "SILENCE", primary: true, action: pump.handleSilenceAlarm },
          { label: "", action: () => {} },
          { label: "", action: () => {} },
        ];
      case "OPTIONS":
        return [
          { label: "SET VTBI", action: pump.handleOpenVtbi },
          { label: "EVENT LOG", action: () => setShowLog(true) },
          { label: "BACK", action: pump.handleBack },
        ];
      case "PRESSURE_VIEW":
        return [
          { label: "", action: () => {} },
          { label: "", action: () => {} },
          { label: "BACK", action: pump.handleBack },
        ];
      default:
        return [{ label: "", action: () => {} }, { label: "", action: () => {} }, { label: "", action: () => {} }];
    }
  }

  // ── Display renderer ───────────────────────────────────────────────────────
  function renderDisplay() {
    const { screen, selectedDrug, rateBuffer, rate, vtbi, volumeInfused, pressureLevel, alarmMessage } = pumpState;

    switch (screen) {
      case "LANGUAGE_SELECT":
        return (
          <div style={{ paddingTop: 16 }}>
            <LcdLine text="SELECT LANGUAGE" dim />
            <LcdLine text="" />
            {["English", "Français", "Deutsch", "Español"].map((lang, i) => (
              <div key={lang} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: i === 0 ? "#3aff3a" : "#1a3a1a" }} />
                <LcdLine text={lang} bright={i === 0} />
              </div>
            ))}
          </div>
        );

      case "DRUG_SELECT":
        return (
          <div style={{ paddingTop: 8 }}>
            <LcdLine text="SELECT DRUG / MODE" dim />
            <div style={{ marginTop: 6, maxHeight: 100, overflowY: "auto" }}>
              {drugLibrary.map((drug: Drug, idx: number) => {
                const isCursor = idx === pumpState.drugCursorIndex;
                return (
                  <div key={drug.id} onClick={() => pump.handleDrugSelect(drug)}
                    style={{
                      display: "flex", justifyContent: "space-between", padding: "3px 4px",
                      cursor: "pointer",
                      background: isCursor ? "#0d2a0d" : "transparent",
                      borderLeft: isCursor ? "2px solid #3aff3a" : "2px solid transparent",
                      color: isCursor ? "#3aff3a" : "#1a8a2a",
                      borderBottom: "1px solid #0a1a0a", fontSize: T.nano
                    }}>
                    <span>{drug.name}</span>
                    <span style={{ color: isCursor ? "#2aaa2a" : "#1a5a3a", fontSize: T.xs }}>{drug.unit}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );

      case "WEIGHT_ENTRY":
        return (
          <div style={{ paddingTop: 12 }}>
            <LcdLine text={selectedDrug.name} bright />
            <LcdLine text="ENTER PATIENT WEIGHT" dim />
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, margin: "8px 0" }}>
              <div style={{ color: "#3aff3a", fontSize: T.lcd, fontWeight: "bold", letterSpacing: 2, textShadow: "0 0 20px rgba(58,255,58,0.5)" }}>
                {pumpState.weightBuffer}
              </div>
              <div style={{ color: "#1a8a2a", fontSize: T.md }}>kg</div>
            </div>
            <LcdLine text={`Range: ${FACTORY_DEFAULTS.WEIGHT_MIN}–${FACTORY_DEFAULTS.WEIGHT_MAX} kg`} dim />
            <div style={{ color: "#1a5a3a", fontSize: T.xs, marginTop: 4 }}>
              Required for dose/kg calculation
            </div>
          </div>
        );

      case "RATE_ENTRY":
        return (
          <div style={{ paddingTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <LcdLine text={selectedDrug.name} bright />
              <LcdLine text="ON HOLD" dim />
            </div>
            <LcdLine text="RATE" dim />
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, margin: "6px 0" }}>
              <div style={{ color: "#3aff3a", fontSize: T.lcd, fontWeight: "bold", letterSpacing: 2, textShadow: "0 0 20px rgba(58,255,58,0.5)" }}>
                {rateBuffer.toFixed(1)}
              </div>
              <div style={{ color: "#1a8a2a", fontSize: T.md }}>{selectedDrug.unit}</div>
            </div>
            {selectedDrug.unit !== "ml/h" && (
              <div style={{ color: "#1a6a3a", fontSize: T.nano, marginBottom: 4 }}>
                = {rateToMlH(rateBuffer, selectedDrug, pumpState.patientWeight).toFixed(1)} ml/h
              </div>
            )}
            {guardrailStatus.status !== "ok" && (
              <div style={{ color: guardrailStatus.status === "warning" ? "#ffaa00" : "#ff4444", fontSize: T.xs, marginTop: 4 }}>
                {guardrailStatus.status === "warning"
                  ? `⚠ SOFT LIMIT (${selectedDrug.softMin}–${selectedDrug.softMax} ${selectedDrug.unit})`
                  : `✗ HARD LIMIT EXCEEDED`}
              </div>
            )}
            <LcdLine text={`VOL INFUSED: ${volumeInfused.toFixed(1)} ml`} dim />
          </div>
        );

      case "VTBI_ENTRY":
        return (
          <div style={{ paddingTop: 12 }}>
            <LcdLine text="SET VTBI" bright />
            <LcdLine text="" />
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, margin: "8px 0" }}>
              <div style={{ color: "#3aff3a", fontSize: T.lcd, fontWeight: "bold", letterSpacing: 2, textShadow: "0 0 20px rgba(58,255,58,0.5)" }}>
                {pumpState.vtbiBuffer.toFixed(1)}
              </div>
              <div style={{ color: "#1a8a2a", fontSize: T.md }}>ml</div>
            </div>
            <LcdLine text={`MAX: ${FACTORY_DEFAULTS.VTBI_MAX} ml`} dim />
          </div>
        );

      case "GUARDRAIL_WARNING": {
        const warnMsg = checkGuardrail(rateBuffer, selectedDrug).message ?? "";
        return (
          <div style={{ paddingTop: 8 }}>
            <div className="blink" style={{ color: "#ffaa00", fontSize: T.sm, marginBottom: 8 }}>⚠ GUARDRAIL ADVISORY</div>
            {warnMsg.split("\n").map((line, i) => (
              <LcdLine key={i} text={line} bright={i === 0} dim={i > 0} />
            ))}
            <div style={{ color: "#ffaa00", fontSize: T.xs, marginTop: 8 }}>OVERRIDE to continue · RE-ENTER to change</div>
          </div>
        );
      }

      case "GUARDRAIL_BLOCKED":
        return (
          <div style={{ paddingTop: 8 }}>
            <div className="blink" style={{ color: "#ff4444", fontSize: T.sm, marginBottom: 8 }}>✗ HARD LIMIT EXCEEDED</div>
            <LcdLine text={`RATE: ${rateBuffer.toFixed(1)} ${selectedDrug.unit}`} bright />
            <LcdLine text={`HARD MAX: ${selectedDrug.hardMax} ${selectedDrug.unit}`} dim />
            <div style={{ color: "#ff4444", fontSize: T.nano, marginTop: 8 }}>Must RE-ENTER rate.</div>
          </div>
        );

      case "RUNNING":
      case "ON_HOLD": {
        const running = screen === "RUNNING";
        return (
          <div style={{ paddingTop: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ color: running ? "#3aff3a" : "#ffaa00", fontSize: T.nano }}>
                {running ? "▶ RUNNING" : "⏸ ON HOLD"}
                {pumpState.kvoActive && <span style={{ color: "#ffaa00", marginLeft: 8 }}>KVO</span>}
                {pumpState.bolusActive && <span style={{ color: "#4a9eff", marginLeft: 8 }}>BOLUS</span>}
              </div>
              <div style={{ color: "#1a5a3a", fontSize: T.xs }}>
                {selectedDrug.id !== "manual" ? "✦ " : ""}{selectedDrug.name}
              </div>
            </div>
            <LcdLine text="RATE" dim />
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, margin: "4px 0" }}>
              <div style={{ color: "#3aff3a", fontSize: 32, fontWeight: "bold", letterSpacing: 2, textShadow: running ? "0 0 20px rgba(58,255,58,0.4)" : "none" }}>
                {rate.toFixed(1)}
              </div>
              <div style={{ color: "#1a8a2a", fontSize: T.sm }}>{selectedDrug.unit}</div>
            </div>
            {selectedDrug.unit !== "ml/h" && (
              <div style={{ color: "#1a6a3a", fontSize: T.nano, marginBottom: 4 }}>
                {mlH.toFixed(1)} ml/h
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
              <div>
                <div style={{ color: "#1a5a3a", fontSize: T.nano }}>VOLUME</div>
                <div style={{ color: "#2aaa2a", fontSize: T.md }}>{volumeInfused.toFixed(1)} <span style={{ fontSize: T.xs }}>ml</span></div>
              </div>
              {vtbi !== null && (
                <div>
                  <div style={{ color: "#1a5a3a", fontSize: T.nano }}>VTBI</div>
                  <div style={{ color: "#2aaa2a", fontSize: T.md }}>{(vtbi - volumeInfused).toFixed(1)} <span style={{ fontSize: T.xs }}>ml</span></div>
                </div>
              )}
              {timeRemaining !== null && (
                <div>
                  <div style={{ color: "#1a5a3a", fontSize: T.nano }}>REMAINING</div>
                  <div style={{ color: "#2aaa2a", fontSize: T.nano }}>{formatTime(timeRemaining)}</div>
                </div>
              )}
            </div>
          </div>
        );
      }

      case "ALARM":
        return (
          <div style={{ paddingTop: 16, textAlign: "center" }}>
            <div className="blink" style={{ color: "#ff3333", fontSize: T.lg, marginBottom: 12 }}>⚠ ALARM</div>
            <div style={{ color: "#ff6666", fontSize: T.md, marginBottom: 8 }}>{alarmMessage}</div>
            <div style={{ color: "#1a7a3a", fontSize: T.nano }}>Press SILENCE softkey</div>
          </div>
        );

      case "OPTIONS": {
        const menuItems: Array<{ label: string; action: () => void }> = [
          { label: "SET VTBI", action: pump.handleOpenVtbi },
          { label: `KVO RATE: ${FACTORY_DEFAULTS.KVO_RATE} ml/h`, action: () => {} },
          { label: "EVENT LOG", action: () => setShowLog(true) },
          { label: "BACK", action: pump.handleBack },
        ];
        return (
          <div style={{ paddingTop: 8 }}>
            <LcdLine text="OPTIONS" bright />
            {menuItems.map((item, i) => (
              <div key={item.label} onClick={item.action}
                style={{
                  padding: "5px 4px", color: "#2a9a4a", fontSize: T.nano, cursor: "pointer",
                  borderBottom: i < menuItems.length - 1 ? "1px solid #0a1a0a" : "none",
                  transition: "color 0.1s",
                }}
                onMouseEnter={e => (e.currentTarget.style.color = "#3aff3a")}
                onMouseLeave={e => (e.currentTarget.style.color = "#2a9a4a")}
              >
                ▸ {item.label}
              </div>
            ))}
          </div>
        );
      }

      case "PRESSURE_VIEW":
        return (
          <div style={{ paddingTop: 8 }}>
            <LcdLine text="PRESSURE" bright />
            <div style={{ display: "flex", gap: 4, alignItems: "flex-end", margin: "12px 0" }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <div style={{ width: 14, height: 8 + i * 6, background: i < pressureLevel ? (i >= 6 ? "#ff4444" : i >= 4 ? "#ffaa00" : "#2a8a2a") : "#1a2a1a", borderRadius: 2 }} />
                  <div style={{ color: "#1a5a3a", fontSize: T.nano }}>L{i + 1}</div>
                </div>
              ))}
            </div>
          </div>
        );

      default:
        return <LcdLine text="..." dim />;
    }
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: "100vh", background: C.bg.page,
      fontFamily: "'Courier New', monospace",
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "20px",
      backgroundImage: `radial-gradient(ellipse at 20% 50%, ${C.bg.inset} 0%, ${C.bg.page} 70%)`
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Rajdhani:wght@300;500;700&display=swap');
        .pump-body { font-family: 'Share Tech Mono', monospace; }
        .btn-press { transform: scale(0.93); }
        .led-run { animation: ledPulse 1s ease-in-out infinite; }
        @keyframes ledPulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes flashRed { 0%,100%{background:#0a1a0a} 50%{background:#4a0f0f} }
        @keyframes flashAmber { 0%,100%{background:#0a1a0a} 50%{background:#3a2a00} }
        .flash-alarm { animation: flashRed 0.4s ease; }
        .flash-guardrail { animation: flashAmber 0.4s ease; }
        .softkey-btn:hover { background: #1e3a5f !important; }
        .chevron-btn:active { transform: scale(0.9); }
        .blink { animation: blink 1s step-end infinite; }
        @keyframes blink { 50%{opacity:0} }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #111; }
        ::-webkit-scrollbar-thumb { background: #1e4080; border-radius: 2px; }
      `}</style>

      {/* Pump chassis */}
      <div className="pump-body" style={{
        width: 380, background: "#1a1f2e",
        borderRadius: 16, boxShadow: "0 0 60px rgba(0,100,255,0.15), 0 20px 60px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.05)",
        border: "1px solid #2a3548", overflow: "hidden", position: "relative"
      }}>

        {/* Brand header */}
        <div style={{ background: "#0f1520", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #1e2d45" }}>
          <div>
            <div style={{ color: "#4a9eff", fontSize: 18, fontWeight: 700, letterSpacing: 3, fontFamily: "'Rajdhani', sans-serif" }}>ALARIS<sup style={{ fontSize: T.xs }}>®</sup></div>
            <div style={{ color: "#7090b0", fontSize: T.xs, letterSpacing: 4, marginTop: -2, fontFamily: "'Rajdhani', sans-serif" }}>GP VOLUMETRIC PUMP</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <div style={{ width: 20, height: 10, border: "1px solid #4a7a4a", borderRadius: 2, position: "relative", background: "#0a180a" }}>
                <div style={{ position: "absolute", left: 1, top: 1, bottom: 1, width: `${FACTORY_DEFAULTS.BATTERY_LEVEL * 0.18}px`, background: FACTORY_DEFAULTS.BATTERY_LEVEL > 30 ? "#3a8a3a" : "#8a3a3a", borderRadius: 1 }} />
              </div>
              <div style={{ color: "#3a7a3a", fontSize: T.nano }}>{FACTORY_DEFAULTS.BATTERY_LEVEL}%</div>
            </div>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: FACTORY_DEFAULTS.NETWORK_CONNECTED ? "#1a9a4a" : "#5a1a1a", boxShadow: FACTORY_DEFAULTS.NETWORK_CONNECTED ? "0 0 6px #1a9a4a" : "none" }} />
            <button
              onClick={handleReset}
              onMouseLeave={() => setConfirmReset(false)}
              title="Reset Alaris simulator to fresh state"
              style={{
                background: confirmReset ? '#4a0a0a' : '#1a1f2e',
                border: `1px solid ${confirmReset ? '#ff4444' : '#2a3a5a'}`,
                borderRadius: 4, padding: '3px 7px', cursor: 'pointer',
                color: confirmReset ? '#ff6666' : '#4a7aaa',
                fontSize: T.nano, letterSpacing: 1,
                fontFamily: "'Share Tech Mono', monospace",
                transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}>
              {confirmReset ? 'CONFIRM?' : '⟳ RESET'}
            </button>
          </div>
        </div>

        {/* LCD Display */}
        <div
          className={displayFlash === "alarm" ? "flash-alarm" : displayFlash === "guardrail" ? "flash-guardrail" : ""}
          style={{
            background: "#0a1a0a", margin: 12, borderRadius: 8,
            border: "2px solid #1a2e1a", padding: "12px 14px",
            boxShadow: "inset 0 2px 8px rgba(0,0,0,0.8), 0 0 20px rgba(0,200,50,0.05)",
            minHeight: 160, position: "relative"
          }}>

          {/* Pressure bar */}
          <div style={{ position: "absolute", top: 8, right: 10, display: "flex", gap: 2, alignItems: "flex-end" }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ width: 3, height: 4 + i * 2, background: i < pumpState.pressureLevel ? (i >= 6 ? "#ff4444" : i >= 4 ? "#ffaa00" : "#2a8a2a") : "#1a2a1a", borderRadius: 1 }} />
            ))}
          </div>

          {/* Network/Gateway icon */}
          <div style={{ position: "absolute", top: 8, left: 10, color: FACTORY_DEFAULTS.NETWORK_CONNECTED ? "#1a7a4a" : "#333", fontSize: T.nano }}>
            {FACTORY_DEFAULTS.NETWORK_CONNECTED ? "⊛ GATEWAY" : "○ STANDALONE"}
          </div>

          {renderDisplay()}
        </div>

        {/* Softkeys */}
        <div style={{ display: "flex", gap: 0, margin: "0 12px 8px", borderTop: "1px solid #1e2d45" }}>
          {getSoftkeys().map((sk, i) => (
            <button key={i} className="softkey-btn" onClick={sk.action}
              style={{ flex: 1, background: sk.primary ? "#0d2240" : "#0a1520", border: "none", borderRight: i < 2 ? "1px solid #1e2d45" : "none", padding: "8px 4px", cursor: "pointer", transition: "background 0.1s" }}>
              <div style={{ color: sk.primary ? "#4a9eff" : "#3a6080", fontSize: T.nano, textAlign: "center", letterSpacing: 1 }}>{sk.label}</div>
            </button>
          ))}
        </div>

        {/* Chevron keys */}
        <div style={{ display: "flex", justifyContent: "center", gap: 8, padding: "8px 16px", background: "#0f1520", borderTop: "1px solid #1e2d45" }}>
          <ChevronButton label="««" onPressDown={pump.chevronHandlers.onLargeDown} onRelease={pump.chevronHandlers.onRelease} />
          <ChevronButton label="«" onPressDown={pump.chevronHandlers.onSmallDown} onRelease={pump.chevronHandlers.onRelease} />
          <ChevronButton label="»" onPressDown={pump.chevronHandlers.onSmallUp} onRelease={pump.chevronHandlers.onRelease} />
          <ChevronButton label="»»" onPressDown={pump.chevronHandlers.onLargeUp} onRelease={pump.chevronHandlers.onRelease} />
        </div>

        {/* Main control buttons — 7 physical buttons per DFU spec (no hardware SILENCE) */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, padding: "10px 14px 14px" }}>
          <PumpButton label="RUN" color="#1a5a1a" activeColor="#2a8a2a"
            active={pumpState.screen === "RUNNING"} led={pumpState.screen === "RUNNING"} ledColor="#3aff3a"
            onClick={pump.handleRun} />
          <PumpButton label="HOLD" color="#4a3a0a" activeColor="#7a5a1a"
            active={pumpState.screen === "ON_HOLD"} onClick={pump.handleHold} />
          <PumpButton label="BOLUS" color="#1a2a4a" activeColor="#2a4a7a"
            active={pumpState.bolusActive}
            onMouseDown={pump.startBolus} onMouseUp={pump.stopBolus} onMouseLeave={pump.stopBolus}
            onClick={() => {}} />
          {/* MUTE — active while within 120s silence window */}
          <PumpButton label={pump.isMuted ? "MUTED" : "MUTE"} color="#2a1a2a" activeColor="#4a2a4a"
            active={pump.isMuted} onClick={pump.handleMute} />
          <PumpButton label="OPTIONS" color="#1a2030" activeColor="#2a3050" onClick={pump.handleOptions} />
          <PumpButton label="PRESSURE" color="#1a2030" activeColor="#2a3050" onClick={pump.handlePressure} />
          {/* ON/OFF — hold 3s to power off per DFU spec */}
          <PumpButton label={pump.poweringOff ? "HOLD…" : "ON/OFF"} color="#2a0a0a" activeColor="#4a1a1a"
            active={pump.poweringOff}
            onMouseDown={pump.handlePowerOffStart}
            onMouseUp={pump.handlePowerOffCancel}
            onMouseLeave={pump.handlePowerOffCancel}
            onClick={() => {}} />
          {/* Slot 8 — empty (real device has no 8th button here) */}
          <div />
        </div>

        {/* Status bar */}
        <div style={{ background: "#080e18", padding: "6px 14px", display: "flex", justifyContent: "space-between", borderTop: "1px solid #1a2030" }}>
          <span style={{ color: "#2a5080", fontSize: T.nano }}>FW{FACTORY_DEFAULTS.FIRMWARE_VERSION}</span>
          <span style={{ color: "#2a5080", fontSize: T.nano }}>MAINT{FACTORY_DEFAULTS.DAYS_SINCE_MAINTENANCE}d</span>
          <span style={{ color: "#2a5080", fontSize: T.nano }}>LIB{FACTORY_DEFAULTS.LIBRARY_AGE_DAYS}d</span>
          <span style={{ color: guardrailStatus.status === "warning" ? "#aa6600" : guardrailStatus.status === "blocked" ? "#aa2200" : "#1a5a1a", fontSize: T.nano }}>
            {guardrailStatus.status === "ok" ? "◉ GUARDRAILS" : guardrailStatus.status === "warning" ? "⚠ SOFT LIMIT" : "✗ HARD LIMIT"}
          </span>
        </div>
      </div>

      {/* Research panel */}
      <div style={{ width: 380, marginTop: 12 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowLog(!showLog)}
            style={{ flex: 1, background: C.bg.panel, border: `1px solid ${C.border.default}`, color: C.accent.blue, padding: "8px", borderRadius: 6, cursor: "pointer", fontSize: T.nano, fontFamily: "'Share Tech Mono', monospace" }}>
            {showLog ? "HIDE LOG" : `SESSION LOG (${pump.sessionLog.length})`}
          </button>
          <button onClick={exportCSV}
            style={{ flex: 1, background: C.bg.panel, border: `1px solid ${C.border.default}`, color: C.accent.blue, padding: "8px", borderRadius: 6, cursor: "pointer", fontSize: T.nano, fontFamily: "'Share Tech Mono', monospace" }}>
            EXPORT CSV
          </button>
        </div>

        {/* Live metrics */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginTop: 8 }}>
          {[
            { label: "KEYPRESSES", value: pump.keypressCount },
            { label: "CORRECTIONS", value: pump.correctionCount },
            { label: "BOUNDARY HITS", value: pump.boundaryHitCount },
            { label: "OVERRIDES", value: pump.overrideCount },
          ].map(m => (
            <div key={m.label} style={{ background: C.bg.panel, border: `1px solid ${C.border.default}`, borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
              <div style={{ color: C.text.secondary, fontSize: T.nano, letterSpacing: 1 }}>{m.label}</div>
              <div style={{ color: C.accent.blue, fontSize: T.xl, fontWeight: "bold", fontFamily: "'Share Tech Mono', monospace" }}>{m.value}</div>
            </div>
          ))}
        </div>

        {/* Session log table */}
        {showLog && (
          <div style={{ marginTop: 8, background: C.bg.panel, border: `1px solid ${C.border.default}`, borderRadius: 6, maxHeight: 200, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: T.nano, fontFamily: "'Share Tech Mono', monospace" }}>
              <thead>
                <tr style={{ background: C.bg.hover }}>
                  {["ms", "screen", "event", "rate", "delta"].map(h => (
                    <th key={h} style={{ padding: "4px 6px", color: C.text.secondary, textAlign: "left", borderBottom: `1px solid ${C.border.default}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...pump.sessionLog].reverse().slice(0, 30).map((e, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border.subtle}` }}>
                    <td style={{ padding: "3px 6px", color: C.text.secondary }}>{e.timestamp}</td>
                    <td style={{ padding: "3px 6px", color: C.accent.cyan, fontSize: T.nano }}>{e.screen?.slice(0, 10)}</td>
                    <td style={{ padding: "3px 6px", color: C.accent.blue }}>{e.event}</td>
                    <td style={{ padding: "3px 6px", color: C.accent.green }}>{typeof e.rate === 'number' ? e.rate.toFixed(1) : ""}</td>
                    <td style={{ padding: "3px 6px", color: (e.delta as number) > 0 ? C.accent.green : (e.delta as number) < 0 ? C.accent.red : C.text.dim }}>{e.delta !== undefined ? String(e.delta) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}


