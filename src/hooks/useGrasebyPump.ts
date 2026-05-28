/**
 * useGrasebyPump — React hook for the Graseby 3100 Syringe Driver simulator.
 *
 * ARCHITECTURE ROLE:
 *   Wraps the pure Graseby state machine with React state, timers, and the
 *   session logger. Mirrors src/hooks/useBraunPump.ts pattern.
 *
 * NO business logic — pure dispatch + render. All state transitions are
 * delegated to grasebyStateMachine.ts.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { GrasebyPumpState, SyringeCapacityMl } from '../pump/graseby/grasebyTypes';

const LS_PUMP = 'graseby_pump_state';

function loadGrasebyState(fallback: () => GrasebyPumpState): GrasebyPumpState {
  try {
    const raw = localStorage.getItem(LS_PUMP);
    if (raw) return JSON.parse(raw) as GrasebyPumpState;
  } catch { /* ignore */ }
  return fallback();
}

import {
  getInitialGrasebyState,
  adjustRate,
  pressStart,
  pressStop,
  pressReprogram,
  selectSyringe,
  triggerAlarm,
  silenceAlarm,
  infusionTick,
  powerOff,
} from '../pump/graseby/grasebyStateMachine';
import { GRASEBY_DEFAULTS } from '../pump/graseby/grasebyConstants';
import { useHoldRepeat } from './useHoldRepeat';
import { useGrasebyLogger } from './useGrasebyLogger';

/**
 * Main Graseby 3100 pump hook.
 * Returns all state and handlers needed by the Graseby3100 component.
 */
export function useGrasebyPump() {
  const [pumpState, setPumpState] = useState<GrasebyPumpState>(
    () => loadGrasebyState(getInitialGrasebyState)
  );
  const [poweringOff, setPoweringOff] = useState(false);
  const logger     = useGrasebyLogger();
  const pumpRef    = useRef(pumpState);
  pumpRef.current  = pumpState;

  // Persist pump state on every change
  useEffect(() => {
    try { localStorage.setItem(LS_PUMP, JSON.stringify(pumpState)); } catch { /* ignore */ }
  }, [pumpState]);

  const sessionLogRef = useRef(logger.sessionLog);
  sessionLogRef.current = logger.sessionLog;

  /** Apply a state machine result: update state + append log entries. */
  const apply = useCallback((result: {
    state: GrasebyPumpState;
    logEntries: readonly import('../pump/graseby/grasebyTypes').GrasebySessionLogEntry[];
  }) => {
    setPumpState(result.state);
    logger.appendEntries(result.logEntries);
  }, [logger]);

  /** Current timestamp relative to session start. */
  const ts = useCallback(() => Date.now() - logger.sessionStart, [logger.sessionStart]);

  // ── Infusion tick ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (pumpRef.current.screen !== 'RUNNING') return;
    const id = setInterval(() => {
      const res = infusionTick(pumpRef.current, Date.now(), logger.sessionStart);
      if (res.logEntries.length > 0 || res.state !== pumpRef.current) {
        apply(res);
      }
    }, GRASEBY_DEFAULTS.INFUSION_TICK_MS);
    return () => clearInterval(id);
  }, [pumpState.screen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Hold-to-accelerate chevrons ───────────────────────────────────────────
  const { startHold, endHold: stopHold } = useHoldRepeat();

  function makeChevronHandler(delta: number) {
    return {
      onStart: () => startHold(() => { apply(adjustRate(pumpRef.current, delta, ts())); }),
      onStop:  stopHold,
    };
  }

  const largeDnChevron = makeChevronHandler(-GRASEBY_DEFAULTS.STEP_LARGE);
  const smallDnChevron = makeChevronHandler(-GRASEBY_DEFAULTS.STEP_SMALL);
  const smallUpChevron = makeChevronHandler(+GRASEBY_DEFAULTS.STEP_SMALL);
  const largeUpChevron = makeChevronHandler(+GRASEBY_DEFAULTS.STEP_LARGE);

  // ── Power ─────────────────────────────────────────────────────────────────
  const handlePowerDown = useCallback(() => setPoweringOff(true), []);
  const handlePowerRelease = useCallback(() => setPoweringOff(false), []);
  const handleBoot = useCallback(() => {
    setPoweringOff(false);
    apply(powerOff());
  }, [apply]);

  // ── Main controls ─────────────────────────────────────────────────────────
  const handleStart    = useCallback(() => apply(pressStart(pumpRef.current, ts())), [apply, ts]);
  const handleStop     = useCallback(() => apply(pressStop(pumpRef.current, ts())), [apply, ts]);
  const handleReprogram = useCallback(() => apply(pressReprogram(pumpRef.current, ts())), [apply, ts]);

  // ── Syringe ───────────────────────────────────────────────────────────────
  const handleSelectSyringe = useCallback((cap: SyringeCapacityMl) => {
    apply(selectSyringe(pumpRef.current, cap, ts()));
  }, [apply, ts]);

  // ── Alarms ────────────────────────────────────────────────────────────────
  const handleSilenceAlarm = useCallback(() => apply(silenceAlarm(pumpRef.current, ts())), [apply, ts]);
  const handleTriggerAlarm = useCallback((type: GrasebyPumpState['alarmType']) => {
    const msg = type === 'OCCLUSION' ? 'OCCLUSION' : type === 'BATTERY_LOW' ? 'BATTERY LOW' : 'SYRINGE EMPTY';
    if (type) apply(triggerAlarm(pumpRef.current, type, msg, ts()));
  }, [apply, ts]);

  return {
    pumpState,
    sessionLog:        logger.sessionLog,
    keypressCount:     logger.keypressCount,
    correctionCount:   logger.correctionCount,
    boundaryHitCount:  logger.boundaryHitCount,
    overrideCount:     0,   // Graseby 3100 has no guardrails — always 0
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
    // Main controls
    handleStart,
    handleStop,
    handleReprogram,
    // Syringe
    handleSelectSyringe,
    // Alarms
    handleSilenceAlarm,
    handleTriggerAlarm,
  };
}
