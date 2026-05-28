/**
 * Type definitions for the Graseby 3100 Syringe Driver simulator.
 *
 * ARCHITECTURE ROLE:
 *   Mirrors src/pump/types.ts (Alaris GP) and src/pump/braun/braunTypes.ts but
 *   for the Graseby 3100 — a purely mechanical/electronic syringe driver with
 *   NO drug library, NO guardrails, NO network, NO VTBI, NO bolus mode.
 *
 * KEY DIFFERENCES FROM ALARIS GP / B. BRAUN:
 *   - No drug library: always MANUAL mode; drug_library_used is always 0.
 *   - No guardrail system: any rate between RATE_MIN and RATE_MAX is accepted.
 *   - No VTBI: syringe capacity (10/20/50 ml) is the only volume constraint.
 *   - No network connectivity: completely standalone device.
 *   - No bolus: syringe drivers do not support bolus delivery.
 *   - Simpler state machine: 5 screens vs 11 for the Alaris GP.
 *   - Rate range: 0.1–199.9 ml/h (Graseby 3100 Operators Manual spec table).
 *
 * CLINICAL CONTEXT:
 *   The Graseby 3100 was widely used in UK ICUs and palliative care for opioid
 *   infusions (morphine, diamorphine, fentanyl). The absence of guardrails was
 *   implicated in multiple fatal overdoses in the 2000s (NPSA Alert 2010, UK).
 *   This makes it the baseline "high design risk, zero cyber risk" device in the
 *   ranking system.
 *
 * SOURCE:
 *   Graseby 3100 Syringe Driver Operators Manual — ardusmedical.com (2002)
 *   NPSA Patient Safety Alert — "Safer use of syringe drivers" (2010, UK)
 *
 * NO React imports allowed in this file.
 */

// ─── Screen States ────────────────────────────────────────────────────────────

/**
 * All screen states for the Graseby 3100 Syringe Driver.
 *
 * Deliberately minimal — the Graseby 3100 has a small single-line display
 * with no multi-screen UI. The simulator abstracts this to 5 states.
 *
 * Source: Graseby 3100 Operators Manual — operating sequence.
 */
export type GrasebyScreen =
  | 'BOOT'          // Device starting up (power LED on, self-test)
  | 'RATE_ENTRY'    // Rate programming via chevrons (ml/h displayed)
  | 'RUNNING'       // Infusion active (green LED, rate displayed)
  | 'ON_HOLD'       // Infusion paused (amber LED)
  | 'ALARM';        // Alarm condition active (audible + LED)

// ─── Syringe Sizes ────────────────────────────────────────────────────────────

/**
 * Supported syringe capacities in ml.
 * The Graseby 3100 accepts standard BD Plastipak and Monoject syringes.
 * Sizes: 20ml, 30ml, 50ml (60ml also listed in manual; 50ml used here).
 * Source: Graseby 3100 Operators Manual — compatible syringe list.
 */
export type SyringeCapacityMl = 20 | 30 | 50;

// ─── Alarm Types ─────────────────────────────────────────────────────────────

/**
 * Alarm types for the Graseby 3100.
 * Much simpler than Alaris GP or B. Braun — no guardrail alarms.
 * Source: Graseby 3100 Operators Manual — alarms section.
 */
export type GrasebyAlarmType =
  | 'OCCLUSION'       // Downstream blockage detected — stops infusion — CRITICAL
  | 'SYRINGE_EMPTY'   // Syringe capacity reached — infusion complete
  | 'BATTERY_LOW';    // Battery below threshold — WARNING

// ─── Event Types ─────────────────────────────────────────────────────────────

