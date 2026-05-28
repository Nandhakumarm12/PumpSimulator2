/**
 * Type definitions for the B. Braun Infusomat Space LVP simulator.
 *
 * ARCHITECTURE ROLE:
 *   Mirrors src/pump/types.ts for the Alaris GP but adds B. Braun-specific
 *   concepts: three-tier guardrail system (advisory/soft/hard), SpaceCom2
 *   network module, and B. Braun-specific alarm types.
 *
 * KEY DIFFERENCE FROM ALARIS GP:
 *   The Alaris GP has 2 guardrail tiers (soft warning + hard block).
 *   The B. Braun Infusomat Space has 3 tiers:
 *     1. Advisory    — informational notice, infusion continues automatically
 *                      after nurse acknowledges; no hard stop
 *     2. Soft Stop   — rate outside soft limits, nurse must actively override
 *                      or re-enter the rate before infusion can proceed
 *     3. Hard Stop   — rate outside hard limits, re-entry mandatory; no override
 *   This maps to GUARDRAIL_ADVISORY, GUARDRAIL_WARNING, GUARDRAIL_BLOCKED screens.
 *
 * SOURCE:
 *   B. Braun Infusomat Space IFU — bbraunusa.com (2024)
 *   B. Braun SpaceCom2 module documentation
 *   CISA ICSMA-21-294-01 (CVE-2021-33885, CVE-2021-33882 etc.)
 *
 * NO React imports allowed in this file.
 */

// ─── Screen States ────────────────────────────────────────────────────────────

/**
 * All screen states for the B. Braun Infusomat Space.
 *
 * STARTUP replaces the Alaris GP's LANGUAGE_SELECT — the Infusomat Space performs
 * a self-test sequence on boot rather than a language prompt.
 * GUARDRAIL_ADVISORY is new: this tier does not exist on the Alaris GP.
 *
 * Source: B. Braun Infusomat Space IFU — operating mode descriptions.
 */
export type BraunScreen =
  | 'STARTUP'            // Boot screen / self-test (no language prompt on Infusomat Space)
  | 'DRUG_SELECT'        // Drug library browser (Vigilant MasterMed library)
  | 'RATE_ENTRY'         // Rate programming (chevrons active)
  | 'VTBI_ENTRY'         // VTBI programming
  | 'GUARDRAIL_ADVISORY' // NEW (B. Braun only): advisory tier — informational, auto-dismissed after acknowledgement
  | 'GUARDRAIL_WARNING'  // Soft stop tier — nurse must override or re-enter
  | 'GUARDRAIL_BLOCKED'  // Hard stop tier — re-entry mandatory, no override
  | 'RUNNING'            // Infusion active
  | 'ON_HOLD'            // Infusion paused
  | 'ALARM'              // Alarm condition
  | 'OPTIONS'            // Options menu
  | 'PRESSURE_VIEW';     // DPS (Dynamic Pressure System) pressure monitoring

// ─── Alarm Types ─────────────────────────────────────────────────────────────

/**
 * B. Braun Infusomat Space alarm types.
 *
 * Extends the Alaris GP alarm set with two B. Braun-specific alarms:
 *   SPACECOM2_FAULT    — communication fault in the SpaceCom2 WiFi module.
 *                        This alarm has no Alaris GP equivalent; the Alaris GP
 *                        uses a simple network disconnection indicator rather than
 *                        a dedicated alarm state.
 *   FIRMWARE_UNSIGNED  — triggered in the simulator when firmwareSigned = false
 *                        to represent the risk described in CVE-2021-33885.
 *                        This is a research-only simulator alarm; the real device
 *                        does not check its own signing status at runtime.
 *
 * Source: B. Braun Infusomat Space IFU alarm section.
 * Source: CISA ICSMA-21-294-01 (CVE-2021-33885, SpaceCom2 fault model).
 */
export type BraunAlarmType =
  | 'OCCLUSION'           // Downstream occlusion — stops infusion — CRITICAL
  | 'UPSTREAM_OCCLUSION'  // Upstream (closed clamp) detected — stops infusion — CRITICAL
  | 'AIR_IN_LINE'         // Air-in-line detected — stops infusion — CRITICAL
  | 'INFUSION_COMPLETE'   // VTBI reached — informational, pump continues at KVO
  | 'BATTERY_LOW'         // Battery below threshold — WARNING
  | 'AC_FAIL'             // Mains power lost — WARNING
  | 'KVO'                 // Running at KVO rate after VTBI complete — informational
  | 'SPACECOM2_FAULT'     // SpaceCom2 module communication error — B. Braun specific
  | 'FIRMWARE_UNSIGNED';  // Unsigned firmware risk indicator — B. Braun specific (CVE-2021-33885)

// ─── Three-Tier Guardrail ─────────────────────────────────────────────────────

