/**
 * Core pump state transitions for the Alaris GP simulator.
 * All functions are pure — no side effects, no React.
 * Source: DFU Manual workflow + PVSio-web formal model.
 * NO React imports allowed in this file.
 */

import type { PumpState, PumpScreen, Drug, SessionLogEntry, EventType } from './types';
import type { AlarmType } from './types';
import { FACTORY_DEFAULTS } from './constants';
import { DRUG_LIBRARY } from './drugLibrary';
import { checkGuardrail } from './guardrails';
import { clampRate, clampVtbi, clampPressure, clampWeight, rateToMlH } from './display';
import { ALARM_DEFINITIONS } from './alarms';

/** Build the initial pump state (pump just powered on). */
export function getInitialState(): PumpState {
  return {
    screen: "LANGUAGE_SELECT",
    selectedDrug: DRUG_LIBRARY[0],
    rate: FACTORY_DEFAULTS.RATE_DEFAULT,
    rateBuffer: FACTORY_DEFAULTS.RATE_DEFAULT,
    vtbi: FACTORY_DEFAULTS.VTBI_DEFAULT,
    vtbiBuffer: 500,
    volumeInfused: 0,
    patientWeight: FACTORY_DEFAULTS.WEIGHT_DEFAULT,
    pressureLevel: FACTORY_DEFAULTS.PRESSURE_DEFAULT,
    alarmMessage: "",
    alarmType: null,
    guardrailOverride: false,
    bolusActive: false,
    bolusVolume: 0,
    previousScreen: "RUNNING",
    kvoActive: false,
    mutedUntil: null,
    drugCursorIndex: 0,
    weightBuffer: FACTORY_DEFAULTS.WEIGHT_DEFAULT,
    batteryLevel: FACTORY_DEFAULTS.BATTERY_LEVEL,
    ailTriggered: false,
  };
}

/** Create a log entry — timestamp must be provided externally (ms since session start). */
export function makeLogEntry(
  timestamp: number,
  screen: PumpScreen,
  event: EventType,
  extras: Partial<SessionLogEntry> = {}
): SessionLogEntry {
  return Object.freeze({ timestamp, screen, event, ...extras });
}

// ─── Action result type ───────────────────────────────────────────────────────

export interface ActionResult {
  state: PumpState;
  logEntries: SessionLogEntry[];
}

function result(state: PumpState, ...entries: SessionLogEntry[]): ActionResult {
  return { state, logEntries: entries };
}

// ─── Actions ─────────────────────────────────────────────────────────────────

/** Select language and move to drug selection. */
export function selectLanguage(
  state: PumpState,
  timestamp: number
): ActionResult {
  const next: PumpState = { ...state, screen: "DRUG_SELECT" };
  return result(next, makeLogEntry(timestamp, state.screen, "language_selected"));
}

/** Select a drug from the library. Resets rate buffer and guardrail override.
 *  Weight-based drugs go to WEIGHT_ENTRY first so the clinician can confirm weight.
 */
export function selectDrug(
  state: PumpState,
  drug: Drug,
  timestamp: number
): ActionResult {
  const nextScreen: PumpScreen = drug.weightBased ? "WEIGHT_ENTRY" : "RATE_ENTRY";
  const next: PumpState = {
    ...state,
    screen: nextScreen,
    selectedDrug: drug,
    rateBuffer: drug.defaultRate,
    guardrailOverride: false,
    // Pre-load weightBuffer with current patient weight so clinician sees it immediately
    weightBuffer: state.patientWeight,
  };
  return result(next, makeLogEntry(timestamp, state.screen, "drug_selected", { drug: drug.name }));
}

/**
 * Adjust the rate buffer by a chevron delta.
 * Handles boundary clamping, correction detection, and logging.
 * Works for VTBI_ENTRY (adjusts vtbiBuffer) and PRESSURE_VIEW (adjusts pressureLevel).
 */