/**
 * All event types that can appear in a Graseby 3100 session log.
 *
 * Intentionally uses the same event names as SessionLogEntry for events that
 * extractFeatures() counts (rate_adjust, correction, boundary_hit,
 * infusion_started, bolus_ended are the shared keys).
 * The index signature [key: string]: unknown makes the cast safe.
 *
 * Notably absent vs Alaris GP:
 *   - guardrail_warning / guardrail_override / guardrail_blocked (no guardrails)
 *   - drug_selected (no library; always manual)
 *   - vtbi_set / vtbi_cleared (no VTBI)
 *   - bolus_started / bolus_ended (no bolus)
 *   - language_selected (no language screen)
 *
 * Source: Graseby 3100 Operators Manual — operating sequence.
 */
export type GrasebyEventType =
  | 'session_start'
  | 'rate_adjust'         // chevron press (+ or -)
  | 'boundary_hit'        // tried to go past RATE_MIN or RATE_MAX
  | 'correction'          // direction reversal during rate entry
  | 'syringe_selected'    // nurse changed syringe capacity (10/20/50ml)
  | 'infusion_started'    // START pressed, infusion begins
  | 'infusion_held'       // STOP pressed during infusion
  | 'infusion_resumed'    // START pressed from hold
  | 'infusion_complete'   // syringe empty — all volume delivered
  | 'alarm_triggered'     // alarm condition detected
  | 'alarm_silenced'      // ALARM-SILENCE button pressed
  | 'session_end';

// ─── Session Log Entry ────────────────────────────────────────────────────────

/**
 * A single event in the Graseby 3100 session log.
 *
 * Uses an index signature [key: string]: unknown to allow safe casting to
 * SessionLogEntry[] for use with extractFeatures() in sessionAdapter.ts.
 *
 * Source: Mirrors src/pump/types.ts SessionLogEntry pattern.
 */
export interface GrasebySessionLogEntry {
  timestamp:     number;           // ms since session start
  screen:        GrasebyScreen;    // which screen when event occurred
  event:         GrasebyEventType; // what happened
  rate?:         number;           // current rate at time of event
  delta?:        number;           // chevron delta (+1, -10 etc)
  newRate?:      number;           // rate after this event
  alarmType?:    GrasebyAlarmType;
  syringeCapacity?: SyringeCapacityMl;
  [key: string]: unknown;          // allows safe cast to SessionLogEntry
}

// ─── Pump State ───────────────────────────────────────────────────────────────

/**
 * Complete state of the Graseby 3100 Syringe Driver at any point in a session.
 *
 * Deliberately minimal — the Graseby 3100 has far fewer parameters than
 * the Alaris GP or B. Braun Infusomat Space.
 *
 * Source: Graseby 3100 Operators Manual — device state model.
 */
export interface GrasebyPumpState {
  /** Current screen being displayed. */
  screen:               GrasebyScreen;
  /** Current programmed rate in ml/h. Range: 0.1–199.9 ml/h. */
  rate:                 number;
  /** Selected syringe capacity in ml (10, 20, or 50). */
  syringeCapacityMl:    SyringeCapacityMl;
  /** Volume delivered so far in ml (accumulated across ticks). */
  volumeInfused:        number;
  /** Battery charge level as a percentage (0–100). */
  batteryLevel:         number;
  /** Active alarm type, null if no alarm. */
  alarmType:            GrasebyAlarmType | null;
  /** Human-readable alarm message displayed on screen. */
  alarmMessage:         string;
  /** Whether AIR_IN_LINE auto-trigger has already fired this session. */
  ailTriggered:         boolean;
  /** Epoch timestamp (ms) when the mute expires; 0 = not muted. */
  mutedUntil:           number;
  /** Index in drug cursor (always 0 — no library). */
  drugCursorIndex:      number;
}

// ─── State Machine Result ─────────────────────────────────────────────────────

/**
 * Result of a state machine transition.
 * Mirrors the Alaris GP / B. Braun pattern.
 */
export interface GrasebyStateResult {
  /** New pump state after the action. */
  state:      GrasebyPumpState;
  /** Log entries generated by this action. */
  logEntries: readonly GrasebySessionLogEntry[];
}
