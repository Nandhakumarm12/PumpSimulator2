import { useState, useEffect, useRef, useCallback } from "react";

// ─── DRUG LIBRARY (from Alaris GP DFU manual - real drugs/concentrations) ───
const DRUG_LIBRARY = [
  { name: "MANUAL (ml/h)", unit: "ml/h", concentration: null, softMin: 1, softMax: 1200, hardMin: 0.1, hardMax: 1200, defaultRate: 100, bolus: false },
  { name: "ADRENALINE", unit: "µg/kg/min", concentration: 4, softMin: 0.01, softMax: 0.5, hardMin: 0.001, hardMax: 1.0, defaultRate: 0.1, bolus: true },
  { name: "MORPHINE", unit: "mg/h", concentration: 1, softMin: 1, softMax: 10, hardMin: 0.5, hardMax: 20, defaultRate: 2, bolus: true },
  { name: "HEPARIN", unit: "U/h", concentration: 1000, softMin: 500, softMax: 2000, hardMin: 100, hardMax: 5000, defaultRate: 1000, bolus: false },
  { name: "DOPAMINE", unit: "µg/kg/min", concentration: 3.2, softMin: 2, softMax: 20, hardMin: 1, hardMax: 50, defaultRate: 5, bolus: false },
  { name: "NORADRENALINE", unit: "µg/kg/min", concentration: 4, softMin: 0.01, softMax: 0.3, hardMin: 0.001, hardMax: 2.0, defaultRate: 0.05, bolus: false },
  { name: "PROPOFOL", unit: "mg/kg/h", concentration: 10, softMin: 1, softMax: 6, hardMin: 0.5, hardMax: 12, defaultRate: 2, bolus: false },
  { name: "INSULIN", unit: "U/h", concentration: 1, softMin: 1, softMax: 10, hardMin: 0.5, hardMax: 50, defaultRate: 2, bolus: false },
  { name: "AMIODARONE", unit: "mg/h", concentration: 1.8, softMin: 10, softMax: 100, hardMin: 5, hardMax: 150, defaultRate: 30, bolus: false },
  { name: "KCl 20mmol", unit: "mmol/h", concentration: 1, softMin: 5, softMax: 20, hardMin: 1, hardMax: 40, defaultRate: 10, bolus: false },
];

// Factory defaults from DFU manual
const FACTORY_DEFAULTS = {
  rateMax: 1200, rateMin: 0.1,
  vtbiMax: 9999, vtbiMin: 0.1,
  kvoRate: 1.0,
  bolusRateDefault: 500, bolusRateMax: 1200, bolusVolumeMax: 5,
  pressureDefault: 5, pressureMax: 8,
  ailLimitMax: 100,
  alarmVolume: "medium",
  weightDefault: 70,
  batteryLevel: 87,
  firmwareVersion: "9.12",
  daysSinceMaintenance: 47,
  libraryAgeDays: 23,
  networkConnected: true,
};

// ─── PUMP STATE MACHINE ───────────────────────────────────────────────────────
const SCREENS = {
  LANGUAGE: "LANGUAGE",
  DRUG_SELECT: "DRUG_SELECT",
  RATE_ENTRY: "RATE_ENTRY",
  VTBI_ENTRY: "VTBI_ENTRY",
  GUARDRAIL_WARNING: "GUARDRAIL_WARNING",
  GUARDRAIL_BLOCKED: "GUARDRAIL_BLOCKED",
  RUNNING: "RUNNING",
  ON_HOLD: "ON_HOLD",
  BOLUS: "BOLUS",
  ALARM: "ALARM",
  OPTIONS: "OPTIONS",
  PRESSURE_VIEW: "PRESSURE_VIEW",
};

function computeGuardrailStatus(rate, drug) {
  if (!drug || drug.name === "MANUAL (ml/h)") return "ok";
  if (rate < drug.hardMin || rate > drug.hardMax) return "blocked";
  if (rate < drug.softMin || rate > drug.softMax) return "warning";
  return "ok";
}

function rateToMlH(rate, drug, weight) {
  if (!drug || drug.unit === "ml/h") return rate;
  if (drug.unit.includes("kg")) return (rate * weight * 60) / drug.concentration;
  return rate / drug.concentration * (drug.unit.includes("min") ? 60 : 1);
}

