/**
 * Core state machine for the Graseby 3100 Syringe Driver simulator.
 *
 * ARCHITECTURE ROLE:
 *   Pure TypeScript state machine — no side effects, no React, no global mutation.
 *   All functions are pure: (state, ...) → { state, logEntries }.
 *
 * KEY DESIGN DIFFERENCES FROM ALARIS GP:
 *   1. NO GUARDRAILS: pressRun() always proceeds to RUNNING if rate > 0.
 *      Any rate between RATE_MIN and RATE_MAX is accepted without warning.
 *      This is the defining clinical safety risk of the Graseby 3100.
 *   2. NO DRUG LIBRARY: rate always entered directly in ml/h.
 *   3. NO VTBI: infusion ends when syringe is empty (volumeInfused >= capacity).
 *   4. NO BOLUS: no bolus mode exists on the Graseby 3100.
 *   5. SIMPLER FLOW: BOOT → RATE_ENTRY → RUNNING → ON_HOLD → ALARM
 *
 * VALID SCREEN TRANSITIONS:
 *   BOOT         → RATE_ENTRY  (boot complete)
 *   RATE_ENTRY   → RUNNING     (pressStart — any non-zero rate accepted)
 *   RUNNING      → ON_HOLD     (pressStop)
 *   RUNNING      → ALARM       (alarm triggered)
 *   ON_HOLD      → RUNNING     (pressStart)
 *   ON_HOLD      → RATE_ENTRY  (pressReprogram)
 *   ALARM        → ON_HOLD     (silenceAlarm — critical)
 *   ALARM        → RATE_ENTRY  (silenceAlarm — empty)
 *   Any screen   → BOOT        (powerOff — full reset)
 *
 * SOURCE:
 *   Graseby 3100 Syringe Driver Operators Manual — ardusmedical.com (2002)
 *
 * NO React imports allowed in this file.
 */

import type {
  GrasebyPumpState,
  GrasebySessionLogEntry,
  GrasebyStateResult,
  SyringeCapacityMl,
} from './grasebyTypes';
import { GRASEBY_DEFAULTS } from './grasebyConstants';

// ─── Initial State ────────────────────────────────────────────────────────────

/**
 * Returns the default initial state (post-boot) of the Graseby 3100.
 * Device lands on RATE_ENTRY after brief BOOT sequence.
 */
