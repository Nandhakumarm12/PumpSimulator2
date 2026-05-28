/**
 * Core state machine for the B. Braun Infusomat Space LVP simulator.
 *
 * ARCHITECTURE ROLE:
 *   Pure TypeScript state machine — no side effects, no React, no global mutation.
 *   Mirrors src/pump/stateMachine.ts (Alaris GP) but with B. Braun-specific
 *   behaviour adaptations as documented below.
 *
 * KEY DIFFERENCES FROM ALARIS GP (stateMachine.ts):
 *
 *   1. THREE-TIER GUARDRAIL (pressRun):
 *      - advisory zone → GUARDRAIL_ADVISORY screen (tier 1, new)
 *      - soft limit exceeded → GUARDRAIL_WARNING screen (tier 2)
 *      - hard limit exceeded → GUARDRAIL_BLOCKED screen (tier 3)
 *      Uses checkBraunGuardrail() from braunGuardrails.ts.
 *
 *   2. ADVISORY ACKNOWLEDGEMENT (acknowledgeAdvisory):
 *      New function — from GUARDRAIL_ADVISORY screen, nurse acknowledges
 *      the informational notice and infusion starts. Logs
 *      guardrail_advisory_acknowledged event. No equivalent in Alaris GP.
 *
 *   3. BOLUS MAXIMUM:
 *      Bolus is clamped at BRAUN_DEFAULTS.BOLUS_MAX_ML (2.0 ml) not 5.0 ml
 *      (Alaris GP FACTORY_DEFAULTS.BOLUS_VOLUME_MAX = 5 ml).
 *      Source: B. Braun IFU — "Bolus Volume Max 2 ml".
 *
 *   4. SPACECOM2 MODULE (connectSpaceCom2 / disconnectSpaceCom2):
 *      Toggle the spacecom2Connected field and log connection events.
 *      No equivalent in Alaris GP (the Alaris GP has no module-level concept).
 *
 *   5. STARTUP SCREEN:
 *      Initial screen is STARTUP (self-test) rather than LANGUAGE_SELECT.
 *      The Infusomat Space does not have a language selection prompt.
 *
 *   6. RATE FIELD:
 *      No separate rateBuffer — the 'rate' field is edited directly during
 *      RATE_ENTRY. This simplifies the B. Braun state model relative to the
 *      Alaris GP, which keeps rateBuffer and rate separate.
 *
 * VALID SCREEN TRANSITIONS (B. Braun):
 *   STARTUP            → DRUG_SELECT      (boot complete)
 *   DRUG_SELECT        → RATE_ENTRY       (drug selected)
 *   RATE_ENTRY         → GUARDRAIL_ADVISORY (advisory zone on RUN — tier 1)
 *   RATE_ENTRY         → GUARDRAIL_WARNING  (soft stop on RUN — tier 2)
 *   RATE_ENTRY         → GUARDRAIL_BLOCKED  (hard stop on RUN — tier 3)
 *   RATE_ENTRY         → RUNNING            (rate OK on RUN)
 *   RATE_ENTRY         → VTBI_ENTRY         (VTBI softkey)
 *   GUARDRAIL_ADVISORY → RUNNING            (acknowledgeAdvisory — logs event)
 *   GUARDRAIL_WARNING  → RUNNING            (overrideGuardrail — logs event)
 *   GUARDRAIL_WARNING  → RATE_ENTRY         (reEnterRate)
 *   GUARDRAIL_BLOCKED  → RATE_ENTRY         (reEnterRate — only option)
 *   VTBI_ENTRY         → RATE_ENTRY         (confirmVtbi or clearVtbi)
 *   RUNNING            → ON_HOLD            (pressHold)
 *   RUNNING            → ALARM              (alarm triggered)
 *   ON_HOLD            → RUNNING            (pressRun_fromHold)
 *   ON_HOLD            → RATE_ENTRY         (reprogramRate)
 *   ALARM              → ON_HOLD            (silenceAlarm — critical alarms)
 *   ALARM              → RUNNING            (silenceAlarm — KVO/informational)
 *   Any screen         → STARTUP            (powerOff — full reset)
 *
 * SOURCE:
 *   B. Braun Infusomat Space IFU — bbraunusa.com (2024), operating procedure.
 *   PVSio-web formal model (Alaris GP): adapted for B. Braun differences.
 *   CLAUDE.md Section 6 — Pump State Machine (adapted for B. Braun).
 *
 * NO React imports allowed in this file.
 */

import type { Drug } from '../types';
import { rateToMlH, clampRate, clampVtbi } from '../display';
import type {
  BraunPumpState,
  BraunActionResult,
  BraunSessionLogEntry,
  BraunScreen,
  BraunEventType,
  BraunAlarmType,
} from './braunTypes';
import { checkBraunGuardrail } from './braunGuardrails';
import { BRAUN_DEFAULTS } from './braunConstants';
import { BRAUN_DRUG_LIBRARY, getBraunDrug } from './braunDrugLibrary';

// ─── Helper: Build action result ─────────────────────────────────────────────

/**
 * Create a BraunActionResult from a state and zero or more log entries.
 * Internal helper — not exported.
 */
function result(state: BraunPumpState, ...entries: BraunSessionLogEntry[]): BraunActionResult {
  return { state, logEntries: entries };
}

// ─── Helper: Build log entry ──────────────────────────────────────────────────

/**
 * Create an immutable BraunSessionLogEntry.
 *
 * @param timestamp - Ms since session start
 * @param screen    - Current screen when event occurred
 * @param event     - Event type
 * @param extras    - Optional additional fields
 * @returns Frozen (immutable) log entry
 */
export function makeBraunLogEntry(
  timestamp: number,
  screen: BraunScreen,
  event: BraunEventType,
  extras: Partial<BraunSessionLogEntry> = {}
): BraunSessionLogEntry {
  return Object.freeze({ timestamp, screen, event, ...extras });
}

// ─── Initial State ────────────────────────────────────────────────────────────