export default function AlarisGPSimulator() {
  // ── Pump core state ──────────────────────────────────────────────────────
  const [screen, setScreen] = useState(SCREENS.LANGUAGE);
  const [selectedDrug, setSelectedDrug] = useState(DRUG_LIBRARY[0]);
  const [rate, setRate] = useState(0.0);          // display rate (in drug units)
  const [rateBuffer, setRateBuffer] = useState(0.0); // rate being edited
  const [vtbi, setVtbi] = useState(null);
  const [vtbiBuffer, setVtbiBuffer] = useState(500.0);
  const [volumeInfused, setVolumeInfused] = useState(0.0);
  const [patientWeight, setPatientWeight] = useState(FACTORY_DEFAULTS.weightDefault);
  const [pressureLevel, setPressureLevel] = useState(FACTORY_DEFAULTS.pressureDefault);
  const [alarmMessage, setAlarmMessage] = useState("");
  const [guardrailOverride, setGuardrailOverride] = useState(false);
  const [overrideCount, setOverrideCount] = useState(0);
  const [bolusActive, setBolusActive] = useState(false);
  const [bolusVolume, setBolusVolume] = useState(0);

  // ── Session / research logging ───────────────────────────────────────────
  const [sessionLog, setSessionLog] = useState([]);
  const [sessionStart] = useState(Date.now());
  const [keypressCount, setKeypressCount] = useState(0);
  const [correctionCount, setCorrectionCount] = useState(0);
  const [boundaryHits, setBoundaryHits] = useState(0);
  const [entryStartTime, setEntryStartTime] = useState(null);

  // ── UI state ─────────────────────────────────────────────────────────────
  const [activeBtn, setActiveBtn] = useState(null);
  const [displayFlash, setDisplayFlash] = useState(null); // 'alarm' | 'guardrail'
  const [showLog, setShowLog] = useState(false);
  const [runLedFlash, setRunLedFlash] = useState(false);

  // ── Timers ────────────────────────────────────────────────────────────────
  const holdTimer = useRef(null);
  const runTimer = useRef(null);
  const bolusTimer = useRef(null);

  // ── Infusion tick (running state) ─────────────────────────────────────────
  useEffect(() => {
    if (screen === SCREENS.RUNNING) {
      runTimer.current = setInterval(() => {
        const mlPerTick = (rateToMlH(rate, selectedDrug, patientWeight) / 3600) * 0.5;
        setVolumeInfused(v => {
          const next = +(v + mlPerTick).toFixed(2);
          if (vtbi !== null && next >= vtbi) {
            triggerAlarm("INFUSION COMPLETE");
            return vtbi;
          }
          return next;
        });
        setRunLedFlash(f => !f);
      }, 500);
    }
    return () => clearInterval(runTimer.current);
  }, [screen, rate, vtbi, selectedDrug, patientWeight]);

  // ── Flash helper ──────────────────────────────────────────────────────────
  function flash(type) {
    setDisplayFlash(type);
    setTimeout(() => setDisplayFlash(null), 400);
  }

  function triggerAlarm(msg) {
    setAlarmMessage(msg);
    setScreen(SCREENS.ALARM);
    flash("alarm");
  }

  // ── Logging ───────────────────────────────────────────────────────────────
  function logEvent(event, meta = {}) {
    const entry = {
      timestamp: Date.now() - sessionStart,
      screen, event,
      rate: rateBuffer,
      drug: selectedDrug.name,
      ...meta,
    };
    setSessionLog(prev => [...prev, entry]);
  }

  // ── Chevron (rate adjustment) logic ───────────────────────────────────────
  const LARGE_STEP = 10;
  const SMALL_STEP = 1;

  function adjustRate(delta) {
    const wasAtBoundary = rateBuffer <= FACTORY_DEFAULTS.rateMin || rateBuffer >= FACTORY_DEFAULTS.rateMax;
    const raw = +(rateBuffer + delta).toFixed(1);
    const newRate = Math.max(FACTORY_DEFAULTS.rateMin, Math.min(FACTORY_DEFAULTS.rateMax, raw));

    if (newRate === rateBuffer) {
      setBoundaryHits(b => b + 1);
      flash("boundary");
      logEvent("boundary_hit", { delta });
      return;
    }

    // Detect correction (direction reversal)
    if (sessionLog.length > 0) {
      const last = sessionLog[sessionLog.length - 1];
      if (last.event === "rate_adjust" && Math.sign(last.delta) !== Math.sign(delta)) {
        setCorrectionCount(c => c + 1);
      }
    }

    setRateBuffer(newRate);
    setKeypressCount(k => k + 1);
    logEvent("rate_adjust", { delta, newRate, from: rateBuffer });
  }

  function adjustVtbi(delta) {
    const newV = Math.max(0.1, Math.min(FACTORY_DEFAULTS.vtbiMax, +(vtbiBuffer + delta).toFixed(1)));
    setVtbiBuffer(newV);
    setKeypressCount(k => k + 1);
  }

  // ── Button handlers ───────────────────────────────────────────────────────
  function handleRun() {
    if (screen === SCREENS.RATE_ENTRY) {
      const status = computeGuardrailStatus(rateBuffer, selectedDrug);
      if (status === "blocked") {
        flash("alarm");
        setScreen(SCREENS.GUARDRAIL_BLOCKED);
        logEvent("guardrail_blocked", { rate: rateBuffer });
        return;
      }
      if (status === "warning" && !guardrailOverride) {
        flash("guardrail");
        setScreen(SCREENS.GUARDRAIL_WARNING);
        logEvent("guardrail_warning", { rate: rateBuffer });
        return;
      }
      setRate(rateBuffer);
      if (!entryStartTime) setEntryStartTime(Date.now());
      setScreen(SCREENS.RUNNING);
      logEvent("infusion_started", {
        rate: rateBuffer, drug: selectedDrug.name, vtbi, guardrailOverride,
        entryTime: entryStartTime ? Date.now() - entryStartTime : 0,
        keypressCount, correctionCount, boundaryHits,
      });
    } else if (screen === SCREENS.ON_HOLD) {
      setScreen(SCREENS.RUNNING);
      logEvent("resumed");
    }
  }

  function handleHold() {
    if (screen === SCREENS.RUNNING) {
      setScreen(SCREENS.ON_HOLD);
      logEvent("hold");
    }
  }

  function handleOptions() {
    if ([SCREENS.RUNNING, SCREENS.ON_HOLD, SCREENS.RATE_ENTRY].includes(screen)) {
      setScreen(SCREENS.OPTIONS);
      logEvent("options_opened");
    }
  }

  function handlePressure() {
    setScreen(SCREENS.PRESSURE_VIEW);
    logEvent("pressure_viewed");
  }

  function handleMute() { logEvent("mute_pressed"); }

  function startBolus() {
    if (screen !== SCREENS.RUNNING || !selectedDrug.bolus) return;
    setBolusActive(true);
    logEvent("bolus_started");
    bolusTimer.current = setInterval(() => {
      setBolusVolume(v => {
        if (v >= FACTORY_DEFAULTS.bolusVolumeMax) {
          stopBolus();
          return v;
        }
        return +(v + 0.1).toFixed(1);
      });
    }, 100);
  }

  function stopBolus() {
    clearInterval(bolusTimer.current);
    setBolusActive(false);
    logEvent("bolus_ended", { bolusVolume });
    setBolusVolume(0);
  }

  // Hold-to-accelerate
  function startHold(action) {
    setActiveBtn(action);
    action();
    holdTimer.current = setTimeout(() => {
      const interval = setInterval(action, 80);
      holdTimer.current = interval;
    }, 500);
  }

  function endHold() {
    setActiveBtn(null);
    clearTimeout(holdTimer.current);
    clearInterval(holdTimer.current);
  }

  // CSV export
  function exportCSV() {
    const headers = "timestamp_ms,screen,event,rate,drug,delta,newRate,guardrailOverride,entryTime,keypressCount,correctionCount,boundaryHits\n";
    const rows = sessionLog.map(e =>
      [e.timestamp, e.screen, e.event, e.rate, e.drug, e.delta ?? "", e.newRate ?? "",
       e.guardrailOverride ?? "", e.entryTime ?? "", e.keypressCount ?? "",
       e.correctionCount ?? "", e.boundaryHits ?? ""].join(",")
    ).join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `alaris_session_${Date.now()}.csv`; a.click();
  }

  // ── Render helpers ─────────────────────────────────────────────────────────
  const mlH = rateToMlH(rate || rateBuffer, selectedDrug, patientWeight);
  const timeRemaining = vtbi && mlH > 0
    ? Math.max(0, ((vtbi - volumeInfused) / mlH) * 60)
    : null;

  function formatTime(mins) {
    if (mins === null) return "--:--:--";
    const h = Math.floor(mins / 60);
    const m = Math.floor(mins % 60);
    const s = Math.floor((mins * 60) % 60);
    return `${h}h ${String(m).padStart(2,"0")}m ${String(s).padStart(2,"0")}s`;
  }

  const guardrailStatus = computeGuardrailStatus(rateBuffer, selectedDrug);

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: "100vh", background: "#0d1117",
      fontFamily: "'Courier New', monospace",
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "20px",
      backgroundImage: "radial-gradient(ellipse at 20% 50%, #0a1628 0%, #0d1117 70%)"
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Rajdhani:wght@300;500;700&display=swap');
        .pump-body { font-family: 'Share Tech Mono', monospace; }
        .label-font { font-family: 'Rajdhani', sans-serif; }
        .btn-press { transform: scale(0.93); }
        .led-run { animation: ledPulse 1s ease-in-out infinite; }
        @keyframes ledPulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes flashRed { 0%,100%{background:#1a0f0f} 50%{background:#4a0f0f} }
        @keyframes flashAmber { 0%,100%{background:#1a1400} 50%{background:#3a2a00} }
        .flash-alarm { animation: flashRed 0.4s ease; }
        .flash-guardrail { animation: flashAmber 0.4s ease; }
        .flash-boundary { animation: flashAmber 0.2s ease; }
        .softkey-btn:hover { background: #1e3a5f !important; }
        .chevron-btn:active { transform: scale(0.9); }
        .blink { animation: blink 1s step-end infinite; }
        @keyframes blink { 50%{opacity:0} }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #111; }
        ::-webkit-scrollbar-thumb { background: #1e4080; border-radius: 2px; }
      `}</style>

      {/* ── Pump chassis ── */}
      <div className="pump-body" style={{
        width: 380, background: "#1a1f2e",
        borderRadius: 16, boxShadow: "0 0 60px rgba(0,100,255,0.15), 0 20px 60px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.05)",
        border: "1px solid #2a3548", overflow: "hidden", position: "relative"
      }}>

        {/* ── Brand header ── */}
        <div style={{ background: "#0f1520", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #1e2d45" }}>
          <div>
            <div className="label-font" style={{ color: "#4a9eff", fontSize: 18, fontWeight: 700, letterSpacing: 3 }}>ALARIS<sup style={{fontSize:10}}>®</sup></div>
            <div className="label-font" style={{ color: "#7090b0", fontSize: 10, letterSpacing: 4, marginTop: -2 }}>GP VOLUMETRIC PUMP</div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {/* Battery */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <div style={{ width: 20, height: 10, border: "1px solid #4a7a4a", borderRadius: 2, position: "relative", background: "#0a180a" }}>
                <div style={{ position: "absolute", left: 1, top: 1, bottom: 1, width: `${FACTORY_DEFAULTS.batteryLevel * 0.18}px`, background: FACTORY_DEFAULTS.batteryLevel > 30 ? "#3a8a3a" : "#8a3a3a", borderRadius: 1 }} />
              </div>
              <div style={{ color: "#3a7a3a", fontSize: 7 }}>{FACTORY_DEFAULTS.batteryLevel}%</div>
            </div>
            {/* Network */}
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: FACTORY_DEFAULTS.networkConnected ? "#1a9a4a" : "#5a1a1a", boxShadow: FACTORY_DEFAULTS.networkConnected ? "0 0 6px #1a9a4a" : "none" }} />
          </div>
        </div>

        {/* ── LCD Display ── */}
        <div
          className={displayFlash === "alarm" ? "flash-alarm" : displayFlash === "guardrail" ? "flash-guardrail" : displayFlash === "boundary" ? "flash-boundary" : ""}
          style={{
            background: "#0a1a0a", margin: 12, borderRadius: 8,
            border: "2px solid #1a2e1a", padding: "12px 14px",
            boxShadow: "inset 0 2px 8px rgba(0,0,0,0.8), 0 0 20px rgba(0,200,50,0.05)",
            minHeight: 160, position: "relative"
          }}>

          {/* Pressure bar — always visible */}
          <div style={{ position: "absolute", top: 8, right: 10, display: "flex", gap: 2, alignItems: "flex-end" }}>
            {Array.from({length: 8}).map((_,i) => (
              <div key={i} style={{ width: 3, height: 4 + i*2, background: i < pressureLevel ? (i >= 6 ? "#ff4444" : i >= 4 ? "#ffaa00" : "#2a8a2a") : "#1a2a1a", borderRadius: 1 }} />
            ))}
          </div>

          {/* Network/Gateway icon */}
          <div style={{ position: "absolute", top: 8, left: 10, color: FACTORY_DEFAULTS.networkConnected ? "#1a7a4a" : "#333", fontSize: 9 }}>
            {FACTORY_DEFAULTS.networkConnected ? "⊛ GATEWAY" : "○ STANDALONE"}
          </div>

          {renderDisplay()}
        </div>

        {/* ── Softkeys ── */}
        <div style={{ display: "flex", gap: 0, margin: "0 12px 8px", borderTop: "1px solid #1e2d45" }}>
          {getSoftkeys().map((sk, i) => (
            <button key={i} className="softkey-btn" onClick={sk.action}
              style={{ flex: 1, background: sk.primary ? "#0d2240" : "#0a1520", border: "none", borderRight: i < 2 ? "1px solid #1e2d45" : "none", padding: "8px 4px", cursor: "pointer", transition: "background 0.1s" }}>
              <div style={{ color: sk.primary ? "#4a9eff" : "#3a6080", fontSize: 9, textAlign: "center", letterSpacing: 1 }}>{sk.label}</div>
            </button>
          ))}
        </div>

        {/* ── Chevron keys (main rate entry) ── */}
        <div style={{ display: "flex", justifyContent: "center", gap: 8, padding: "8px 16px", background: "#0f1520", borderTop: "1px solid #1e2d45" }}>
          {/* Double chevron down */}
          <ChevronButton label="««" onPress={() => adjustRate(-LARGE_STEP)} isActive={activeBtn?.name === "ll_down"} name="ll_down" startHold={startHold} endHold={endHold} />
          {/* Single chevron down */}
          <ChevronButton label="«" onPress={() => adjustRate(-SMALL_STEP)} isActive={activeBtn?.name === "l_down"} name="l_down" startHold={startHold} endHold={endHold} />
          {/* Single chevron up */}
          <ChevronButton label="»" onPress={() => adjustRate(+SMALL_STEP)} isActive={activeBtn?.name === "l_up"} name="l_up" startHold={startHold} endHold={endHold} />
          {/* Double chevron up */}
          <ChevronButton label="»»" onPress={() => adjustRate(+LARGE_STEP)} isActive={activeBtn?.name === "ll_up"} name="ll_up" startHold={startHold} endHold={endHold} />
        </div>

        {/* ── Main control buttons ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, padding: "10px 14px 14px" }}>
          <PumpButton label="RUN" color="#1a5a1a" activeColor="#2a8a2a" led={screen === SCREENS.RUNNING} ledColor="#3aff3a" onClick={handleRun} />
          <PumpButton label="HOLD" color="#4a3a0a" activeColor="#7a5a1a" active={screen === SCREENS.ON_HOLD} onClick={handleHold} />
          <PumpButton label="BOLUS" color="#1a2a4a" activeColor="#2a4a7a" active={bolusActive}
            onMouseDown={startBolus} onMouseUp={stopBolus} onMouseLeave={stopBolus} onClick={() => {}} />
          <PumpButton label="MUTE" color="#2a1a2a" activeColor="#4a2a4a" onClick={handleMute} />
          <PumpButton label="OPTIONS" color="#1a2030" activeColor="#2a3050" onClick={handleOptions} />
          <PumpButton label="PRESSURE" color="#1a2030" activeColor="#2a3050" onClick={handlePressure} />
          <PumpButton label="ON/OFF" color="#2a0a0a" activeColor="#4a1a1a" onClick={() => {
            if (window.confirm("Switch pump OFF?")) { setScreen(SCREENS.LANGUAGE); setVolumeInfused(0); setRate(0); setRateBuffer(0); }
          }} />
          <PumpButton label="SILENCE" color="#1a2030" activeColor="#2a3050" onClick={handleMute} />
        </div>

        {/* ── Status bar ── */}
        <div style={{ background: "#080e18", padding: "6px 14px", display: "flex", justifyContent: "space-between", borderTop: "1px solid #1a2030" }}>
          <span style={{ color: "#2a5080", fontSize: 9 }}>FW {FACTORY_DEFAULTS.firmwareVersion}</span>
          <span style={{ color: "#2a5080", fontSize: 9 }}>MAINT {FACTORY_DEFAULTS.daysSinceMaintenance}d</span>
          <span style={{ color: "#2a5080", fontSize: 9 }}>LIB {FACTORY_DEFAULTS.libraryAgeDays}d</span>
          <span style={{ color: guardrailStatus === "warning" ? "#aa6600" : guardrailStatus === "blocked" ? "#aa2200" : "#1a5a1a", fontSize: 9 }}>
            {guardrailStatus === "ok" ? "◉ GUARDRAILS" : guardrailStatus === "warning" ? "⚠ SOFT LIMIT" : "✗ HARD LIMIT"}
          </span>
        </div>
      </div>

      {/* ── Research panel ── */}
      <div style={{ width: 380, marginTop: 12 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowLog(!showLog)}
            style={{ flex: 1, background: "#0d1a2a", border: "1px solid #1e3a5f", color: "#4a9eff", padding: "8px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: "'Share Tech Mono', monospace" }}>
            {showLog ? "HIDE LOG" : `SESSION LOG (${sessionLog.length})`}
          </button>
          <button onClick={exportCSV}
            style={{ flex: 1, background: "#0d1a2a", border: "1px solid #1e3a5f", color: "#4a9eff", padding: "8px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: "'Share Tech Mono', monospace" }}>
            EXPORT CSV
          </button>
        </div>

        {/* Live metrics */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginTop: 8 }}>
          {[
            { label: "KEYPRESSES", value: keypressCount },
            { label: "CORRECTIONS", value: correctionCount },
            { label: "BOUNDARY HITS", value: boundaryHits },
            { label: "OVERRIDES", value: overrideCount },
          ].map(m => (
            <div key={m.label} style={{ background: "#0d1520", border: "1px solid #1e2d45", borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
              <div style={{ color: "#2a6090", fontSize: 8, letterSpacing: 1 }}>{m.label}</div>
              <div style={{ color: "#4a9eff", fontSize: 18, fontWeight: "bold", fontFamily: "'Share Tech Mono', monospace" }}>{m.value}</div>
            </div>
          ))}
        </div>

        {/* Session log table */}
        {showLog && (
          <div style={{ marginTop: 8, background: "#080e18", border: "1px solid #1e2d45", borderRadius: 6, maxHeight: 200, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9, fontFamily: "'Share Tech Mono', monospace" }}>
              <thead>
                <tr style={{ background: "#0d1a2a" }}>
                  {["ms", "screen", "event", "rate", "delta"].map(h => (
                    <th key={h} style={{ padding: "4px 6px", color: "#3a6080", textAlign: "left", borderBottom: "1px solid #1e2d45" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sessionLog.slice(-30).reverse().map((e, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #0d1520" }}>
                    <td style={{ padding: "3px 6px", color: "#2a6090" }}>{e.timestamp}</td>
                    <td style={{ padding: "3px 6px", color: "#1a7a5a", fontSize: 8 }}>{e.screen?.slice(0,8)}</td>
                    <td style={{ padding: "3px 6px", color: "#4a9eff" }}>{e.event}</td>
                    <td style={{ padding: "3px 6px", color: "#aacc88" }}>{e.rate?.toFixed ? e.rate.toFixed(1) : e.rate}</td>
                    <td style={{ padding: "3px 6px", color: e.delta > 0 ? "#4aaa4a" : e.delta < 0 ? "#aa4a4a" : "#666" }}>{e.delta ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Screen content renderer ── */}
      {renderModal()}
    </div>
  );

  // ─── DISPLAY RENDERER ────────────────────────────────────────────────────
  function renderDisplay() {
    switch (screen) {
      case SCREENS.LANGUAGE:
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

      case SCREENS.DRUG_SELECT:
        return (
          <div style={{ paddingTop: 8 }}>
            <LcdLine text="SELECT DRUG / MODE" dim />
            <div style={{ marginTop: 6, maxHeight: 100, overflowY: "auto" }}>
              {DRUG_LIBRARY.map((drug, i) => (
                <div key={drug.name} onClick={() => {
                  setSelectedDrug(drug);
                  setRateBuffer(drug.defaultRate);
                  setEntryStartTime(Date.now());
                  setScreen(SCREENS.RATE_ENTRY);
                  logEvent("drug_selected", { drug: drug.name });
                }}
                style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", cursor: "pointer",
                  color: selectedDrug.name === drug.name ? "#3aff3a" : "#1a8a2a",
                  borderBottom: "1px solid #0a1a0a", fontSize: 11 }}>
                  <span>{drug.name}</span>
                  <span style={{ color: "#1a5a3a", fontSize: 10 }}>{drug.unit}</span>
                </div>
              ))}
            </div>
          </div>
        );

      case SCREENS.RATE_ENTRY:
        return (
          <div style={{ paddingTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <LcdLine text={selectedDrug.name} bright />
              <LcdLine text="ON HOLD" dim />
            </div>
            <LcdLine text="RATE" dim />
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, margin: "6px 0" }}>
              <div style={{ color: "#3aff3a", fontSize: 36, fontWeight: "bold", letterSpacing: 2, textShadow: "0 0 20px rgba(58,255,58,0.5)" }}>
                {rateBuffer.toFixed(1)}
              </div>
              <div style={{ color: "#1a8a2a", fontSize: 14 }}>{selectedDrug.unit}</div>
            </div>
            {selectedDrug.unit !== "ml/h" && (
              <div style={{ color: "#1a6a3a", fontSize: 11, marginBottom: 4 }}>
                = {rateToMlH(rateBuffer, selectedDrug, patientWeight).toFixed(1)} ml/h
              </div>
            )}
            {/* Guardrail indicator */}
            {guardrailStatus !== "ok" && (
              <div style={{ color: guardrailStatus === "warning" ? "#ffaa00" : "#ff4444", fontSize: 10, marginTop: 4 }}>
                {guardrailStatus === "warning" ? `⚠ SOFT LIMIT (${selectedDrug.softMin}–${selectedDrug.softMax} ${selectedDrug.unit})` : `✗ HARD LIMIT EXCEEDED`}
              </div>
            )}
            <LcdLine text={`VOL INFUSED: ${volumeInfused.toFixed(1)} ml`} dim />
          </div>
        );

      case SCREENS.VTBI_ENTRY:
        return (
          <div style={{ paddingTop: 12 }}>
            <LcdLine text="SET VTBI" bright />
            <LcdLine text="" />
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, margin: "8px 0" }}>
              <div style={{ color: "#3aff3a", fontSize: 36, fontWeight: "bold", letterSpacing: 2, textShadow: "0 0 20px rgba(58,255,58,0.5)" }}>
                {vtbiBuffer.toFixed(1)}
              </div>
              <div style={{ color: "#1a8a2a", fontSize: 14 }}>ml</div>
            </div>
            <LcdLine text={`MAX: ${FACTORY_DEFAULTS.vtbiMax} ml`} dim />
          </div>
        );

      case SCREENS.GUARDRAIL_WARNING:
        return (
          <div style={{ paddingTop: 8 }}>
            <div className="blink" style={{ color: "#ffaa00", fontSize: 13, marginBottom: 8 }}>⚠ GUARDRAIL ADVISORY</div>
            <LcdLine text={`RATE: ${rateBuffer.toFixed(1)} ${selectedDrug.unit}`} bright />
            <LcdLine text={`SOFT MAX: ${selectedDrug.softMax} ${selectedDrug.unit}`} dim />
            <div style={{ color: "#ffaa00", fontSize: 11, marginTop: 8 }}>Press RUN to override</div>
            <div style={{ color: "#1a7a3a", fontSize: 11 }}>Press HOLD to re-enter</div>
          </div>
        );

      case SCREENS.GUARDRAIL_BLOCKED:
        return (
          <div style={{ paddingTop: 8 }}>
            <div className="blink" style={{ color: "#ff4444", fontSize: 13, marginBottom: 8 }}>✗ HARD LIMIT EXCEEDED</div>
            <LcdLine text={`RATE: ${rateBuffer.toFixed(1)} ${selectedDrug.unit}`} bright />
            <LcdLine text={`HARD MAX: ${selectedDrug.hardMax} ${selectedDrug.unit}`} dim />
            <div style={{ color: "#ff4444", fontSize: 11, marginTop: 8 }}>Cannot exceed hard limit.</div>
            <div style={{ color: "#1a7a3a", fontSize: 11 }}>Press HOLD to re-enter rate.</div>
          </div>
        );

      case SCREENS.RUNNING:
      case SCREENS.ON_HOLD:
        const running = screen === SCREENS.RUNNING;
        return (
          <div style={{ paddingTop: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ color: running ? "#3aff3a" : "#ffaa00", fontSize: 11 }}>
                {running ? "▶ RUNNING" : "⏸ ON HOLD"}
                {bolusActive && <span style={{ color: "#4a9eff", marginLeft: 8 }}>BOLUS</span>}
              </div>
              <div style={{ color: "#1a5a3a", fontSize: 10 }}>{selectedDrug.name !== "MANUAL (ml/h)" ? "✦" : ""} {selectedDrug.name}</div>
            </div>
            <LcdLine text="RATE" dim />
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, margin: "4px 0" }}>
              <div style={{ color: "#3aff3a", fontSize: 32, fontWeight: "bold", letterSpacing: 2, textShadow: running ? "0 0 20px rgba(58,255,58,0.4)" : "none" }}>
                {rate.toFixed(1)}
              </div>
              <div style={{ color: "#1a8a2a", fontSize: 13 }}>{selectedDrug.unit}</div>
            </div>
            {selectedDrug.unit !== "ml/h" && (
              <div style={{ color: "#1a6a3a", fontSize: 11, marginBottom: 4 }}>
                {mlH.toFixed(1)} ml/h
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
              <div>
                <div style={{ color: "#1a5a3a", fontSize: 9 }}>VOLUME</div>
                <div style={{ color: "#2aaa2a", fontSize: 14 }}>{volumeInfused.toFixed(1)} <span style={{fontSize:10}}>ml</span></div>
              </div>
              {vtbi && (
                <div>
                  <div style={{ color: "#1a5a3a", fontSize: 9 }}>VTBI</div>
                  <div style={{ color: "#2aaa2a", fontSize: 14 }}>{(vtbi - volumeInfused).toFixed(1)} <span style={{fontSize:10}}>ml</span></div>
                </div>
              )}
              {timeRemaining !== null && (
                <div>
                  <div style={{ color: "#1a5a3a", fontSize: 9 }}>REMAINING</div>
                  <div style={{ color: "#2aaa2a", fontSize: 11 }}>{formatTime(timeRemaining)}</div>
                </div>
              )}
            </div>
          </div>
        );

      case SCREENS.ALARM:
        return (
          <div style={{ paddingTop: 16, textAlign: "center" }}>
            <div className="blink" style={{ color: "#ff3333", fontSize: 16, marginBottom: 12 }}>⚠ ALARM</div>
            <div style={{ color: "#ff6666", fontSize: 14, marginBottom: 8 }}>{alarmMessage}</div>
            <div style={{ color: "#1a7a3a", fontSize: 11 }}>Press MUTE to silence</div>
            <div style={{ color: "#1a7a3a", fontSize: 11 }}>Press RUN to restart</div>
          </div>
        );

      case SCREENS.OPTIONS:
        return (
          <div style={{ paddingTop: 8 }}>
            <LcdLine text="OPTIONS" bright />
            {[
              { label: "SET VTBI", action: () => { setScreen(SCREENS.VTBI_ENTRY); setVtbiBuffer(vtbi || 500); } },
              { label: `KVO RATE: ${FACTORY_DEFAULTS.kvoRate} ml/h`, action: () => {} },
              { label: "EVENT LOG", action: () => { setShowLog(true); setScreen(screen === SCREENS.RUNNING ? SCREENS.RUNNING : SCREENS.ON_HOLD); } },
              { label: "BACK", action: () => setScreen(screen === SCREENS.RUNNING ? SCREENS.RUNNING : SCREENS.ON_HOLD) },
            ].map(opt => (
              <div key={opt.label} onClick={opt.action}
                style={{ padding: "5px 0", color: "#2a9a4a", fontSize: 11, borderBottom: "1px solid #0a1a0a", cursor: "pointer" }}>
                ▸ {opt.label}
              </div>
            ))}
          </div>
        );

      case SCREENS.PRESSURE_VIEW:
        return (
          <div style={{ paddingTop: 8 }}>
            <LcdLine text="PRESSURE" bright />
            <div style={{ display: "flex", gap: 4, alignItems: "flex-end", margin: "12px 0" }}>
              {Array.from({length: 8}).map((_,i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <div style={{ width: 14, height: 8 + i*6, background: i < pressureLevel ? (i >= 6 ? "#ff4444" : i >= 4 ? "#ffaa00" : "#2a8a2a") : "#1a2a1a", borderRadius: 2 }} />
                  <div style={{ color: "#1a5a3a", fontSize: 8 }}>L{i+1}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={() => setPressureLevel(p => Math.max(1, p-1))} style={{ flex: 1, background: "#0d1a2a", border: "1px solid #1e3a5f", color: "#4a9eff", padding: 6, cursor: "pointer", borderRadius: 4, fontSize: 12 }}>–</button>
              <button onClick={() => setPressureLevel(p => Math.min(8, p+1))} style={{ flex: 1, background: "#0d1a2a", border: "1px solid #1e3a5f", color: "#4a9eff", padding: 6, cursor: "pointer", borderRadius: 4, fontSize: 12 }}>+</button>
              <button onClick={() => setScreen(screen)} style={{ flex: 1, background: "#0d1a2a", border: "1px solid #1e3a5f", color: "#4a9eff", padding: 6, cursor: "pointer", borderRadius: 4, fontSize: 10 }}>BACK</button>
            </div>
          </div>
        );

      default:
        return <LcdLine text="..." dim />;
    }
  }

  // ─── SOFTKEYS (context-sensitive) ────────────────────────────────────────
  function getSoftkeys() {
    switch (screen) {
      case SCREENS.LANGUAGE:
        return [
          { label: "OK", primary: true, action: () => { setScreen(SCREENS.DRUG_SELECT); logEvent("language_selected"); } },
          { label: "", action: () => {} },
          { label: "", action: () => {} },
        ];
      case SCREENS.DRUG_SELECT:
        return [
          { label: "SELECT", primary: true, action: () => { setScreen(SCREENS.RATE_ENTRY); setEntryStartTime(Date.now()); } },
          { label: "↑", action: () => {} },
          { label: "↓", action: () => {} },
        ];
      case SCREENS.RATE_ENTRY:
        return [
          { label: "RUN", primary: true, action: handleRun },
          { label: "VTBI", action: () => { setScreen(SCREENS.VTBI_ENTRY); logEvent("vtbi_setup"); } },
          { label: "DRUG", action: () => setScreen(SCREENS.DRUG_SELECT) },
        ];
      case SCREENS.VTBI_ENTRY:
        return [
          { label: "OK", primary: true, action: () => { setVtbi(vtbiBuffer); setScreen(SCREENS.RATE_ENTRY); logEvent("vtbi_set", { vtbi: vtbiBuffer }); } },
          { label: "CLR", action: () => { setVtbi(null); setVtbiBuffer(500); setScreen(SCREENS.RATE_ENTRY); } },
          { label: "BACK", action: () => setScreen(SCREENS.RATE_ENTRY) },
        ];
      case SCREENS.GUARDRAIL_WARNING:
        return [
          { label: "OVERRIDE", primary: true, action: () => {
            setGuardrailOverride(true);
            setOverrideCount(c => c + 1);
            setRate(rateBuffer);
            setScreen(SCREENS.RUNNING);
            logEvent("guardrail_overridden", { rate: rateBuffer, drug: selectedDrug.name });
          }},
          { label: "RE-ENTER", action: () => { setGuardrailOverride(false); setScreen(SCREENS.RATE_ENTRY); } },
          { label: "", action: () => {} },
        ];
      case SCREENS.GUARDRAIL_BLOCKED:
        return [
          { label: "RE-ENTER", primary: true, action: () => setScreen(SCREENS.RATE_ENTRY) },
          { label: "", action: () => {} },
          { label: "", action: () => {} },
        ];
      case SCREENS.RUNNING:
        return [
          { label: "CLEAR VI", action: () => { setVolumeInfused(0); logEvent("volume_cleared"); } },
          { label: "VTBI", action: () => setScreen(SCREENS.OPTIONS) },
          { label: "OPTIONS", action: handleOptions },
        ];
      case SCREENS.ON_HOLD:
        return [
          { label: "RESUME", primary: true, action: handleRun },
          { label: "RE-PROG", action: () => setScreen(SCREENS.RATE_ENTRY) },
          { label: "OPTIONS", action: handleOptions },
        ];
      case SCREENS.ALARM:
        return [
          { label: "SILENCE", primary: true, action: () => { setScreen(SCREENS.ON_HOLD); logEvent("alarm_silenced"); } },
          { label: "", action: () => {} },
          { label: "", action: () => {} },
        ];
      default:
        return [{ label: "", action: () => {} }, { label: "", action: () => {} }, { label: "", action: () => {} }];
    }
  }

  // ─── VTBI chevron override ───────────────────────────────────────────────
  function adjustRate(delta) {
    if (screen === SCREENS.VTBI_ENTRY) { adjustVtbi(delta); return; }
    if (screen === SCREENS.PRESSURE_VIEW) { setPressureLevel(p => Math.max(1, Math.min(8, p + (delta > 0 ? 1 : -1)))); return; }
    if (![SCREENS.RATE_ENTRY, SCREENS.ON_HOLD, SCREENS.RUNNING].includes(screen)) return;

    const wasAtBoundary = rateBuffer <= FACTORY_DEFAULTS.rateMin || rateBuffer >= FACTORY_DEFAULTS.rateMax;
    const raw = +(rateBuffer + delta).toFixed(1);
    const newRate = Math.max(FACTORY_DEFAULTS.rateMin, Math.min(FACTORY_DEFAULTS.rateMax, raw));

    if (newRate === rateBuffer) {
      setBoundaryHits(b => b + 1);
      flash("boundary");
      logEvent("boundary_hit", { delta, currentRate: rateBuffer });
      return;
    }

    if (sessionLog.length > 0) {
      const last = [...sessionLog].reverse().find(e => e.event === "rate_adjust");
      if (last && Math.sign(last.delta) !== Math.sign(delta)) {
        setCorrectionCount(c => c + 1);
      }
    }

    setRateBuffer(newRate);
    if (screen === SCREENS.RUNNING) setRate(newRate);
    setKeypressCount(k => k + 1);
    logEvent("rate_adjust", { delta, newRate, from: rateBuffer });
  }

  function renderModal() { return null; }
}

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────
function LcdLine({ text, bright, dim }) {
  return (
    <div style={{
      color: bright ? "#3aff3a" : dim ? "#1a5a2a" : "#2a9a2a",
      fontSize: bright ? 13 : 11,
      letterSpacing: bright ? 1 : 0,
      marginBottom: 2,
      textShadow: bright ? "0 0 8px rgba(58,255,58,0.4)" : "none"
    }}>{text}</div>
  );
}

function ChevronButton({ label, onPress, name, startHold, endHold }) {
  return (
    <button
      className="chevron-btn"
      onMouseDown={(e) => { e.preventDefault(); startHold({ name, fn: onPress }); onPress(); }}
      onMouseUp={endHold}
      onMouseLeave={endHold}
      onTouchStart={(e) => { e.preventDefault(); startHold({ name, fn: onPress }); onPress(); }}
      onTouchEnd={endHold}
      style={{
        background: "linear-gradient(180deg, #1a2a4a 0%, #0d1a30 100%)",
        border: "1px solid #2a4a7a", borderRadius: 6,
        color: "#4a9eff", fontSize: 14, fontWeight: "bold",
        width: 56, height: 36, cursor: "pointer",
        boxShadow: "0 2px 4px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)",
        transition: "transform 0.05s, box-shadow 0.05s",
        userSelect: "none", WebkitUserSelect: "none"
      }}>
      {label}
    </button>
  );
}

function PumpButton({ label, color, activeColor, active, led, ledColor, onClick, onMouseDown, onMouseUp, onMouseLeave }) {
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
      {led && (
        <div className={active ? "led-run" : ""} style={{
          width: 5, height: 5, borderRadius: "50%",
          background: led ? ledColor : "transparent",
          boxShadow: led ? `0 0 6px ${ledColor}` : "none",
          margin: "0 auto 3px"
        }} />
      )}
      <div className="label-font" style={{
        color: pressed || active ? "#ffffff" : "#8090a0",
        fontSize: 9, letterSpacing: 1, fontWeight: 600
      }}>{label}</div>
    </button>
  );
}