export function adjustChevron(
  state: PumpState,
  delta: number,
  timestamp: number,
  sessionLog: readonly SessionLogEntry[]
): ActionResult {
  // VTBI screen — adjust vtbiBuffer instead
  if (state.screen === "VTBI_ENTRY") {
    const newVtbi = clampVtbi(+(state.vtbiBuffer + delta).toFixed(1));
    const next: PumpState = { ...state, vtbiBuffer: newVtbi };
    return result(next);
  }

  // Weight entry screen — adjust weightBuffer (integer kg, same step sizes)
  if (state.screen === "WEIGHT_ENTRY") {
    const newWeight = clampWeight(Math.round(state.weightBuffer + delta));
    const next: PumpState = { ...state, weightBuffer: newWeight };
    return result(next);
  }

  // Pressure screen — adjust pressureLevel
  if (state.screen === "PRESSURE_VIEW") {
    const newLevel = clampPressure(state.pressureLevel + (delta > 0 ? 1 : -1));
    if (newLevel === state.pressureLevel) return result(state);
    const next: PumpState = { ...state, pressureLevel: newLevel };
    return result(next, makeLogEntry(timestamp, state.screen, "pressure_adjusted", { pressureLevel: newLevel }));
  }

  // Rate entry screens
  if (!["RATE_ENTRY", "ON_HOLD", "RUNNING"].includes(state.screen)) {
    return result(state);
  }

  const raw = +(state.rateBuffer + delta).toFixed(1);
  const { clamped, hitBoundary } = clampRate(raw);

  if (hitBoundary || clamped === state.rateBuffer) {
    return result(
      state,
      makeLogEntry(timestamp, state.screen, "boundary_hit", { delta, rate: state.rateBuffer })
    );
  }

  // Detect correction: find last rate_adjust and check direction reversal
  const lastAdjust = [...sessionLog].reverse().find(e => e.event === "rate_adjust");
  const isCorrection =
    lastAdjust !== undefined &&
    lastAdjust.delta !== undefined &&
    Math.sign(lastAdjust.delta) !== Math.sign(delta);

  const logEntries: SessionLogEntry[] = [];

  if (isCorrection) {
    logEntries.push(makeLogEntry(timestamp, state.screen, "correction", { delta, rate: state.rateBuffer }));
  }

  logEntries.push(
    makeLogEntry(timestamp, state.screen, "rate_adjust", {
      delta,
      rate: state.rateBuffer,
      newRate: clamped,
    })
  );

  const next: PumpState = {
    ...state,
    rateBuffer: clamped,
    // If running, live-update the committed rate too
    rate: state.screen === "RUNNING" ? clamped : state.rate,
  };

  return { state: next, logEntries };
}

/**
 * Press RUN.
 * From RATE_ENTRY: check guardrails then start infusion.
 * From ON_HOLD: resume infusion.
 */
export function pressRun(
  state: PumpState,
  timestamp: number
): ActionResult {
  if (state.screen === "ON_HOLD") {
    const next: PumpState = { ...state, screen: "RUNNING" };
    return result(next, makeLogEntry(timestamp, state.screen, "infusion_resumed"));
  }

  if (state.screen === "RATE_ENTRY") {
    const guardrail = checkGuardrail(state.rateBuffer, state.selectedDrug);

    if (guardrail.status === "blocked") {
      const next: PumpState = { ...state, screen: "GUARDRAIL_BLOCKED" };
      return result(
        next,
        makeLogEntry(timestamp, state.screen, "guardrail_blocked", {
          rate: state.rateBuffer,
          guardrailStatus: "blocked",
        })
      );
    }

    if (guardrail.status === "warning") {
      const next: PumpState = { ...state, screen: "GUARDRAIL_WARNING" };
      return result(
        next,
        makeLogEntry(timestamp, state.screen, "guardrail_warning", {
          rate: state.rateBuffer,
          guardrailStatus: "warning",
        })
      );
    }

    // All clear — start infusion
    const next: PumpState = {
      ...state,
      screen: "RUNNING",
      rate: state.rateBuffer,
      guardrailOverride: false,
    };
    return result(
      next,
      makeLogEntry(timestamp, state.screen, "infusion_started", {
        rate: state.rateBuffer,
        drug: state.selectedDrug.name,
        vtbi: state.vtbi ?? undefined,
      })
    );
  }

  return result(state);
}

