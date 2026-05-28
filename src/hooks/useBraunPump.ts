/**
 * useBraunPump — React hook wrapping the B. Braun Infusomat Space state machine.
 *
 * ARCHITECTURE ROLE:
 *   Mirrors src/hooks/usePump.ts (Alaris GP) but drives the B. Braun state machine
 *   (src/pump/braun/braunStateMachine.ts) instead of the Alaris GP state machine.
 *
 *   This is the ONLY file that bridges React and the B. Braun state machine.
 *   The BraunInfusomat component should only call useBraunPump — never import
 *   braunStateMachine.ts directly from a component.
 *
 * KEY DIFFERENCES FROM usePump.ts:
 *   - Uses BraunPumpState / BraunActionResult types.
 *   - Three-tier guardrail: handleAcknowledgeAdvisory() is new.
 *   - SpaceCom2: handleConnectSpaceCom2() / handleDisconnectSpaceCom2() are new.
 *   - completeBoot() replaces selectLanguage() — no language selection screen.
 *   - BRAUN_DEFAULTS used for tick intervals instead of FACTORY_DEFAULTS.
 *
 * SOURCE:
 *   B. Braun Infusomat Space IFU — bbraunusa.com (2024).
 *   CLAUDE.md Section 12 — What Claude Code Must Build Next.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useBraunLogger } from './useBraunLogger';
import { useHoldRepeat } from './useHoldRepeat';
const LS_PUMP = 'braun_pump_state';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadBraunState(fallback: () => any): any {
  try {
    const raw = localStorage.getItem(LS_PUMP);
    if (raw) return JSON.parse(raw) as BraunPumpState;
  } catch { /* ignore */ }
  return fallback();
}

import {
  getInitialBraunState,
  completeBoot,
  selectDrug,
  moveDrugCursor,
  confirmDrugSelection,
  adjustChevron,
  pressRun,
  pressRun_fromHold,
  acknowledgeAdvisory,
  overrideGuardrail,
  reEnterRate,
  pressHold,
  reprogramRate,
  openVtbiEntry,
  confirmVtbi,
  clearVtbi,
  triggerAlarm,
  silenceAlarm,
  infusionTick,
  startBolus as smStartBolus,
  stopBolus as smStopBolus,
  connectSpaceCom2,
  disconnectSpaceCom2,
  openOptions,
  openPressureView,
  goBack,
  powerOff,
  getCurrentDrug,
  pressMute,
  clearVolume,
  setPatientWeight,
  toggleRecallBatch,
} from '../pump/braun/braunStateMachine';
import type { BraunPumpState, BraunActionResult, BraunAlarmType } from '../pump/braun/braunTypes';
import { BRAUN_DEFAULTS } from '../pump/braun/braunConstants';
import { BRAUN_DRUG_LIBRARY } from '../pump/braun/braunDrugLibrary';
import type { Drug } from '../pump/types';