/**
 * Three-tier guardrail result unique to the B. Braun Infusomat Space.
 *
 * Unlike the Alaris GP (two tiers: warning | blocked), the Infusomat Space
 * has three tiers:
 *   - advisory: rate is approaching soft limits but still within them.
 *               Infusion proceeds automatically after nurse acknowledgement.
 *               Only shown for library drugs; MANUAL mode has no advisory.
 *   - warning:  rate has exceeded soft limits. Nurse must explicitly choose
 *               OVERRIDE or RE-ENTER before infusion can proceed. Maps to
 *               GUARDRAIL_WARNING screen.
 *   - blocked:  rate has exceeded hard limits. Only RE-ENTER is allowed.
 *               Maps to GUARDRAIL_BLOCKED screen.
 *
 * Source: B. Braun Infusomat Space IFU — "Clinical Advisories", "Soft Stop",
 *         "Hard Stop" tier descriptions.
 */
export type BraunGuardrailStatus =
  | { status: 'ok' }
  | { status: 'advisory'; message: string }   // tier 1 — within soft limits but near boundary
  | { status: 'warning';  message: string }   // tier 2 — outside soft limits
  | { status: 'blocked';  message: string };  // tier 3 — outside hard limits

// ─── Event Types ──────────────────────────────────────────────────────────────

/**
 * All event types that can appear in a B. Braun session log.
 *
 * Extends the Alaris GP EventType concepts with three B. Braun-specific events:
 *   guardrail_advisory             — advisory tier was shown to the nurse.
 *   guardrail_advisory_acknowledged — nurse dismissed the advisory (infusion continues).
 *   spacecom2_connected / _disconnected — SpaceCom2 module state changes.
 *
 * The 'language_selected' event is absent (no language select screen on Infusomat Space).
 * The 'mute_pressed', 'volume_cleared', 'weight_set', 'options_opened' events are
 * present but named consistently with the Alaris GP for cross-device log analysis.
 *
 * Source: B. Braun Infusomat Space IFU — operating procedure workflow.
 * Source: CISA ICSMA-21-294-01 — SpaceCom2 connectivity model.
 */
export type BraunEventType =
  | 'session_start'
  | 'drug_selected'
  | 'rate_adjust'
  | 'boundary_hit'
  | 'correction'
  | 'guardrail_advisory'              // NEW: advisory tier shown (tier 1)
  | 'guardrail_advisory_acknowledged' // NEW: nurse acknowledged and dismissed advisory
  | 'guardrail_warning'               // soft stop tier shown (tier 2)
  | 'guardrail_override'              // nurse chose OVERRIDE on soft stop
  | 'guardrail_blocked'               // hard stop shown (tier 3)
  | 'guardrail_re_entered'            // nurse chose RE-ENTER from warning or blocked
  | 'vtbi_set'
  | 'vtbi_cleared'
  | 'infusion_started'
  | 'infusion_held'
  | 'infusion_resumed'
  | 'infusion_complete'
  | 'bolus_started'
  | 'bolus_ended'
  | 'alarm_triggered'
  | 'alarm_silenced'
  | 'mute_pressed'
  | 'pressure_viewed'
  | 'pressure_adjusted'
  | 'options_opened'
  | 'volume_cleared'
  | 'weight_set'                      // patient weight updated
  | 'recall_batch_toggled'            // FDA recall batch flag changed
  | 'spacecom2_connected'             // NEW: SpaceCom2 module connected event
  | 'spacecom2_disconnected'          // NEW: SpaceCom2 module disconnected event
  | 'session_end';

// ─── Pump State ───────────────────────────────────────────────────────────────

/**
 * Complete state of the B. Braun Infusomat Space pump at any point in a session.
 *
 * Designed to be serialisable (no functions, no circular references) so it can
 * be stored in the session log and exported to JSON.
 *
 * Key differences from Alaris GP PumpState:
 *   - guardrailAdvisoryShown / guardrailAdvisoryAcknowledged: track advisory tier
 *   - spacecom2Connected: SpaceCom2 WiFi module presence (B. Braun-specific network component)
 *   - firmwareSigned: reflects CVE-2021-33885 vulnerability status
 *   - No rateBuffer / weightBuffer fields — the Infusomat Space state machine uses
 *     a single 'rate' field that is directly modified by chevron presses
 *
 * Source: B. Braun Infusomat Space IFU — device state model.
 */