/** Override a guardrail warning and start infusion. MUST always be logged. */
export function overrideGuardrail(
  state: PumpState,
  timestamp: number
): ActionResult {
  if (state.screen !== "GUARDRAIL_WARNING") return result(state);
  const next: PumpState = {
    ...state,
    screen: "RUNNING",
    rate: state.rateBuffer,
    guardrailOverride: true,
  };
  return result(
    next,
    // FIX: use correct event type "guardrail_override" not "guardrail_overridden"
    makeLogEntry(timestamp, state.screen, "guardrail_override", {
      rate: state.rateBuffer,
      drug: state.selectedDrug.name,
      overrideChoice: "override",
      guardrailStatus: "warning",
    })
  );
}

/** Re-enter rate from guardrail warning or blocked screen. */
export function reEnterRate(state: PumpState, timestamp: number): ActionResult {
  if (!["GUARDRAIL_WARNING", "GUARDRAIL_BLOCKED"].includes(state.screen)) return result(state);
  const next: PumpState = { ...state, screen: "RATE_ENTRY", guardrailOverride: false };
  return result(
    next,
    makeLogEntry(timestamp, state.screen, "guardrail_re_entered", { overrideChoice: "re-enter" })
  );
}

/** Press HOLD — pause infusion. */
export function pressHold(state: PumpState, timestamp: number): ActionResult {
  if (state.screen !== "RUNNING") return result(state);
  const next: PumpState = { ...state, screen: "ON_HOLD" };
  return result(next, makeLogEntry(timestamp, state.screen, "infusion_held"));
}

/** Open OPTIONS menu. */
export function openOptions(state: PumpState, timestamp: number): ActionResult {
  if (!["RUNNING", "ON_HOLD", "RATE_ENTRY"].includes(state.screen)) return result(state);
  const next: PumpState = { ...state, previousScreen: state.screen, screen: "OPTIONS" };
  return result(next, makeLogEntry(timestamp, state.screen, "options_opened"));
}

/** Open PRESSURE view. No-op if already in PRESSURE_VIEW (prevents previousScreen self-reference). */
export function openPressureView(state: PumpState, timestamp: number): ActionResult {
  if (state.screen === "PRESSURE_VIEW") return result(state);
  const next: PumpState = { ...state, previousScreen: state.screen, screen: "PRESSURE_VIEW" };
  return result(next, makeLogEntry(timestamp, state.screen, "pressure_viewed"));
}

/** Go back from OPTIONS or PRESSURE_VIEW to previous screen. */
export function goBack(state: PumpState, _timestamp: number): ActionResult {
  if (!["OPTIONS", "PRESSURE_VIEW"].includes(state.screen)) return result(state);
  const next: PumpState = { ...state, screen: state.previousScreen };
  return result(next);
}

/** Navigate to VTBI entry screen. */
export function openVtbiEntry(state: PumpState, _timestamp: number): ActionResult {
  const next: PumpState = {
    ...state,
    previousScreen: state.screen,
    screen: "VTBI_ENTRY",
    vtbiBuffer: state.vtbi ?? 500,
  };
  return result(next);
}

/** Confirm VTBI value. */
export function confirmVtbi(state: PumpState, timestamp: number): ActionResult {
  const next: PumpState = { ...state, vtbi: state.vtbiBuffer, screen: "RATE_ENTRY" };
  return result(
    next,
    makeLogEntry(timestamp, state.screen, "vtbi_set", { vtbi: state.vtbiBuffer })
  );
}