export function useBraunPump() {
  const [pumpState, setPumpState] = useState<BraunPumpState>(
    () => loadBraunState(getInitialBraunState)
  );
  const logger = useBraunLogger();
  const runTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bolusTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const powerOffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [poweringOff, setPoweringOff] = useState(false);

  // Persist pump state on every change
  useEffect(() => {
    try { localStorage.setItem(LS_PUMP, JSON.stringify(pumpState)); } catch { /* ignore */ }
  }, [pumpState]);

  // Stable refs for stale-closure safety in timers
  const pumpStateRef = useRef(pumpState);
  pumpStateRef.current = pumpState;

  const sessionLogRef = useRef(logger.sessionLog);
  sessionLogRef.current = logger.sessionLog;

  /** Apply a BraunActionResult: update state and append log entries. */
  const apply = useCallback((res: BraunActionResult) => {
    setPumpState(res.state);
    logger.appendEntries(res.logEntries);
  }, [logger]);

  /** Timestamp relative to session start (ms). */
  const ts = useCallback(() => Date.now() - logger.sessionStart, [logger.sessionStart]);

  // ── Infusion tick ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (pumpState.screen === 'RUNNING') {
      const drug = getCurrentDrug(pumpState);
      runTimerRef.current = setInterval(() => {
        const s = pumpStateRef.current;
        const d = getCurrentDrug(s);
        const res = infusionTick(s, d, s.patientWeightKg, Date.now() - logger.sessionStart);
        setPumpState(res.state);
        logger.appendEntries(res.logEntries);
      }, BRAUN_DEFAULTS.INFUSION_TICK_MS);
    } else {
      if (runTimerRef.current) {
        clearInterval(runTimerRef.current);
        runTimerRef.current = null;
      }
    }
    // Intentional: drug captured at effect setup — timer uses ref for up-to-date state
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { if (runTimerRef.current) clearInterval(runTimerRef.current); };
  }, [pumpState.screen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Bolus tick ─────────────────────────────────────────────────────────────
  const handleStartBolus = useCallback(() => {
    const s = pumpStateRef.current;
    const drug = getCurrentDrug(s);
    if (s.screen !== 'RUNNING' || !drug.bolusAllowed) return;
    const res = smStartBolus(s, ts());
    apply(res);

    bolusTimerRef.current = setInterval(() => {
      setPumpState(prev => {
        if (prev.bolusVolumeDelivered >= BRAUN_DEFAULTS.BOLUS_MAX_ML) {
          clearInterval(bolusTimerRef.current!);
          bolusTimerRef.current = null;
          return { ...prev, bolusActive: false };
        }
        return {
          ...prev,
          bolusVolumeDelivered: +(prev.bolusVolumeDelivered + BRAUN_DEFAULTS.BOLUS_TICK_VOLUME).toFixed(2),
        };
      });
    }, BRAUN_DEFAULTS.BOLUS_TICK_MS);
  }, [apply, ts]);

  const handleStopBolus = useCallback(() => {
    if (bolusTimerRef.current) {
      clearInterval(bolusTimerRef.current);
      bolusTimerRef.current = null;
    }
    const res = smStopBolus(pumpStateRef.current, ts());
    apply(res);
  }, [apply, ts]);

  // ── Hold-to-accelerate chevrons ────────────────────────────────────────────
  const { startHold, endHold } = useHoldRepeat();

  const makeChevronHandler = useCallback((delta: number) => ({
    onPressDown: () => startHold(
      () => {
        const res = adjustChevron(pumpStateRef.current, delta, ts(), sessionLogRef.current);
        apply(res);
      }
    ),
    onRelease: endHold,
  }), [startHold, endHold, apply, ts]);

  const largeDnChevron = makeChevronHandler(-BRAUN_DEFAULTS.STEP_LARGE);
  const smallDnChevron = makeChevronHandler(-BRAUN_DEFAULTS.STEP_SMALL);
  const smallUpChevron = makeChevronHandler(+BRAUN_DEFAULTS.STEP_SMALL);
  const largeUpChevron = makeChevronHandler(+BRAUN_DEFAULTS.STEP_LARGE);

  // ── Power off (hold 3s) ────────────────────────────────────────────────────
  const handlePowerDown = useCallback(() => {
    setPoweringOff(true);
    powerOffTimerRef.current = setTimeout(() => {
      const res = powerOff(pumpStateRef.current, ts());
      apply(res);
      setPoweringOff(false);
    }, BRAUN_DEFAULTS.POWER_OFF_HOLD_MS);
  }, [apply, ts]);

  const handlePowerRelease = useCallback(() => {
    if (powerOffTimerRef.current) {
      clearTimeout(powerOffTimerRef.current);
      powerOffTimerRef.current = null;
    }
    // Short press = power on (boot) if at STARTUP screen
    if (pumpStateRef.current.screen === 'STARTUP' && !poweringOff) {
      const res = completeBoot(pumpStateRef.current, ts());
      apply(res);
    }
    setPoweringOff(false);
  }, [apply, ts, poweringOff]);

  // ── Action handlers ────────────────────────────────────────────────────────

  const handleBoot = useCallback(() => {
    apply(completeBoot(pumpStateRef.current, ts()));
  }, [apply, ts]);

  const handleDrugSelect = useCallback((drug: Drug) => {
    apply(selectDrug(pumpStateRef.current, drug, ts()));
  }, [apply, ts]);

  const handleMoveDrugCursor = useCallback((dir: 1 | -1) => {
    apply(moveDrugCursor(pumpStateRef.current, dir));
  }, [apply]);

  const handleConfirmDrugSelection = useCallback(() => {
    apply(confirmDrugSelection(pumpStateRef.current, ts()));
  }, [apply, ts]);

  const handleRun = useCallback(() => {
    const s = pumpStateRef.current;
    if (s.screen === 'ON_HOLD') {
      apply(pressRun_fromHold(s, ts()));
    } else if (s.screen === 'RATE_ENTRY') {
      const drug = getCurrentDrug(s);
      apply(pressRun(s, drug, s.patientWeightKg, ts()));
    }
  }, [apply, ts]);

  const handleAcknowledgeAdvisory = useCallback(() => {
    const s = pumpStateRef.current;
    apply(acknowledgeAdvisory(s, getCurrentDrug(s), ts()));
  }, [apply, ts]);

  const handleOverrideGuardrail = useCallback(() => {
    const s = pumpStateRef.current;
    apply(overrideGuardrail(s, getCurrentDrug(s), ts()));
  }, [apply, ts]);

  const handleReEnterRate = useCallback(() => {
    apply(reEnterRate(pumpStateRef.current, ts()));
  }, [apply, ts]);

  const handleHold = useCallback(() => {
    apply(pressHold(pumpStateRef.current, ts()));
  }, [apply, ts]);

  const handleReprogramRate = useCallback(() => {
    apply(reprogramRate(pumpStateRef.current, ts()));
  }, [apply, ts]);

  const handleOpenVtbi = useCallback(() => {
    apply(openVtbiEntry(pumpStateRef.current, ts()));
  }, [apply, ts]);

  const handleConfirmVtbi = useCallback(() => {
    const s = pumpStateRef.current;
    apply(confirmVtbi(s, s.vtbiBuffer, ts()));
  }, [apply, ts]);

  const handleClearVtbi = useCallback(() => {
    apply(clearVtbi(pumpStateRef.current, ts()));
  }, [apply, ts]);

  const handleSilenceAlarm = useCallback(() => {
    apply(silenceAlarm(pumpStateRef.current, ts()));
  }, [apply, ts]);

  const handleTriggerAlarm = useCallback((alarmType: BraunAlarmType) => {
    const messages: Record<BraunAlarmType, string> = {
      OCCLUSION: 'OCCLUSION',
      UPSTREAM_OCCLUSION: 'UPSTREAM OCC',
      AIR_IN_LINE: 'AIR IN LINE',
      INFUSION_COMPLETE: 'INFUSION COMPLETE',
      BATTERY_LOW: 'BATTERY LOW',
      AC_FAIL: 'AC FAIL',
      KVO: 'KVO RUNNING',
      SPACECOM2_FAULT: 'SPACECOM2 FAULT',
      FIRMWARE_UNSIGNED: 'FIRMWARE UNSIGNED',
    };
    apply(triggerAlarm(pumpStateRef.current, alarmType, messages[alarmType], ts()));
  }, [apply, ts]);

  const handleConnectSpaceCom2 = useCallback(() => {
    apply(connectSpaceCom2(pumpStateRef.current, ts()));
  }, [apply, ts]);

  const handleDisconnectSpaceCom2 = useCallback(() => {
    apply(disconnectSpaceCom2(pumpStateRef.current, ts()));
  }, [apply, ts]);

  const handleOptions = useCallback(() => {
    apply(openOptions(pumpStateRef.current, ts()));
  }, [apply, ts]);

  const handlePressureView = useCallback(() => {
    apply(openPressureView(pumpStateRef.current, ts()));
  }, [apply, ts]);

  const handleBack = useCallback(() => {
    apply(goBack(pumpStateRef.current, ts()));
  }, [apply, ts]);

  const handleMute = useCallback(() => {
    apply(pressMute(pumpStateRef.current, ts()));
  }, [apply, ts]);

  const handleClearVolume = useCallback(() => {
    apply(clearVolume(pumpStateRef.current, ts()));
  }, [apply, ts]);

  const handleSetWeight = useCallback((weightKg: number) => {
    apply(setPatientWeight(pumpStateRef.current, weightKg, ts()));
  }, [apply, ts]);

  const handleToggleRecall = useCallback(() => {
    apply(toggleRecallBatch(pumpStateRef.current, ts()));
  }, [apply, ts]);

  return {
    pumpState,
    drugLibrary: BRAUN_DRUG_LIBRARY,
    sessionLog: logger.sessionLog,
    keypressCount: logger.keypressCount,
    correctionCount: logger.correctionCount,
    boundaryHitCount: logger.boundaryHitCount,
    overrideCount: logger.overrideCount,
    advisoryCount: logger.advisoryCount,
    poweringOff,
    // Chevron controls
    largeDnChevron,
    smallDnChevron,
    smallUpChevron,
    largeUpChevron,
    // Power
    handlePowerDown,
    handlePowerRelease,
    handleBoot,
    // Drug selection
    handleDrugSelect,
    handleMoveDrugCursor,
    handleConfirmDrugSelection,
    // Infusion control
    handleRun,
    handleHold,
    handleReprogramRate,
    // Guardrail
    handleAcknowledgeAdvisory,
    handleOverrideGuardrail,
    handleReEnterRate,
    // VTBI
    handleOpenVtbi,
    handleConfirmVtbi,
    handleClearVtbi,
    // Alarms
    handleSilenceAlarm,
    handleTriggerAlarm,
    // SpaceCom2
    handleConnectSpaceCom2,
    handleDisconnectSpaceCom2,
    // Navigation
    handleOptions,
    handlePressureView,
    handleBack,
    // Bolus
    handleStartBolus,
    handleStopBolus,
    // New controls
    handleMute,
    handleClearVolume,
    handleSetWeight,
    handleToggleRecall,
  };
}
