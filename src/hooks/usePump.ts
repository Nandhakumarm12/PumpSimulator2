/**
 * usePump — React hook wrapping the pure pump state machine.
 * This is the ONLY file that bridges React and the state machine.
 * Components should only call usePump — never import stateMachine directly.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useLogger } from './useLogger';
import { useHoldRepeat } from './useHoldRepeat';
import { getInitialState } from '../pump/stateMachine';
import type { ActionResult } from '../pump/stateMachine';
import * as SM from '../pump/stateMachine';
import type { PumpState, Drug, AlarmType } from '../pump/types';
import { FACTORY_DEFAULTS } from '../pump/constants';
import { DRUG_LIBRARY } from '../pump/drugLibrary';

const LS_PUMP = 'alaris_pump_state';

function loadPumpState(): PumpState {
  try {
    const raw = localStorage.getItem(LS_PUMP);
    if (raw) return JSON.parse(raw) as PumpState;
  } catch { /* ignore */ }
  return getInitialState();
}

export function usePump() {
  const [pumpState, setPumpState] = useState<PumpState>(loadPumpState);
  const logger = useLogger();
  const runTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bolusTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const powerOffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [entryStartTime, setEntryStartTime] = useState<number | null>(null);
  const [poweringOff, setPoweringOff] = useState(false);

  // Persist pump state to localStorage on every change
  useEffect(() => {
    try { localStorage.setItem(LS_PUMP, JSON.stringify(pumpState)); } catch { /* ignore */ }
  }, [pumpState]);

  // Stable ref to pumpState to avoid stale closures in timers
  const pumpStateRef = useRef(pumpState);
  pumpStateRef.current = pumpState;

  // Stable ref to sessionLog for correction detection in adjustChevron
  const sessionLogRef = useRef(logger.sessionLog);
  sessionLogRef.current = logger.sessionLog;

  /** Apply an ActionResult: update state and append log entries. */
  const apply = useCallback((res: ActionResult) => {
    setPumpState(res.state);
    logger.appendEntries(res.logEntries);
  }, [logger]);

  /** Get current timestamp relative to session start. */
  const ts = useCallback(() => Date.now() - logger.sessionStart, [logger.sessionStart]);

  // ── Infusion tick ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (pumpState.screen === "RUNNING") {
      runTimerRef.current = setInterval(() => {
        const res = SM.infusionTick(pumpStateRef.current, Date.now() - logger.sessionStart);
        setPumpState(res.state);
        logger.appendEntries(res.logEntries);
      }, FACTORY_DEFAULTS.INFUSION_TICK_MS);
    } else {
      if (runTimerRef.current) {
        clearInterval(runTimerRef.current);
        runTimerRef.current = null;
      }
    }
    return () => {
      if (runTimerRef.current) clearInterval(runTimerRef.current);
    };
  }, [pumpState.screen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Bolus tick ─────────────────────────────────────────────────────────────
  const startBolus = useCallback(() => {
    const state = pumpStateRef.current;
    if (state.screen !== "RUNNING" || !state.selectedDrug.bolusAllowed) return;
    setPumpState(s => ({ ...s, bolusActive: true }));
    logger.appendEntries([SM.makeLogEntry(ts(), state.screen, "bolus_started")]);

    bolusTimerRef.current = setInterval(() => {
      setPumpState(s => {
        if (s.bolusVolume >= FACTORY_DEFAULTS.BOLUS_VOLUME_MAX) {
          clearInterval(bolusTimerRef.current!);
          bolusTimerRef.current = null;
          return { ...s, bolusActive: false };
        }
        return { ...s, bolusVolume: +(s.bolusVolume + FACTORY_DEFAULTS.BOLUS_TICK_VOLUME).toFixed(1) };
      });
    }, FACTORY_DEFAULTS.BOLUS_TICK_MS);
  }, [logger, ts]);

  const stopBolus = useCallback(() => {
    if (bolusTimerRef.current) {
      clearInterval(bolusTimerRef.current);
      bolusTimerRef.current = null;
    }
    const state = pumpStateRef.current;
    const delivered = state.bolusVolume;
    logger.appendEntries([SM.makeLogEntry(ts(), state.screen, "bolus_ended", { bolusVolume: delivered })]);
    // DFU spec: bolus volume adds to volume infused
    setPumpState(s => ({
      ...s,
      bolusActive: false,
      bolusVolume: 0,
      volumeInfused: +(s.volumeInfused + delivered).toFixed(3),
    }));
  }, [logger, ts]);

  // ── Hold-to-accelerate ──────────────────────────────────────────────────────
  const { startHold, endHold } = useHoldRepeat();

  const handleChevron = useCallback((delta: number) => {
    const res = SM.adjustChevron(pumpStateRef.current, delta, ts(), sessionLogRef.current);
    apply(res);
  }, [apply, ts]);

  const chevronHandlers = {
    onLargeDown: useCallback(() => { startHold(() => handleChevron(-FACTORY_DEFAULTS.STEP_LARGE)); }, [startHold, handleChevron]),
    onSmallDown: useCallback(() => { startHold(() => handleChevron(-FACTORY_DEFAULTS.STEP_SMALL)); }, [startHold, handleChevron]),
    onSmallUp: useCallback(() => { startHold(() => handleChevron(+FACTORY_DEFAULTS.STEP_SMALL)); }, [startHold, handleChevron]),
    onLargeUp: useCallback(() => { startHold(() => handleChevron(+FACTORY_DEFAULTS.STEP_LARGE)); }, [startHold, handleChevron]),
    onRelease: endHold,
  };

  // ── Button handlers ────────────────────────────────────────────────────────

  const handleLanguageSelect = useCallback(() => {
    apply(SM.selectLanguage(pumpStateRef.current, ts()));
  }, [apply, ts]);

  const handleDrugSelect = useCallback((drug: Drug) => {
    setEntryStartTime(Date.now());
    apply(SM.selectDrug(pumpStateRef.current, drug, ts()));
  }, [apply, ts]);

  const handleRun = useCallback(() => {
    apply(SM.pressRun(pumpStateRef.current, ts()));
  }, [apply, ts]);

  const handleHold = useCallback(() => {
    apply(SM.pressHold(pumpStateRef.current, ts()));
  }, [apply, ts]);

  /** MUTE — silence alarm audio for MUTE_DURATION_MS (120s). DFU spec: resounds after. */
  const handleMute = useCallback(() => {
    const mutedUntil = Date.now() + FACTORY_DEFAULTS.MUTE_DURATION_MS;
    setPumpState(s => ({ ...s, mutedUntil }));
    logger.appendEntries([SM.makeLogEntry(ts(), pumpStateRef.current.screen, "mute_pressed")]);
  }, [logger, ts]);

  const handleOptions = useCallback(() => {
    apply(SM.openOptions(pumpStateRef.current, ts()));
  }, [apply, ts]);

  const handlePressure = useCallback(() => {
    apply(SM.openPressureView(pumpStateRef.current, ts()));
  }, [apply, ts]);

  const handleBack = useCallback(() => {
    apply(SM.goBack(pumpStateRef.current, ts()));
  }, [apply, ts]);

  const handleOverrideGuardrail = useCallback(() => {
    apply(SM.overrideGuardrail(pumpStateRef.current, ts()));
  }, [apply, ts]);

  const handleReEnterRate = useCallback(() => {
    apply(SM.reEnterRate(pumpStateRef.current, ts()));
  }, [apply, ts]);

  const handleOpenVtbi = useCallback(() => {
    apply(SM.openVtbiEntry(pumpStateRef.current, ts()));
  }, [apply, ts]);

  const handleConfirmVtbi = useCallback(() => {
    apply(SM.confirmVtbi(pumpStateRef.current, ts()));
  }, [apply, ts]);

  const handleClearVtbi = useCallback(() => {
    apply(SM.clearVtbi(pumpStateRef.current, ts()));
  }, [apply, ts]);

  const handleSilenceAlarm = useCallback(() => {
    apply(SM.silenceAlarm(pumpStateRef.current, ts()));
  }, [apply, ts]);

  const handleClearVolume = useCallback(() => {
    apply(SM.clearVolume(pumpStateRef.current, ts()));
  }, [apply, ts]);

  /** Execute the actual power-off after hold completes. */
  const executePowerOff = useCallback(() => {
    setPoweringOff(false);
    if (runTimerRef.current) clearInterval(runTimerRef.current);
    if (bolusTimerRef.current) clearInterval(bolusTimerRef.current);
    const res = SM.powerOff(pumpStateRef.current, ts());
    setPumpState(res.state);
    logger.resetSession();
    setEntryStartTime(null);
  }, [logger, ts]);

  /** Start the 3-second hold-to-power-off countdown. DFU spec: hold 3s to switch off. */
  const handlePowerOffStart = useCallback(() => {
    setPoweringOff(true);
    powerOffTimerRef.current = setTimeout(executePowerOff, FACTORY_DEFAULTS.POWER_OFF_HOLD_MS);
  }, [executePowerOff]);

  /** Cancel power-off if button released before 3 seconds. */
  const handlePowerOffCancel = useCallback(() => {
    if (powerOffTimerRef.current) {
      clearTimeout(powerOffTimerRef.current);
      powerOffTimerRef.current = null;
    }
    setPoweringOff(false);
  }, []);

  const handleGoToDrugSelect = useCallback(() => {
    apply(SM.goToDrugSelect(pumpStateRef.current, ts()));
  }, [apply, ts]);

  const handleReprogramRate = useCallback(() => {
    apply(SM.reprogramRate(pumpStateRef.current, ts()));
  }, [apply, ts]);

  const handleTriggerAlarm = useCallback((alarmType: AlarmType) => {
    apply(SM.triggerAlarm(pumpStateRef.current, alarmType, ts()));
  }, [apply, ts]);

  const handleSetBattery = useCallback((level: number) => {
    setPumpState(s => ({ ...s, batteryLevel: Math.max(0, Math.min(100, level)) }));
  }, []);

  /** Confirm the weight in WEIGHT_ENTRY and proceed to RATE_ENTRY. */
  const handleConfirmWeight = useCallback(() => {
    apply(SM.confirmWeight(pumpStateRef.current, ts()));
  }, [apply, ts]);

  /** Cancel weight entry and return to DRUG_SELECT. */
  const handleCancelWeight = useCallback(() => {
    apply(SM.cancelWeight(pumpStateRef.current, ts()));
  }, [apply, ts]);

  /** Reset weightBuffer to factory default (70 kg) without leaving WEIGHT_ENTRY. */
  const handleResetWeightBuffer = useCallback(() => {
    setPumpState(s => ({ ...s, weightBuffer: FACTORY_DEFAULTS.WEIGHT_DEFAULT }));
  }, []);

  /** Move drug selection cursor up/down in DRUG_SELECT screen. */
  const handleMoveDrugCursor = useCallback((direction: 1 | -1) => {
    apply(SM.moveDrugCursor(pumpStateRef.current, direction));
  }, [apply]);

  /** Confirm the drug currently at the cursor position. */
  const handleConfirmDrugSelection = useCallback(() => {
    setEntryStartTime(Date.now());
    apply(SM.confirmDrugSelection(pumpStateRef.current, ts()));
  }, [apply, ts]);

  return {
    // State
    pumpState,
    drugLibrary: DRUG_LIBRARY,
    entryStartTime,
    poweringOff,
    /** True while the alarm is silenced (within the 120s MUTE window). */
    isMuted: pumpState.mutedUntil !== null && Date.now() < pumpState.mutedUntil,
    // Logger state
    sessionLog: logger.sessionLog,
    sessionStart: logger.sessionStart,
    keypressCount: logger.keypressCount,
    correctionCount: logger.correctionCount,
    boundaryHitCount: logger.boundaryHitCount,
    overrideCount: logger.overrideCount,
    // Handlers
    handleLanguageSelect,
    handleDrugSelect,
    handleRun,
    handleHold,
    handleMute,
    handleOptions,
    handlePressure,
    handleBack,
    handleOverrideGuardrail,
    handleReEnterRate,
    handleOpenVtbi,
    handleConfirmVtbi,
    handleClearVtbi,
    handleSilenceAlarm,
    handleClearVolume,
    handlePowerOffStart,
    handlePowerOffCancel,
    handleGoToDrugSelect,
    handleReprogramRate,
    handleTriggerAlarm,
    handleMoveDrugCursor,
    handleConfirmDrugSelection,
    handleConfirmWeight,
    handleCancelWeight,
    handleResetWeightBuffer,
    handleSetBattery,
    resetSessionLog: logger.resetSession,
    startBolus,
    stopBolus,
    chevronHandlers,
  };
}
