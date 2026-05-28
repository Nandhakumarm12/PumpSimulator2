/**
 * All shared types and interfaces for the Alaris GP pump simulator.
 * Source: DFU Manual BD 1000DF00152 Issue 1 and BDDF00535 Issue 4.
 * NO React imports allowed in this file.
 */

export type PumpScreen =
  | "LANGUAGE_SELECT"
  | "DRUG_SELECT"
  | "WEIGHT_ENTRY"
  | "RATE_ENTRY"
  | "VTBI_ENTRY"
  | "GUARDRAIL_WARNING"
  | "GUARDRAIL_BLOCKED"
  | "RUNNING"
  | "ON_HOLD"
  | "ALARM"
  | "OPTIONS"
  | "PRESSURE_VIEW";

export type AlarmType =
  | "OCCLUSION"
  | "AIR_IN_LINE"
  | "INFUSION_COMPLETE"
  | "BATTERY_LOW"
  | "AC_FAIL"
  | "RATE_TOO_HIGH"
  | "RATE_TOO_LOW"
  | "KVO"
  | "UPSTREAM_OCCLUSION"
  | "SET_NOT_PRIMED";

export type EventType =
  | "session_start"
  | "language_selected"
  | "drug_selected"
  | "rate_adjust"
  | "boundary_hit"
  | "correction"
  | "guardrail_warning"
  | "guardrail_override"
  | "guardrail_blocked"
  | "guardrail_re_entered"
  | "vtbi_set"
  | "vtbi_cleared"
  | "infusion_started"
  | "infusion_held"
  | "infusion_resumed"
  | "infusion_complete"
  | "bolus_started"
  | "bolus_ended"
  | "alarm_triggered"
  | "alarm_silenced"
  | "mute_pressed"
  | "pressure_viewed"
  | "pressure_adjusted"
  | "options_opened"
  | "volume_cleared"
  | "weight_set"
  | "session_end";

export type GuardrailStatus = "ok" | "warning" | "blocked";

export interface SessionLogEntry {
  readonly timestamp: number;
  readonly screen: PumpScreen;
  readonly event: EventType;
  readonly rate?: number;
  readonly delta?: number;
  readonly newRate?: number;
  readonly drug?: string;
  readonly vtbi?: number;
  readonly guardrailStatus?: GuardrailStatus;
  readonly overrideChoice?: "override" | "re-enter";
  readonly alarmType?: AlarmType;
  readonly bolusVolume?: number;
  readonly pressureLevel?: number;
  readonly [key: string]: unknown;
}

export type DoseUnit =
  | "ml/h"
  | "µg/min" | "µg/h"
  | "mg/h"
  | "g/h"
  | "U/h"
  | "mmol/h"
  | "ng/kg/min"
  | "µg/kg/min" | "µg/kg/h"
  | "mg/kg/min" | "mg/kg/h"
  | "U/kg/h"
  | "mmol/kg/min" | "mmol/kg/h";

export interface Drug {
  id: string;
  name: string;
  unit: DoseUnit;
  concentration: number;
  concentrationUnit: string;
  softMin: number;
  softMax: number;
  hardMin: number;
  hardMax: number;
  defaultRate: number;
  bolusAllowed: boolean;
  weightBased: boolean;
  rateUnit: string;
  clinicalContext: string;
}

export interface GuardrailResult {
  status: GuardrailStatus;
  message?: string;
}

/** Core pump state — serialisable, no React references */
export interface PumpState {
  screen: PumpScreen;
  selectedDrug: Drug;
  /** Rate currently committed (ml/h or drug units depending on drug) */
  rate: number;
  /** Rate being edited in RATE_ENTRY screen */
  rateBuffer: number;
  vtbi: number | null;
  vtbiBuffer: number;
  volumeInfused: number;
  patientWeight: number;
  pressureLevel: number;
  alarmMessage: string;
  alarmType: AlarmType | null;
  guardrailOverride: boolean;
  bolusActive: boolean;
  bolusVolume: number;
  /** Screen to return to after OPTIONS or PRESSURE_VIEW */
  previousScreen: PumpScreen;
  /** True when pump is running at KVO rate after VTBI complete */
  kvoActive: boolean;
  /** Epoch ms when the MUTE expires; null = not muted. DFU: 120s silence window. */
  mutedUntil: number | null;
  /** Highlighted row index in DRUG_SELECT for ↑/↓ softkey navigation */
  drugCursorIndex: number;
  /** Weight being edited in WEIGHT_ENTRY screen (kg) */
  weightBuffer: number;
  /**
   * Simulated battery level (0–100%).
   * Decrements each infusion tick. BATTERY_LOW alarm fires at < BATTERY_LOW_PCT.
   * Not from DFU (hardware-specific) — approximated for research realism.
   */
  batteryLevel: number;
  /**
   * True once the AIR_IN_LINE auto-trigger has fired for this session.
   * Prevents repeated re-triggering after the 500ml threshold is crossed.
   */
  ailTriggered: boolean;
}