export function getInitialGrasebyState(): GrasebyPumpState {
  return {
    screen:             'RATE_ENTRY',
    rate:               GRASEBY_DEFAULTS.RATE_DEFAULT,
    syringeCapacityMl:  GRASEBY_DEFAULTS.SYRINGE_DEFAULT_ML,
    volumeInfused:      0,
    batteryLevel:       GRASEBY_DEFAULTS.BATTERY_LEVEL,
    alarmType:          null,
    alarmMessage:       '',
    ailTriggered:       false,
    mutedUntil:         0,
    drugCursorIndex:    0,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Clamp a value between min and max (inclusive). */
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Round to 1 decimal place. */
function r1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Build a log entry. */
function entry(
  ts: number,
  state: GrasebyPumpState,
  fields: Partial<GrasebySessionLogEntry>
): GrasebySessionLogEntry {
  return { timestamp: ts, screen: state.screen, event: 'session_start', ...fields };
}

// ─── Chevron Actions ──────────────────────────────────────────────────────────

/**
 * Apply a chevron press to adjust the rate.
 * Only active on RATE_ENTRY screen.
 * No guardrail checks — any rate in [RATE_MIN, RATE_MAX] is valid.
 */
export function adjustRate(
  state: GrasebyPumpState,
  delta: number,
  ts: number
): GrasebyStateResult {
  if (state.screen !== 'RATE_ENTRY') return { state, logEntries: [] };

  const rawNew  = r1(state.rate + delta);
  const clamped = r1(clamp(rawNew, GRASEBY_DEFAULTS.RATE_MIN, GRASEBY_DEFAULTS.RATE_MAX));
  const hitBoundary = rawNew !== clamped;

  const logEntries: GrasebySessionLogEntry[] = [
    entry(ts, state, {
      event: hitBoundary ? 'boundary_hit' : 'rate_adjust',
      rate:  state.rate,
      delta,
      newRate: clamped,
    }),
  ];

  return {
    state:      { ...state, rate: clamped },
    logEntries,
  };
}

// ─── Start Infusion ───────────────────────────────────────────────────────────

/**
 * Press START (RUN equivalent).
 *
 * On RATE_ENTRY: validates rate > 0, then transitions to RUNNING.
 * NO guardrail check — this is the core distinguishing feature of the Graseby 3100.
 * On ON_HOLD: resumes infusion.
 */
export function pressStart(
  state: GrasebyPumpState,
  ts: number
): GrasebyStateResult {
  if (state.screen === 'RATE_ENTRY') {
    if (state.rate <= 0) return { state, logEntries: [] };
    const next: GrasebyPumpState = { ...state, screen: 'RUNNING' };
    return {
      state: next,
      logEntries: [entry(ts, next, { event: 'infusion_started', rate: state.rate })],
    };
  }
  if (state.screen === 'ON_HOLD') {
    const next: GrasebyPumpState = { ...state, screen: 'RUNNING' };
    return {
      state: next,
      logEntries: [entry(ts, next, { event: 'infusion_resumed', rate: state.rate })],
    };
  }
  return { state, logEntries: [] };
}

// ─── Hold / Stop ─────────────────────────────────────────────────────────────

/**
 * Press STOP (HOLD equivalent).
 * Transitions RUNNING → ON_HOLD.
 */
export function pressStop(
  state: GrasebyPumpState,
  ts: number
): GrasebyStateResult {
  if (state.screen !== 'RUNNING') return { state, logEntries: [] };
  const next: GrasebyPumpState = { ...state, screen: 'ON_HOLD' };
  return {
    state: next,
    logEntries: [entry(ts, next, { event: 'infusion_held', rate: state.rate })],
  };
}

// ─── Reprogram ────────────────────────────────────────────────────────────────

/**
 * Return to rate entry from ON_HOLD.
 * Equivalent to RE-PROG on the Alaris GP.
 */
export function pressReprogram(
  state: GrasebyPumpState,
  ts: number
): GrasebyStateResult {
  if (state.screen !== 'ON_HOLD') return { state, logEntries: [] };
  const next: GrasebyPumpState = { ...state, screen: 'RATE_ENTRY' };
  return { state: next, logEntries: [entry(ts, next, { event: 'session_start' })] };
}

// ─── Syringe Selection ────────────────────────────────────────────────────────

/**
 * Change the syringe capacity.
 * Only valid on RATE_ENTRY or ON_HOLD screens.
 */
export function selectSyringe(
  state: GrasebyPumpState,
  capacityMl: SyringeCapacityMl,
  ts: number
): GrasebyStateResult {
  if (state.screen !== 'RATE_ENTRY' && state.screen !== 'ON_HOLD') {
    return { state, logEntries: [] };
  }
  const next: GrasebyPumpState = {
    ...state,
    syringeCapacityMl: capacityMl,
    volumeInfused:     0,   // reset volume when syringe changes
  };
  return {
    state: next,
    logEntries: [entry(ts, next, { event: 'syringe_selected', syringeCapacity: capacityMl })],
  };
}

// ─── Alarm Trigger ────────────────────────────────────────────────────────────

/**
 * Trigger an alarm condition.
 * Transitions any running screen to ALARM.
 */
export function triggerAlarm(
  state:     GrasebyPumpState,
  alarmType: GrasebyPumpState['alarmType'],
  message:   string,
  ts:        number
): GrasebyStateResult {
  if (!alarmType) return { state, logEntries: [] };
  const next: GrasebyPumpState = {
    ...state,
    screen:      'ALARM',
    alarmType,
    alarmMessage: message,
  };
  return {
    state: next,
    logEntries: [entry(ts, next, { event: 'alarm_triggered', alarmType })],
  };
}

/**
 * Silence / acknowledge an alarm.
 * OCCLUSION + BATTERY_LOW → ON_HOLD (need to resolve, then reprogram).
 * SYRINGE_EMPTY → RATE_ENTRY (prepare a new syringe).
 */
export function silenceAlarm(
  state: GrasebyPumpState,
  ts:    number
): GrasebyStateResult {
  if (state.screen !== 'ALARM') return { state, logEntries: [] };
  const nextScreen = state.alarmType === 'SYRINGE_EMPTY' ? 'RATE_ENTRY' : 'ON_HOLD';
  const next: GrasebyPumpState = {
    ...state,
    screen:       nextScreen,
    alarmType:    null,
    alarmMessage: '',
    mutedUntil:   Date.now() + GRASEBY_DEFAULTS.MUTE_DURATION_MS,
  };
  return {
    state: next,
    logEntries: [entry(ts, next, { event: 'alarm_silenced' })],
  };
}

// ─── Infusion Tick ────────────────────────────────────────────────────────────

/**
 * Advance infusion by one simulation tick.
 *
 * Called by the React hook on a setInterval.
 * Returns new state and any log entries (e.g. syringe-empty alarm).
 */
export function infusionTick(
  state:  GrasebyPumpState,
  nowMs:  number,
  sessionStartMs: number
): GrasebyStateResult {
  if (state.screen !== 'RUNNING') return { state, logEntries: [] };

  const tickVolumeMl = state.rate * (GRASEBY_DEFAULTS.INFUSION_TICK_MS / 1000 / 3600);
  const newVolume    = +(state.volumeInfused + tickVolumeMl).toFixed(3);
  const newBattery   = Math.max(0, state.batteryLevel - GRASEBY_DEFAULTS.BATTERY_DRAIN_PER_TICK);
  const ts           = nowMs - sessionStartMs;

  // Check syringe empty
  if (newVolume >= state.syringeCapacityMl) {
    const next: GrasebyPumpState = {
      ...state,
      volumeInfused: state.syringeCapacityMl,
      batteryLevel:  newBattery,
      screen:        'ALARM',
      alarmType:     'SYRINGE_EMPTY',
      alarmMessage:  'SYRINGE EMPTY',
    };
    return {
      state: next,
      logEntries: [
        entry(ts, next, { event: 'infusion_complete' }),
        entry(ts, next, { event: 'alarm_triggered', alarmType: 'SYRINGE_EMPTY' }),
      ],
    };
  }

  // Check battery low
  if (newBattery < GRASEBY_DEFAULTS.BATTERY_LOW_PCT && state.batteryLevel >= GRASEBY_DEFAULTS.BATTERY_LOW_PCT) {
    const next: GrasebyPumpState = {
      ...state,
      volumeInfused: newVolume,
      batteryLevel:  newBattery,
      screen:        'ALARM',
      alarmType:     'BATTERY_LOW',
      alarmMessage:  'BATTERY LOW',
    };
    return {
      state: next,
      logEntries: [entry(ts, next, { event: 'alarm_triggered', alarmType: 'BATTERY_LOW' })],
    };
  }

  return {
    state:      { ...state, volumeInfused: newVolume, batteryLevel: newBattery },
    logEntries: [],
  };
}

// ─── Power Off ────────────────────────────────────────────────────────────────

/**
 * Power off — reset to initial state.
 */
export function powerOff(): GrasebyStateResult {
  return { state: getInitialGrasebyState(), logEntries: [] };
}