export interface BraunPumpState {
  /** Current screen being displayed. */
  screen:               BraunScreen;
  /** Current programmed rate in drug display units (drug-unit or ml/h for MANUAL). */
  rate:                 number;
  /** Volume to be infused in ml (0 if VTBI not set). */
  vtbi:                 number;
  /** Whether VTBI has been programmed. */
  vtbiSet:              boolean;
  /** Volume delivered so far in ml (accumulated across ticks). */
  volumeInfused:        number;
  /** ID of the selected drug from BRAUN_DRUG_LIBRARY. */
  selectedDrugId:       string;
  /** Patient weight in kg (used for weight-based dose calculations). */
  patientWeightKg:      number;
  /** DPS (Dynamic Pressure System) occlusion alarm threshold level (1–8). */
  pressureLevel:        number;
  /** Active alarm type, null if no alarm. */
  alarmType:            BraunAlarmType | null;
  /** Human-readable alarm message displayed on screen. */
  alarmMessage:         string;
  /** True when a bolus is being actively delivered (hold-to-deliver). */
  bolusActive:          boolean;
  /** Cumulative bolus volume delivered in ml this session. */
  bolusVolumeDelivered: number;
  /** True when pump is running at KVO rate after VTBI completion. */
  kvoActive:            boolean;
  /** Battery charge level as a percentage (0–100). */
  batteryLevel:         number;
  /** Epoch timestamp (ms) when the mute expires; 0 = not muted. */
  mutedUntil:           number;
  /** Screen to return to after OPTIONS or PRESSURE_VIEW is dismissed. */
  previousScreen:       BraunScreen;
  // ── B. Braun specific fields ──────────────────────────────────────────────
  /** True if the advisory tier warning has been shown at least once this session. */
  guardrailAdvisoryShown:        boolean;
  /** True if the nurse has acknowledged (dismissed) the advisory warning. */
  guardrailAdvisoryAcknowledged: boolean;
  /** True if the SpaceCom2 WiFi module is present and communicating. */
  spacecom2Connected:            boolean;
  /**
   * True if the device firmware is cryptographically signed.
   * Per CVE-2021-33885, the Infusomat Space firmware update protocol does NOT
   * verify signatures, allowing unauthenticated remote firmware replacement.
   * In the simulator, firmwareSigned = false triggers BB-R01 HIGH risk rule.
   * Source: CISA ICSMA-21-294-01.
   */
  firmwareSigned:                boolean;
  /**
   * True if this device is within the scope of the FDA 2023 Class I recall
   * (Z-0601-2024 — B. Braun Infusomat Space firmware vulnerability).
   * Drives BB-R05 HIGH risk rule in braunRules.ts.
   * Source: FDA recall database Z-0601-2024.
   */
  recallBatchAffected:           boolean;
  /** Whether the AIR_IN_LINE auto-trigger has already fired this session. */
  ailTriggered:                  boolean;
  /** Highlighted row index in DRUG_SELECT for cursor navigation. */
  drugCursorIndex:               number;
  /** VTBI value being edited in VTBI_ENTRY screen. */
  vtbiBuffer:                    number;
}

// ─── Session Log Entry ────────────────────────────────────────────────────────

/**
 * An immutable B. Braun session log entry.
 *
 * All fields are readonly to enforce immutability per CLAUDE.md Rule 4.
 * Optional fields are included only when relevant to the specific event type.
 * The overrideChoice field extends the Alaris GP definition to include 'acknowledge'
 * for the new advisory tier acknowledgement action.
 *
 * Source: CLAUDE.md Section 11 — Session Log Schema.
 */
export interface BraunSessionLogEntry {
  readonly timestamp:       number;         // ms since session start
  readonly screen:          BraunScreen;    // screen when event occurred
  readonly event:           BraunEventType; // what happened
  readonly rate?:           number;         // rate buffer at time of event
  readonly delta?:          number;         // chevron delta applied (+10, -1, etc.)
  readonly newRate?:        number;         // rate after this event
  readonly drug?:           string;         // drug name
  readonly vtbi?:           number;         // VTBI value if relevant
  readonly guardrailStatus?: 'ok' | 'advisory' | 'warning' | 'blocked';
  /** 'acknowledge' is the new B. Braun advisory tier action. */
  /** 'acknowledge' is the new B. Braun advisory tier action. */
  readonly overrideChoice?:  'override' | 're-enter' | 'acknowledge';
  readonly newWeight?:       number;         // patient weight after weight_set event
  readonly alarmType?:      BraunAlarmType;
  readonly bolusVolume?:    number;         // bolus volume at time of event
  readonly pressureLevel?:  number;         // pressure level if relevant
}

// ─── Action Result ────────────────────────────────────────────────────────────

/**
 * The result of any state machine action: an updated state and a list of log entries.
 *
 * This mirrors the Alaris GP ActionResult type but uses B. Braun types.
 * Pure functions always return an ActionResult — they never mutate state.
 *
 * Source: CLAUDE.md Rule 13 — state machine functions must be pure.
 */
export interface BraunActionResult {
  /** New pump state after the action. */
  state:      BraunPumpState;
  /** Ordered list of log entries generated by this action (may be empty). */
  logEntries: BraunSessionLogEntry[];
}