/** Clear VTBI. */
export function clearVtbi(state: PumpState, timestamp: number): ActionResult {
  const next: PumpState = { ...state, vtbi: null, vtbiBuffer: 500, screen: "RATE_ENTRY" };
  return result(next, makeLogEntry(timestamp, state.screen, "vtbi_cleared"));
}

/** Trigger an alarm. Stops infusion if alarm definition requires it. */
export function triggerAlarm(
  state: PumpState,
  alarmType: AlarmType,
  timestamp: number
): ActionResult {
  const def = ALARM_DEFINITIONS[alarmType];
  const next: PumpState = {
    ...state,
    screen: "ALARM",
    alarmMessage: def.message,
    alarmType,
  };
  return result(
    next,
    makeLogEntry(timestamp, state.screen, "alarm_triggered", { alarmType })
  );
}

/** Silence an alarm.
 *  - Critical alarms (OCCLUSION, AIR_IN_LINE): move to ON_HOLD.
 *  - KVO / INFUSION_COMPLETE: move back to RUNNING — pump continues at KVO rate.
 */
export function silenceAlarm(state: PumpState, timestamp: number): ActionResult {
  if (state.screen !== "ALARM") return result(state);
  const nextScreen: PumpScreen = state.kvoActive ? "RUNNING" : "ON_HOLD";
  const next: PumpState = {
    ...state,
    screen: nextScreen,
    alarmMessage: "",
    alarmType: null,
  };
  const entries: SessionLogEntry[] = [
    makeLogEntry(timestamp, state.screen, "alarm_silenced"),
  ];
  if (state.kvoActive) {
    entries.push(makeLogEntry(timestamp, nextScreen, "infusion_resumed", {
      rate: FACTORY_DEFAULTS.KVO_RATE,
      drug: state.selectedDrug.name,
    }));
  }
  return { state: next, logEntries: entries };
}

/**
 * Infusion tick — advance volumeInfused and check all auto-trigger conditions.
 *
 * Auto-triggers implemented per DFU Alarms section:
 *   1. VTBI complete → KVO mode + INFUSION_COMPLETE alarm
 *   2. pressureLevel >= 7 → OCCLUSION alarm (DFU: "pressureLevel >= 7 during running")
 *   3. volumeInfused >= 500ml (first time) → AIR_IN_LINE alarm (simulator approximation)
 *   4. batteryLevel < BATTERY_LOW_PCT → BATTERY_LOW alarm (approximated)
 *
 * Priority order: OCCLUSION > AIR_IN_LINE > BATTERY_LOW > INFUSION_COMPLETE.
 * Only one alarm fires per tick — highest priority wins.
 */
export function infusionTick(
  state: PumpState,
  timestamp: number
): ActionResult {
  if (state.screen !== "RUNNING") return result(state);

  const mlPerTick =
    (rateToMlH(state.rate, state.selectedDrug, state.patientWeight) / 3600) *
    (FACTORY_DEFAULTS.INFUSION_TICK_MS / 1000);

  const newVolume  = +(state.volumeInfused + mlPerTick).toFixed(3);
  const newBattery = +Math.max(0, state.batteryLevel - FACTORY_DEFAULTS.BATTERY_DRAIN_PER_TICK).toFixed(3);

  // Build the updated state before alarm checks
  const ticked: PumpState = { ...state, volumeInfused: newVolume, batteryLevel: newBattery };

  // 1. OCCLUSION — pressure alarm (DFU: stops infusion)
  if (state.pressureLevel >= FACTORY_DEFAULTS.OCCLUSION_PRESSURE_THRESHOLD) {
    return triggerAlarm(ticked, "OCCLUSION", timestamp);
  }

  // 2. AIR_IN_LINE — first crossing of 500ml threshold (simulator approximation per DFU)
  if (!state.ailTriggered && newVolume >= FACTORY_DEFAULTS.AIL_VOLUME_TRIGGER_ML) {
    return triggerAlarm({ ...ticked, ailTriggered: true }, "AIR_IN_LINE", timestamp);
  }

  // 3. BATTERY_LOW — first time battery drops below threshold
  if (state.batteryLevel >= FACTORY_DEFAULTS.BATTERY_LOW_PCT &&
      newBattery < FACTORY_DEFAULTS.BATTERY_LOW_PCT) {
    return triggerAlarm(ticked, "BATTERY_LOW", timestamp);
  }

  // 4. VTBI complete — drop to KVO rate and raise advisory alarm (skip if already in KVO)
  if (state.vtbi !== null && !state.kvoActive && newVolume >= state.vtbi) {
    const kvoState: PumpState = {
      ...ticked,
      volumeInfused: state.vtbi,
      rate: FACTORY_DEFAULTS.KVO_RATE,
      rateBuffer: FACTORY_DEFAULTS.KVO_RATE,
      kvoActive: true,
    };
    return triggerAlarm(kvoState, "INFUSION_COMPLETE", timestamp);
  }

  return result(ticked);
}