/**
 * Build the initial B. Braun Infusomat Space pump state (device just powered on).
 *
 * Starts at STARTUP screen (self-test). Drug defaults to MANUAL (first in library)
 * consistent with the Alaris GP initial state pattern.
 *
 * @returns Fresh BraunPumpState with all factory defaults applied
 *
 * Source: B. Braun Infusomat Space IFU — power-on sequence.
 * Source: BRAUN_DEFAULTS in braunConstants.ts.
 */
export function getInitialBraunState(): BraunPumpState {
  return {
    screen:                        'STARTUP',
    rate:                          BRAUN_DEFAULTS.RATE_DEFAULT,
    vtbi:                          BRAUN_DEFAULTS.VTBI_DEFAULT,
    vtbiSet:                       false,
    volumeInfused:                 0,
    selectedDrugId:                BRAUN_DRUG_LIBRARY[0].id, // MANUAL by default
    patientWeightKg:               BRAUN_DEFAULTS.WEIGHT_DEFAULT,
    pressureLevel:                 BRAUN_DEFAULTS.PRESSURE_DEFAULT_LEVEL,
    alarmType:                     null,
    alarmMessage:                  '',
    bolusActive:                   false,
    bolusVolumeDelivered:          0,
    kvoActive:                     false,
    batteryLevel:                  BRAUN_DEFAULTS.BATTERY_LEVEL,
    mutedUntil:                    0,
    previousScreen:                'RUNNING',
    guardrailAdvisoryShown:        false,
    guardrailAdvisoryAcknowledged: false,
    spacecom2Connected:            BRAUN_DEFAULTS.SPACECOM2_CONNECTED,
    firmwareSigned:                BRAUN_DEFAULTS.FIRMWARE_SIGNED,
    recallBatchAffected:           false,
    ailTriggered:                  false,
    drugCursorIndex:               0,
    vtbiBuffer:                    500,
  };
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

/**
 * Complete the STARTUP self-test sequence and move to DRUG_SELECT.
 *
 * In the real device this is automatic after a brief hardware self-test.
 * In the simulator it is triggered explicitly to match the Alaris GP
 * selectLanguage() call pattern.
 *
 * @param state     - Current state (must be STARTUP)
 * @param timestamp - Ms since session start
 * @returns New state at DRUG_SELECT with session_start log entry
 *
 * Source: B. Braun Infusomat Space IFU — startup sequence.
 */
export function completeBoot(state: BraunPumpState, timestamp: number): BraunActionResult {
  const next: BraunPumpState = { ...state, screen: 'DRUG_SELECT' };
  return result(
    next,
    makeBraunLogEntry(timestamp, state.screen, 'session_start')
  );
}

// ─── Drug Selection ───────────────────────────────────────────────────────────

/**
 * Select a drug from the B. Braun drug library and move to RATE_ENTRY.
 *
 * Resets the rate to the drug's defaultRate and clears guardrail advisory state.
 * Does NOT go to WEIGHT_ENTRY first (unlike Alaris GP) — the Infusomat Space
 * accepts weight as an inline parameter during rate entry for weight-based drugs.
 *
 * @param state     - Current state (should be DRUG_SELECT)
 * @param drug      - Drug object selected from BRAUN_DRUG_LIBRARY
 * @param timestamp - Ms since session start
 * @returns New state at RATE_ENTRY with drug_selected log entry
 *
 * Source: B. Braun Infusomat Space IFU — drug selection workflow.
 */
export function selectDrug(
  state: BraunPumpState,
  drug: Drug,
  timestamp: number
): BraunActionResult {
  const next: BraunPumpState = {
    ...state,
    screen:                        'RATE_ENTRY',
    selectedDrugId:                drug.id,
    rate:                          drug.defaultRate,
    guardrailAdvisoryShown:        false,
    guardrailAdvisoryAcknowledged: false,
  };
  return result(
    next,
    makeBraunLogEntry(timestamp, state.screen, 'drug_selected', { drug: drug.name })
  );
}

// ─── Chevron Rate Adjustment ──────────────────────────────────────────────────

/**
 * Adjust the rate by a chevron delta during RATE_ENTRY, ON_HOLD, or RUNNING.
 * Adjusts vtbiBuffer during VTBI_ENTRY. Adjusts pressureLevel during PRESSURE_VIEW.
 *
 * Handles boundary clamping, correction detection, and log entry generation.
 * If the delta would push the rate past a boundary, logs a boundary_hit event
 * and leaves the rate at the clamped value.
 *
 * Correction detection: if the last rate_adjust event had the opposite sign
 * delta, the current press is counted as a direction reversal and a
 * correction event is logged before the rate_adjust event.
 *
 * @param state      - Current pump state
 * @param delta      - Chevron delta: +10, +1, -1, or -10
 * @param timestamp  - Ms since session start
 * @param sessionLog - Read-only session log for correction detection
 * @returns New state with updated rate and log entries
 *
 * Source: CLAUDE.md Section 6.3 — Chevron Rate Entry Logic.
 * Source: BRAUN_DEFAULTS.STEP_LARGE / STEP_SMALL.
 */
export function adjustChevron(
  state: BraunPumpState,
  delta: number,
  timestamp: number,
  sessionLog: readonly BraunSessionLogEntry[]
): BraunActionResult {
  // VTBI screen — adjust vtbiBuffer
  if (state.screen === 'VTBI_ENTRY') {
    const newVtbi = clampVtbi(+(state.vtbiBuffer + delta).toFixed(1));
    return result({ ...state, vtbiBuffer: newVtbi });
  }

  // Pressure view — adjust pressure level (1 level per press, direction from sign of delta)
  if (state.screen === 'PRESSURE_VIEW') {
    const step = delta > 0 ? 1 : -1;
    const newLevel = Math.max(1, Math.min(BRAUN_DEFAULTS.PRESSURE_LEVELS, state.pressureLevel + step));
    if (newLevel === state.pressureLevel) return result(state);
    return result(
      { ...state, pressureLevel: newLevel },
      makeBraunLogEntry(timestamp, state.screen, 'pressure_adjusted', { pressureLevel: newLevel })
    );
  }

  // Rate adjustment screens
  if (!['RATE_ENTRY', 'ON_HOLD', 'RUNNING'].includes(state.screen)) {
    return result(state);
  }

  const raw = +(state.rate + delta).toFixed(1);
  const { clamped, hitBoundary } = clampRate(raw);

  if (hitBoundary || clamped === state.rate) {
    return result(
      state,
      makeBraunLogEntry(timestamp, state.screen, 'boundary_hit', {
        delta,
        rate: state.rate,
      })
    );
  }

  // Correction detection: check direction reversal vs last rate_adjust
  const lastAdjust = [...sessionLog].reverse().find(e => e.event === 'rate_adjust');
  const isCorrection =
    lastAdjust !== undefined &&
    lastAdjust.delta !== undefined &&
    Math.sign(lastAdjust.delta) !== Math.sign(delta);

  const logEntries: BraunSessionLogEntry[] = [];

  if (isCorrection) {
    logEntries.push(
      makeBraunLogEntry(timestamp, state.screen, 'correction', {
        delta,
        rate: state.rate,
      })
    );
  }

  logEntries.push(
    makeBraunLogEntry(timestamp, state.screen, 'rate_adjust', {
      delta,
      rate: state.rate,
      newRate: clamped,
    })
  );

  const next: BraunPumpState = {
    ...state,
    rate: clamped,
  };

  return { state: next, logEntries };
}

// ─── Press RUN (from RATE_ENTRY) ──────────────────────────────────────────────

/**
 * Press RUN from RATE_ENTRY — check the three-tier guardrail and start or redirect.
 *
 * Guardrail check priority (B. Braun three-tier system):
 *   1. Hard Stop (blocked): → GUARDRAIL_BLOCKED screen
 *   2. Soft Stop (warning): → GUARDRAIL_WARNING screen
 *   3. Advisory:            → GUARDRAIL_ADVISORY screen
 *   4. OK:                  → RUNNING (infusion starts)
 *
 * For use only from RATE_ENTRY screen. For resuming from ON_HOLD, use
 * pressRun_fromHold() instead.
 *
 * @param state     - Current pump state (must be RATE_ENTRY)
 * @param drug      - Selected drug (for guardrail check)
 * @param weightKg  - Patient weight in kg (for weight-based dose conversion)
 * @param timestamp - Ms since session start
 * @returns New state and log entries for the guardrail check result
 *
 * Source: B. Braun Infusomat Space IFU — "Clinical Advisories", "Soft Stop",
 *         "Hard Stop" guardrail tier descriptions.
 * Source: CLAUDE.md Section 6.2 — Valid Screen Transitions (adapted for B. Braun).
 */
export function pressRun(
  state: BraunPumpState,
  drug: Drug,
  weightKg: number,
  timestamp: number
): BraunActionResult {
  if (state.screen !== 'RATE_ENTRY') return result(state);

  const guardrail = checkBraunGuardrail(state.rate, drug);

  // Tier 3 — Hard Stop
  if (guardrail.status === 'blocked') {
    const next: BraunPumpState = { ...state, screen: 'GUARDRAIL_BLOCKED' };
    return result(
      next,
      makeBraunLogEntry(timestamp, state.screen, 'guardrail_blocked', {
        rate: state.rate,
        guardrailStatus: 'blocked',
      })
    );
  }

  // Tier 2 — Soft Stop
  if (guardrail.status === 'warning') {
    const next: BraunPumpState = { ...state, screen: 'GUARDRAIL_WARNING' };
    return result(
      next,
      makeBraunLogEntry(timestamp, state.screen, 'guardrail_warning', {
        rate: state.rate,
        guardrailStatus: 'warning',
      })
    );
  }

  // Tier 1 — Advisory
  if (guardrail.status === 'advisory') {
    const next: BraunPumpState = {
      ...state,
      screen:                 'GUARDRAIL_ADVISORY',
      guardrailAdvisoryShown: true,
    };
    return result(
      next,
      makeBraunLogEntry(timestamp, state.screen, 'guardrail_advisory', {
        rate: state.rate,
        guardrailStatus: 'advisory',
      })
    );
  }

  // All clear — start infusion
  const next: BraunPumpState = {
    ...state,
    screen:        'RUNNING',
    patientWeightKg: weightKg,
  };
  return result(
    next,
    makeBraunLogEntry(timestamp, state.screen, 'infusion_started', {
      rate:  state.rate,
      drug:  drug.name,
      vtbi:  state.vtbiSet ? state.vtbi : undefined,
    })
  );
}

// ─── Advisory Acknowledgement (NEW — B. Braun only) ──────────────────────────

/**
 * Acknowledge and dismiss the tier-1 advisory notice, starting infusion.
 *
 * This function is unique to the B. Braun three-tier system. After the advisory
 * is acknowledged, infusion proceeds automatically (the nurse does not need to
 * override — advisory is informational only).
 *
 * Logs guardrail_advisory_acknowledged — this event is used by BB-R03 rule to
 * detect the case where advisory was dismissed AND a soft limit warning followed.
 *
 * @param state     - Current pump state (must be GUARDRAIL_ADVISORY)
 * @param drug      - Selected drug (for recording in log entry)
 * @param timestamp - Ms since session start
 * @returns New state at RUNNING with acknowledged advisory log entry
 *
 * Source: B. Braun Infusomat Space IFU — "Clinical Advisories" tier,
 *         "acknowledge to continue" behaviour.
 */
export function acknowledgeAdvisory(
  state: BraunPumpState,
  drug: Drug,
  timestamp: number
): BraunActionResult {
  if (state.screen !== 'GUARDRAIL_ADVISORY') return result(state);

  const next: BraunPumpState = {
    ...state,
    screen:                        'RUNNING',
    guardrailAdvisoryAcknowledged: true,
  };
  return result(
    next,
    makeBraunLogEntry(timestamp, state.screen, 'guardrail_advisory_acknowledged', {
      rate:          state.rate,
      drug:          drug.name,
      overrideChoice: 'acknowledge',
      guardrailStatus: 'advisory',
    })
  );
}

// ─── Guardrail Override (Soft Stop — Tier 2) ─────────────────────────────────

/**
 * Override a tier-2 soft stop warning and start infusion.
 *
 * This is the B. Braun equivalent of the Alaris GP overrideGuardrail().
 * The nurse explicitly chooses to proceed despite the soft limit being exceeded.
 * MUST always be logged — guardrail overrides are the most safety-critical event.
 *
 * @param state     - Current pump state (must be GUARDRAIL_WARNING)
 * @param drug      - Selected drug (for recording in log entry)
 * @param timestamp - Ms since session start
 * @returns New state at RUNNING with override log entry
 *
 * Source: B. Braun Infusomat Space IFU — "Soft Stop" tier, override action.
 * Source: CLAUDE.md Rule 7 — guardrail overrides must ALWAYS be logged.
 */
export function overrideGuardrail(
  state: BraunPumpState,
  drug: Drug,
  timestamp: number
): BraunActionResult {
  if (state.screen !== 'GUARDRAIL_WARNING') return result(state);

  const next: BraunPumpState = { ...state, screen: 'RUNNING' };
  return result(
    next,
    makeBraunLogEntry(timestamp, state.screen, 'guardrail_override', {
      rate:           state.rate,
      drug:           drug.name,
      overrideChoice: 'override',
      guardrailStatus: 'warning',
    })
  );
}

// ─── Re-Enter Rate ────────────────────────────────────────────────────────────

/**
 * Return to RATE_ENTRY from a guardrail warning or blocked screen.
 *
 * Valid from both GUARDRAIL_WARNING (tier 2) and GUARDRAIL_BLOCKED (tier 3).
 * This is the only option available from GUARDRAIL_BLOCKED.
 *
 * @param state     - Current pump state (must be GUARDRAIL_WARNING or GUARDRAIL_BLOCKED)
 * @param timestamp - Ms since session start
 * @returns New state at RATE_ENTRY with re-entered log entry
 *
 * Source: B. Braun Infusomat Space IFU — "Soft Stop" and "Hard Stop" re-entry actions.
 */
export function reEnterRate(state: BraunPumpState, timestamp: number): BraunActionResult {
  if (!['GUARDRAIL_WARNING', 'GUARDRAIL_BLOCKED'].includes(state.screen)) return result(state);

  const next: BraunPumpState = { ...state, screen: 'RATE_ENTRY' };
  return result(
    next,
    makeBraunLogEntry(timestamp, state.screen, 'guardrail_re_entered', {
      overrideChoice: 're-enter',
    })
  );
}

// ─── Hold / Resume ────────────────────────────────────────────────────────────

/**
 * Press HOLD — pause the active infusion.
 *
 * Transitions from RUNNING to ON_HOLD. Invalid from any other screen.
 *
 * @param state     - Current pump state (must be RUNNING)
 * @param timestamp - Ms since session start
 * @returns New state at ON_HOLD with infusion_held log entry
 *
 * Source: B. Braun Infusomat Space IFU — HOLD button operation.
 */
export function pressHold(state: BraunPumpState, timestamp: number): BraunActionResult {
  if (state.screen !== 'RUNNING') return result(state);

  const next: BraunPumpState = { ...state, screen: 'ON_HOLD' };
  return result(
    next,
    makeBraunLogEntry(timestamp, state.screen, 'infusion_held')
  );
}

/**
 * Press RUN from ON_HOLD — resume the paused infusion.
 *
 * Resumes at the previously programmed rate. For re-programming the rate
 * while on hold, use reprogramRate() first, then pressRun().
 *
 * @param state     - Current pump state (must be ON_HOLD)
 * @param timestamp - Ms since session start
 * @returns New state at RUNNING with infusion_resumed log entry
 *
 * Source: B. Braun Infusomat Space IFU — RUN button from HOLD state.
 */
export function pressRun_fromHold(state: BraunPumpState, timestamp: number): BraunActionResult {
  if (state.screen !== 'ON_HOLD') return result(state);

  const next: BraunPumpState = { ...state, screen: 'RUNNING' };
  return result(
    next,
    makeBraunLogEntry(timestamp, state.screen, 'infusion_resumed')
  );
}

/**
 * Navigate from ON_HOLD to RATE_ENTRY for rate reprogramming.
 *
 * @param state - Current pump state (must be ON_HOLD)
 * @returns New state at RATE_ENTRY
 *
 * Source: B. Braun Infusomat Space IFU — reprogramme from hold.
 */
export function reprogramRate(state: BraunPumpState, _timestamp: number): BraunActionResult {
  if (state.screen !== 'ON_HOLD') return result(state);
  return result({ ...state, screen: 'RATE_ENTRY' });
}

// ─── VTBI ─────────────────────────────────────────────────────────────────────

/**
 * Navigate to VTBI_ENTRY screen for VTBI programming.
 *
 * Saves the current screen as previousScreen for return navigation.
 * Pre-loads vtbiBuffer with the current VTBI (if set) or 500 ml default.
 *
 * @param state - Current pump state
 * @returns New state at VTBI_ENTRY
 *
 * Source: B. Braun Infusomat Space IFU — VTBI programming workflow.
 */
export function openVtbiEntry(state: BraunPumpState, _timestamp: number): BraunActionResult {
  const next: BraunPumpState = {
    ...state,
    previousScreen: state.screen,
    screen:         'VTBI_ENTRY',
    vtbiBuffer:     state.vtbiSet ? state.vtbi : 500,
  };
  return result(next);
}

/**
 * Confirm the VTBI value entered and return to RATE_ENTRY.
 *
 * @param state     - Current pump state (must be VTBI_ENTRY)
 * @param vtbi      - The confirmed VTBI value in ml
 * @param timestamp - Ms since session start
 * @returns New state at RATE_ENTRY with vtbi_set log entry
 *
 * Source: B. Braun Infusomat Space IFU — VTBI confirm action.
 */
export function confirmVtbi(
  state: BraunPumpState,
  vtbi: number,
  timestamp: number
): BraunActionResult {
  const clampedVtbi = clampVtbi(vtbi);
  const next: BraunPumpState = {
    ...state,
    screen:  'RATE_ENTRY',
    vtbi:    clampedVtbi,
    vtbiSet: true,
  };
  return result(
    next,
    makeBraunLogEntry(timestamp, state.screen, 'vtbi_set', { vtbi: clampedVtbi })
  );
}

/**
 * Clear the VTBI value and return to RATE_ENTRY.
 *
 * @param state     - Current pump state (must be VTBI_ENTRY)
 * @param timestamp - Ms since session start
 * @returns New state at RATE_ENTRY with vtbi_cleared log entry
 *
 * Source: B. Braun Infusomat Space IFU — VTBI clear action.
 */
export function clearVtbi(state: BraunPumpState, timestamp: number): BraunActionResult {
  const next: BraunPumpState = {
    ...state,
    screen:     'RATE_ENTRY',
    vtbi:       0,
    vtbiSet:    false,
    vtbiBuffer: 500,
  };
  return result(
    next,
    makeBraunLogEntry(timestamp, state.screen, 'vtbi_cleared')
  );
}

// ─── Alarms ───────────────────────────────────────────────────────────────────

/** Maps each B. Braun alarm type to whether it stops infusion. */
const BRAUN_ALARM_STOPS_INFUSION: Record<BraunAlarmType, boolean> = {
  OCCLUSION:          true,
  UPSTREAM_OCCLUSION: true,
  AIR_IN_LINE:        true,
  INFUSION_COMPLETE:  false,
  BATTERY_LOW:        false,
  AC_FAIL:            false,
  KVO:                false,
  SPACECOM2_FAULT:    false,
  FIRMWARE_UNSIGNED:  false,
};

/** Maps each B. Braun alarm type to its display message. */
const BRAUN_ALARM_MESSAGES: Record<BraunAlarmType, string> = {
  OCCLUSION:          'OCCLUSION',
  UPSTREAM_OCCLUSION: 'UPSTREAM OCC',
  AIR_IN_LINE:        'AIR IN LINE',
  INFUSION_COMPLETE:  'INFUSION COMPLETE',
  BATTERY_LOW:        'BATTERY LOW',
  AC_FAIL:            'AC FAIL',
  KVO:                'KVO RUNNING',
  SPACECOM2_FAULT:    'SPACECOM2 FAULT',
  FIRMWARE_UNSIGNED:  'FIRMWARE UNSIGNED',
};

/**
 * Trigger an alarm on the B. Braun pump.
 *
 * Transitions to ALARM screen and sets alarmType and alarmMessage.
 * For alarms that stop infusion (OCCLUSION, UPSTREAM_OCCLUSION, AIR_IN_LINE),
 * the pump stops delivering drug until the alarm is cleared.
 *
 * @param state     - Current pump state
 * @param alarmType - The type of alarm to trigger
 * @param message   - Display message (defaults to canonical message for alarm type)
 * @param timestamp - Ms since session start
 * @returns New state at ALARM with alarm_triggered log entry
 *
 * Source: B. Braun Infusomat Space IFU — alarm section.
 */
export function triggerAlarm(
  state: BraunPumpState,
  alarmType: BraunAlarmType,
  message: string,
  timestamp: number
): BraunActionResult {
  const next: BraunPumpState = {
    ...state,
    screen:       'ALARM',
    alarmType,
    alarmMessage: message || BRAUN_ALARM_MESSAGES[alarmType],
  };
  return result(
    next,
    makeBraunLogEntry(timestamp, state.screen, 'alarm_triggered', { alarmType })
  );
}

/**
 * Silence/acknowledge the current alarm.
 *
 * Critical alarms (occlusion, air-in-line) → ON_HOLD (infusion stopped).
 * Informational alarms (KVO, infusion complete) → RUNNING (pump continues at KVO).
 * Advisory alarms (battery, AC fail, SpaceCom2 fault) → ON_HOLD.
 *
 * @param state     - Current pump state (must be ALARM)
 * @param timestamp - Ms since session start
 * @returns New state at ON_HOLD or RUNNING with alarm_silenced log entry
 *
 * Source: B. Braun Infusomat Space IFU — alarm silencing behaviour.
 */
export function silenceAlarm(state: BraunPumpState, timestamp: number): BraunActionResult {
  if (state.screen !== 'ALARM') return result(state);

  const nextScreen: BraunScreen = state.kvoActive ? 'RUNNING' : 'ON_HOLD';
  const next: BraunPumpState = {
    ...state,
    screen:       nextScreen,
    alarmType:    null,
    alarmMessage: '',
  };

  const entries: BraunSessionLogEntry[] = [
    makeBraunLogEntry(timestamp, state.screen, 'alarm_silenced'),
  ];

  if (state.kvoActive) {
    entries.push(
      makeBraunLogEntry(timestamp, nextScreen, 'infusion_resumed', {
        rate: BRAUN_DEFAULTS.KVO_RATE,
      })
    );
  }

  return { state: next, logEntries: entries };
}

// ─── Infusion Tick ────────────────────────────────────────────────────────────

/**
 * Advance the infusion by one simulation tick (BRAUN_DEFAULTS.INFUSION_TICK_MS).
 *
 * Increments volumeInfused, decrements batteryLevel, and checks all auto-trigger
 * alarm conditions in priority order:
 *
 *   Priority 1: OCCLUSION — pressure level >= OCCLUSION_PRESSURE_LVL (7)
 *   Priority 2: AIR_IN_LINE — first crossing of AIL_VOLUME_TRIGGER_ML (500 ml)
 *   Priority 3: BATTERY_LOW — battery first drops below BATTERY_LOW_PCT (15%)
 *   Priority 4: INFUSION_COMPLETE — volumeInfused >= vtbi → KVO mode + alarm
 *
 * Only one alarm fires per tick (highest priority wins).
 * Only fires when screen is RUNNING.
 *
 * @param state     - Current pump state (must be RUNNING)
 * @param drug      - Selected drug (for ml/h conversion from drug units)
 * @param weightKg  - Patient weight in kg (for weight-based dose calculation)
 * @param timestamp - Ms since session start
 * @returns New state with updated volumeInfused and any triggered alarm
 *
 * Source: CLAUDE.md Section 7.2 — Alarm Conditions.
 * Source: BRAUN_DEFAULTS alarm thresholds.
 */
export function infusionTick(
  state: BraunPumpState,
  drug: Drug,
  weightKg: number,
  timestamp: number
): BraunActionResult {
  if (state.screen !== 'RUNNING') return result(state);

  // Compute volume delivered this tick
  const mlPerTick =
    (rateToMlH(state.rate, drug, weightKg) / 3600) *
    (BRAUN_DEFAULTS.INFUSION_TICK_MS / 1000);

  const newVolume  = +(state.volumeInfused + mlPerTick).toFixed(3);
  const newBattery = +Math.max(0, state.batteryLevel - BRAUN_DEFAULTS.BATTERY_DRAIN_PER_TICK).toFixed(3);

  const ticked: BraunPumpState = {
    ...state,
    volumeInfused: newVolume,
    batteryLevel:  newBattery,
  };

  // 1. OCCLUSION — high pressure
  if (state.pressureLevel >= BRAUN_DEFAULTS.OCCLUSION_PRESSURE_LVL) {
    return triggerAlarm(ticked, 'OCCLUSION', BRAUN_ALARM_MESSAGES['OCCLUSION'], timestamp);
  }

  // 2. AIR_IN_LINE — first crossing of 500 ml threshold (simulator approximation)
  if (!state.ailTriggered && newVolume >= BRAUN_DEFAULTS.AIL_VOLUME_TRIGGER_ML) {
    return triggerAlarm(
      { ...ticked, ailTriggered: true },
      'AIR_IN_LINE',
      BRAUN_ALARM_MESSAGES['AIR_IN_LINE'],
      timestamp
    );
  }

  // 3. BATTERY_LOW — first time battery drops below threshold
  if (
    state.batteryLevel >= BRAUN_DEFAULTS.BATTERY_LOW_PCT &&
    newBattery < BRAUN_DEFAULTS.BATTERY_LOW_PCT
  ) {
    return triggerAlarm(ticked, 'BATTERY_LOW', BRAUN_ALARM_MESSAGES['BATTERY_LOW'], timestamp);
  }

  // 4. INFUSION_COMPLETE — VTBI reached
  if (state.vtbiSet && newVolume >= state.vtbi) {
    const kvoState: BraunPumpState = {
      ...ticked,
      volumeInfused: state.vtbi,
      rate:          BRAUN_DEFAULTS.KVO_RATE,
      kvoActive:     true,
    };
    return triggerAlarm(
      kvoState,
      'INFUSION_COMPLETE',
      BRAUN_ALARM_MESSAGES['INFUSION_COMPLETE'],
      timestamp
    );
  }

  return result(ticked);
}

// ─── Bolus ────────────────────────────────────────────────────────────────────

/**
 * Start bolus delivery (hold-to-deliver from RUNNING screen).
 *
 * Sets bolusActive = true. The bolus volume accumulates on each bolus tick
 * via the stopBolus / bolus tick mechanism in the calling hook.
 * Bolus stops automatically when bolusVolumeDelivered >= BRAUN_DEFAULTS.BOLUS_MAX_ML.
 *
 * Bolus is not allowed for all drugs — check drug.bolusAllowed before calling.
 *
 * @param state     - Current pump state (must be RUNNING)
 * @param timestamp - Ms since session start
 * @returns New state with bolusActive = true and bolus_started log entry
 *
 * Source: B. Braun Infusomat Space IFU — bolus delivery section.
 */
export function startBolus(state: BraunPumpState, timestamp: number): BraunActionResult {
  if (state.screen !== 'RUNNING' || state.bolusActive) return result(state);

  const next: BraunPumpState = { ...state, bolusActive: true };
  return result(
    next,
    makeBraunLogEntry(timestamp, state.screen, 'bolus_started')
  );
}

/**
 * Stop bolus delivery (button release from RUNNING screen).
 *
 * Clamps the cumulative bolus volume to BRAUN_DEFAULTS.BOLUS_MAX_ML (2.0 ml).
 * Logs bolus_ended with the total bolus volume delivered.
 *
 * @param state     - Current pump state
 * @param timestamp - Ms since session start
 * @returns New state with bolusActive = false and bolus_ended log entry
 *
 * Source: B. Braun Infusomat Space IFU — "Bolus Volume Max 2 ml".
 */
export function stopBolus(state: BraunPumpState, timestamp: number): BraunActionResult {
  if (!state.bolusActive) return result(state);

  // Clamp bolus to device maximum (2.0 ml for Infusomat Space)
  const clampedBolusVolume = Math.min(
    state.bolusVolumeDelivered,
    BRAUN_DEFAULTS.BOLUS_MAX_ML
  );

  const next: BraunPumpState = {
    ...state,
    bolusActive:          false,
    bolusVolumeDelivered: clampedBolusVolume,
  };
  return result(
    next,
    makeBraunLogEntry(timestamp, state.screen, 'bolus_ended', {
      bolusVolume: clampedBolusVolume,
    })
  );
}

// ─── SpaceCom2 Module (B. Braun specific) ────────────────────────────────────

/**
 * Connect the SpaceCom2 WiFi/data module.
 *
 * Sets spacecom2Connected = true and logs the event.
 * In the simulator this models the physical act of fitting or re-connecting
 * the SpaceCom2 module to the Infusomat Space base unit.
 *
 * When connected + firmwareSigned = false, BB-R02 HIGH risk rule fires
 * (networked + unsigned firmware = exploitable via CVE-2021-33882).
 *
 * @param state     - Current pump state
 * @param timestamp - Ms since session start
 * @returns New state with spacecom2Connected = true and log entry
 *
 * Source: B. Braun SpaceCom2 module documentation.
 * Source: CISA ICSMA-21-294-01 (CVE-2021-33882 — missing auth for network commands).
 */
export function connectSpaceCom2(state: BraunPumpState, timestamp: number): BraunActionResult {
  if (state.spacecom2Connected) return result(state);

  const next: BraunPumpState = { ...state, spacecom2Connected: true };
  return result(
    next,
    makeBraunLogEntry(timestamp, state.screen, 'spacecom2_connected')
  );
}

/**
 * Disconnect the SpaceCom2 WiFi/data module.
 *
 * Sets spacecom2Connected = false and logs the event.
 * Disconnected SpaceCom2 means the pump cannot receive drug library updates
 * or send infusion data to the SpaceStation. This is logged for BB-R03 analysis.
 *
 * @param state     - Current pump state
 * @param timestamp - Ms since session start
 * @returns New state with spacecom2Connected = false and log entry
 *
 * Source: B. Braun SpaceCom2 module documentation.
 */
export function disconnectSpaceCom2(state: BraunPumpState, timestamp: number): BraunActionResult {
  if (!state.spacecom2Connected) return result(state);

  const next: BraunPumpState = { ...state, spacecom2Connected: false };
  return result(
    next,
    makeBraunLogEntry(timestamp, state.screen, 'spacecom2_disconnected')
  );
}

// ─── Power Off ────────────────────────────────────────────────────────────────

/**
 * Power off the pump — full reset to initial state.
 *
 * Returns a fresh BraunPumpState (STARTUP screen) with all defaults.
 * Logs a session_end event before resetting.
 *
 * @param state     - Current pump state (any screen)
 * @param timestamp - Ms since session start
 * @returns Initial state at STARTUP with session_end log entry
 *
 * Source: B. Braun Infusomat Space IFU — power-off hold 3 seconds.
 */
export function powerOff(state: BraunPumpState, timestamp: number): BraunActionResult {
  const initial = getInitialBraunState();
  return result(
    initial,
    makeBraunLogEntry(timestamp, state.screen, 'session_end')
  );
}

// ─── Drug Cursor Navigation ───────────────────────────────────────────────────

/**
 * Move the drug selection cursor up (-1) or down (+1) in DRUG_SELECT screen.
 *
 * Clamps to valid BRAUN_DRUG_LIBRARY indices (0 to length-1).
 * No log entry is generated — cursor movement is UI navigation, not a clinical event.
 *
 * @param state     - Current pump state (must be DRUG_SELECT)
 * @param direction - +1 for down, -1 for up
 * @returns New state with updated drugCursorIndex
 *
 * Source: CLAUDE.md — drug cursor navigation pattern from Alaris GP.
 */
export function moveDrugCursor(
  state: BraunPumpState,
  direction: 1 | -1
): BraunActionResult {
  if (state.screen !== 'DRUG_SELECT') return result(state);

  const newIndex = Math.max(
    0,
    Math.min(BRAUN_DRUG_LIBRARY.length - 1, state.drugCursorIndex + direction)
  );
  return result({ ...state, drugCursorIndex: newIndex });
}

/**
 * Confirm drug selection by cursor position in DRUG_SELECT.
 *
 * Selects the drug at the current drugCursorIndex and proceeds to RATE_ENTRY.
 *
 * @param state     - Current pump state (must be DRUG_SELECT)
 * @param timestamp - Ms since session start
 * @returns Result of selectDrug() for the highlighted drug
 *
 * Source: CLAUDE.md — confirmDrugSelection() pattern from Alaris GP.
 */
export function confirmDrugSelection(
  state: BraunPumpState,
  timestamp: number
): BraunActionResult {
  if (state.screen !== 'DRUG_SELECT') return result(state);

  const drug = BRAUN_DRUG_LIBRARY[state.drugCursorIndex];
  return selectDrug(state, drug, timestamp);
}

// ─── Options / Pressure ───────────────────────────────────────────────────────

/**
 * Open the OPTIONS menu from RUNNING, ON_HOLD, or RATE_ENTRY.
 *
 * @param state     - Current pump state
 * @param timestamp - Ms since session start
 * @returns New state at OPTIONS with options_opened log entry
 *
 * Source: B. Braun Infusomat Space IFU — OPTIONS button operation.
 */
export function openOptions(state: BraunPumpState, timestamp: number): BraunActionResult {
  if (!['RUNNING', 'ON_HOLD', 'RATE_ENTRY'].includes(state.screen)) return result(state);

  const next: BraunPumpState = { ...state, previousScreen: state.screen, screen: 'OPTIONS' };
  return result(
    next,
    makeBraunLogEntry(timestamp, state.screen, 'options_opened')
  );
}

/**
 * Open the DPS PRESSURE_VIEW screen.
 *
 * @param state     - Current pump state
 * @param timestamp - Ms since session start
 * @returns New state at PRESSURE_VIEW with pressure_viewed log entry
 *
 * Source: B. Braun Infusomat Space IFU — DPS pressure monitoring.
 */
export function openPressureView(state: BraunPumpState, timestamp: number): BraunActionResult {
  if (state.screen === 'PRESSURE_VIEW') return result(state);
  const next: BraunPumpState = { ...state, previousScreen: state.screen, screen: 'PRESSURE_VIEW' };
  return result(
    next,
    makeBraunLogEntry(timestamp, state.screen, 'pressure_viewed')
  );
}

/**
 * Return from OPTIONS or PRESSURE_VIEW to the previous screen.
 *
 * @param state - Current pump state (must be OPTIONS or PRESSURE_VIEW)
 * @returns New state at previousScreen
 *
 * Source: B. Braun Infusomat Space IFU — BACK softkey.
 */
export function goBack(state: BraunPumpState, _timestamp: number): BraunActionResult {
  if (!['OPTIONS', 'PRESSURE_VIEW'].includes(state.screen)) return result(state);
  return result({ ...state, screen: state.previousScreen });
}

// ─── Utility: Get Current Drug ────────────────────────────────────────────────

/**
 * Retrieve the currently selected drug from the B. Braun drug library.
 *
 * Falls back to the MANUAL drug if the selectedDrugId is not found.
 * This should not happen in normal operation, but provides a safe fallback.
 *
 * @param state - Current pump state
 * @returns The Drug object for state.selectedDrugId
 *
 * Source: BRAUN_DRUG_LIBRARY — clinically validated drug definitions.
 */
export function getCurrentDrug(state: BraunPumpState): Drug {
  return getBraunDrug(state.selectedDrugId) ?? BRAUN_DRUG_LIBRARY[0];
}

/**
 * Check whether the alarms-during-session count should be incremented.
 *
 * Helper used by the dataset builder when deciding whether to increment
 * alarmsDuring after an infusion tick that may have triggered an alarm.
 * Returns true if the result contains an alarm_triggered log entry.
 *
 * @param actionResult - Result from infusionTick or triggerAlarm
 * @returns true if an alarm was triggered in this action
 */
export function didTriggerAlarm(actionResult: BraunActionResult): boolean {
  return actionResult.logEntries.some(e => e.event === 'alarm_triggered');
}

// ─── Mute ─────────────────────────────────────────────────────────────────────

/**
 * Mute the active alarm for MUTE_DURATION_MS (120 seconds by default).
 *
 * Sets mutedUntil to now + BRAUN_DEFAULTS.MUTE_DURATION_MS. The alarm will
 * automatically re-sound when that timestamp passes (handled by the hook layer).
 * Logs a mute_pressed event for session analysis.
 *
 * @param state     - Current pump state
 * @param timestamp - Ms since session start
 * @returns New state with mutedUntil set and mute_pressed log entry
 *
 * Source: B. Braun Infusomat Space IFU — MUTE button behaviour.
 */
export function pressMute(state: BraunPumpState, timestamp: number): BraunActionResult {
  const next: BraunPumpState = {
    ...state,
    mutedUntil: Date.now() + BRAUN_DEFAULTS.MUTE_DURATION_MS,
  };
  return result(next, makeBraunLogEntry(timestamp, state.screen, 'mute_pressed'));
}

// ─── Clear Volume Infused ─────────────────────────────────────────────────────

/**
 * Reset the volumeInfused counter to 0 (CLEAR VOLUME INFUSED operation).
 *
 * Only permitted when the pump is NOT actively running (ON_HOLD or RATE_ENTRY
 * or after infusion is complete). Clearing during RUNNING is a potential safety
 * error, so the function guards against it.
 *
 * @param state     - Current pump state
 * @param timestamp - Ms since session start
 * @returns New state with volumeInfused = 0 and volume_cleared log entry,
 *          or unchanged state if the pump is currently RUNNING.
 *
 * Source: B. Braun Infusomat Space IFU — Volume Infused display controls.
 */
export function clearVolume(state: BraunPumpState, timestamp: number): BraunActionResult {
  if (state.screen === 'RUNNING') return result(state);
  const next: BraunPumpState = { ...state, volumeInfused: 0 };
  return result(next, makeBraunLogEntry(timestamp, state.screen, 'volume_cleared'));
}

// ─── Set Patient Weight ───────────────────────────────────────────────────────

/**
 * Update the patient weight used for weight-based dose calculations.
 *
 * Clamped to [BRAUN_DEFAULTS.WEIGHT_MIN, BRAUN_DEFAULTS.WEIGHT_MAX].
 * Not permitted while infusion is RUNNING to prevent mid-session rate changes.
 *
 * @param state     - Current pump state
 * @param weightKg  - New patient weight in kg
 * @param timestamp - Ms since session start
 * @returns New state with patientWeightKg updated and weight_set log entry,
 *          or unchanged state if RUNNING.
 *
 * Source: B. Braun Infusomat Space IFU — patient weight entry.
 */
export function setPatientWeight(
  state: BraunPumpState,
  weightKg: number,
  timestamp: number,
): BraunActionResult {
  if (state.screen === 'RUNNING') return result(state);
  const clamped = Math.max(
    BRAUN_DEFAULTS.WEIGHT_MIN,
    Math.min(BRAUN_DEFAULTS.WEIGHT_MAX, weightKg),
  );
  const next: BraunPumpState = { ...state, patientWeightKg: clamped };
  return result(next, makeBraunLogEntry(timestamp, state.screen, 'weight_set', { newWeight: clamped }));
}

// ─── Toggle Recall Batch ──────────────────────────────────────────────────────

/**
 * Toggle the FDA 2023 Class I recall flag for this device.
 *
 * When recallBatchAffected = true, BB-R05 HIGH risk rule fires during
 * feature extraction. This flag is a research/scenario configuration control
 * that allows the researcher to simulate a recalled device.
 *
 * @param state     - Current pump state
 * @param timestamp - Ms since session start
 * @returns New state with recallBatchAffected toggled and recall_batch_toggled entry
 *
 * Source: FDA recall database Z-0601-2024 — B. Braun Infusomat Space firmware recall.
 */
export function toggleRecallBatch(state: BraunPumpState, timestamp: number): BraunActionResult {
  const next: BraunPumpState = { ...state, recallBatchAffected: !state.recallBatchAffected };
  return result(next, makeBraunLogEntry(timestamp, state.screen, 'recall_batch_toggled'));
}

// ─── Re-export convenience types ──────────────────────────────────────────────

/**
 * Re-export BRAUN_ALARM_STOPS_INFUSION for use by the hook layer.
 * Allows the React hook to know whether an alarm stops infusion without
 * importing the private constant.
 */
export { BRAUN_ALARM_STOPS_INFUSION };