/** Clear volume infused counter. */
export function clearVolume(state: PumpState, timestamp: number): ActionResult {
  const next: PumpState = { ...state, volumeInfused: 0 };
  return result(next, makeLogEntry(timestamp, state.screen, "volume_cleared"));
}

/** Power off — full reset to initial state. */
export function powerOff(state: PumpState, timestamp: number): ActionResult {
  const initial = getInitialState();
  return result(initial, makeLogEntry(timestamp, state.screen, "session_end"));
}

/** Navigate from drug select back to drug list (called by DRUG softkey on RATE_ENTRY). */
export function goToDrugSelect(state: PumpState, _timestamp: number): ActionResult {
  const next: PumpState = { ...state, screen: "DRUG_SELECT" };
  return result(next);
}

/** Navigate from ON_HOLD back to RATE_ENTRY for reprogramming. */
export function reprogramRate(state: PumpState, _timestamp: number): ActionResult {
  if (state.screen !== "ON_HOLD") return result(state);
  const next: PumpState = { ...state, screen: "RATE_ENTRY" };
  return result(next);
}

/**
 * Move the drug selection cursor up (-1) or down (+1) in DRUG_SELECT screen.
 * Clamps to valid DRUG_LIBRARY indices.
 */
export function moveDrugCursor(
  state: PumpState,
  direction: 1 | -1
): ActionResult {
  if (state.screen !== "DRUG_SELECT") return result(state);
  const newIndex = Math.max(
    0,
    Math.min(DRUG_LIBRARY.length - 1, state.drugCursorIndex + direction)
  );
  return result({ ...state, drugCursorIndex: newIndex });
}

/**
 * Confirm the drug currently highlighted by the cursor in DRUG_SELECT.
 * Equivalent to clicking the row directly.
 */
export function confirmDrugSelection(
  state: PumpState,
  timestamp: number
): ActionResult {
  if (state.screen !== "DRUG_SELECT") return result(state);
  return selectDrug(state, DRUG_LIBRARY[state.drugCursorIndex], timestamp);
}

/**
 * Confirm the patient weight entered in WEIGHT_ENTRY and proceed to RATE_ENTRY.
 * Logs the confirmed weight for AI feature extraction.
 */
export function confirmWeight(state: PumpState, timestamp: number): ActionResult {
  if (state.screen !== "WEIGHT_ENTRY") return result(state);
  const next: PumpState = {
    ...state,
    screen: "RATE_ENTRY",
    patientWeight: state.weightBuffer,
  };
  return result(
    next,
    makeLogEntry(timestamp, state.screen, "weight_set", {
      rate: state.weightBuffer, // reuse rate field to carry the weight value
    })
  );
}

/**
 * Cancel weight entry and return to DRUG_SELECT without changing patient weight.
 */
export function cancelWeight(state: PumpState, _timestamp: number): ActionResult {
  if (state.screen !== "WEIGHT_ENTRY") return result(state);
  return result({ ...state, screen: "DRUG_SELECT" });
}
