/**
 * Feature extraction — converts a completed session log + final pump state
 * into a flat TrainingRecord for the AI model.
 *
 * Source: CLAUDE.md Section 8 — AI Feature Schema.
 * Interaction feature definitions: Cauchi et al. (2011) EICS4Med Workshop.
 * NO React imports allowed in this file.
 */

import type { SessionLogEntry, PumpState } from '../pump/types';
import { FACTORY_DEFAULTS } from '../pump/constants';
import { rateToMlH } from '../pump/display';
import type { DeviceContext } from './scenarioGenerator';

// ─── TrainingRecord ───────────────────────────────────────────────────────────

/**
 * Complete training record — one per simulator session.
 * Serialisable to JSON and CSV without transformation.
 * Source: CLAUDE.md Section 8.
 */
export interface TrainingRecord {
  // ── Metadata ──────────────────────────────────────────────────────
  record_id:               string;
  session_id:              string;
  timestamp_iso:           string;
  pump_model:              string;
  firmware_version:        string;

  // ── INTERACTION FEATURES (extracted from session log) ─────────────
  /** Ms from first rate_adjust keypress to infusion_started. */
  entry_time_ms:           number;
  /** All rate_adjust events during rate entry. */
  total_keypresses:        number;
  large_up_count:          number;    // »» presses (delta === +10)
  small_up_count:          number;    // »  presses (delta === +1)
  small_down_count:        number;    // «  presses (delta === -1)
  large_down_count:        number;    // «« presses (delta === -10)
  correction_count:        number;    // direction reversals
  boundary_hit_count:      number;    // times RATE_MIN or RATE_MAX was hit
  /** (large_up + large_down) / total_keypresses; 0 if no presses. */
  large_btn_ratio:         number;
  /**
   * actual_keypresses / minimum_possible_keypresses.
   * 1.0 = perfectly efficient path. Higher = more erratic entry.
   * Source: Cauchi et al. (2011) — golden_path_ratio definition.
   */
  golden_path_ratio:       number;
  /** Programmed infusion rate in ml/h (converted from drug units). */
  final_rate_ml_h:         number;
  /** Researcher-set target rate in ml/h (from task mode or scenario). */
  intended_rate_ml_h:      number;
  /** abs(final_rate_ml_h - intended_rate_ml_h). */
  error_magnitude_ml_h:    number;
  /**
   * error_magnitude / intended_rate_ml_h (0 = perfect).
   * Capped at 2.0 to bound the feature. Source: Thimbleby & Cairns (2010).
   */
  relative_error:          number;
  /** 1 if infusion was started with a rate that differs >10% from intended. */
  confirmed_incorrect:     0 | 1;
  drug_unit_used:          string;

  // ── CONFIGURATION FEATURES (pump setup state) ──────────────────────
  drug_id:                 string;
  drug_name:               string;
  /** 1 if drug selected from library, 0 if MANUAL mode. */
  drug_library_used:       0 | 1;
  guardrail_soft_min:      number;
  guardrail_soft_max:      number;
  guardrail_hard_min:      number;
  guardrail_hard_max:      number;
  /** 1 if a soft limit warning appeared during this session. */
  guardrail_warning_shown: 0 | 1;
  /** 1 if operator clicked OVERRIDE on a guardrail warning. */
  guardrail_override:      0 | 1;
  /** 1 if hard limit was triggered at any point. */
  guardrail_blocked:       0 | 1;
  /** 1 if final rate is within soft limits. */
  rate_within_soft_limits: 0 | 1;
  /** 1 if VTBI was programmed before RUN. */
  vtbi_set:                0 | 1;
  vtbi_value_ml:           number;
  kvo_rate_ml_h:           number;
  /** 1 if bolus was delivered during this session. */
  bolus_delivered:         0 | 1;
  bolus_volume_ml:         number;
  secondary_infusion:      0 | 1;
  patient_weight_kg:       number;
  pressure_alarm_level:    number;

  // ── DEVICE / SYSTEM FEATURES (from scenario generator) ─────────────
  days_since_maintenance:  number;
  battery_level_pct:       number;
  /** 1 if firmware is in the known CVE list. */
  firmware_version_risk:   0 | 1;
  network_connected:       0 | 1;
  drug_library_age_days:   number;
  /** 0.0–1.0 how far pump config has drifted from hospital standard. */
  config_drift_score:      number;
  recent_occlusion_alarms: number;
  alarms_during_session:   number;

  // ── RISK LABEL ──────────────────────────────────────────────────────
  risk_label:              "low" | "medium" | "high";
  risk_score:              number;
  risk_reasons:            string[];

  // ── LAYERED RISK SCORES (4-layer system) ────────────────────────────
  /** Layer 0: inherent device design risk (0–1). Fixed per device model. */
  design_score:            number;
  /** Layer 1: nurse interaction / programming behaviour risk (0–1). */
  interaction_score:       number;
  /** Layer 2: device configuration risk for this session (0–1). */
  configuration_score:     number;
  /** Layer 3: physical and cyber device state risk (0–1). */
  system_score:            number;
  /** Weighted composite of all four layers (0–1). */
  composite_score:         number;
  /** Energy-label style grade derived from composite_score. */
  grade:                   "A+" | "A" | "B" | "C" | "D" | "E" | "F";
  /** Design factors that contributed to design_score. */
  design_reasons:          string[];
  /** Interaction rules that fired (Layer 1). */
  interaction_reasons:     string[];
  /** Configuration rules that fired (Layer 2). */
  configuration_reasons:   string[];
  /** System rules that fired (Layer 3). */
  system_reasons:          string[];
}

// ─── Feature extraction ───────────────────────────────────────────────────────

/**
 * Compute the minimum keypresses needed to move from defaultRate to targetRate
 * using only large (10) and small (1) steps — no overshooting.
 * Used to compute golden_path_ratio per Cauchi et al. (2011).
 */
function minimumKeyprессes(defaultRate: number, targetRate: number): number {
  const distance = Math.abs(+(targetRate - defaultRate).toFixed(1));
  if (distance < 0.001) return 0;
  const largeSteps = Math.floor(distance / FACTORY_DEFAULTS.STEP_LARGE);
  const smallSteps = Math.round((distance - largeSteps * FACTORY_DEFAULTS.STEP_LARGE) / FACTORY_DEFAULTS.STEP_SMALL);
  return largeSteps + smallSteps;
}

/**
 * Extract a flat TrainingRecord from a completed session.
 *
 * @param sessionLog    - Immutable session log from useLogger / datasetBuilder
 * @param finalState    - Pump state at the moment infusion was started (or session end)
 * @param deviceContext - Device/system features from scenarioGenerator
 * @param intendedRateMlH - Target rate in ml/h (from task mode or scenario)
 * @param alarmsDuring  - Number of non-INFUSION_COMPLETE alarms during the session
 */
export function extractFeatures(
  sessionLog: readonly SessionLogEntry[],
  finalState: PumpState,
  deviceContext: DeviceContext,
  intendedRateMlH: number,
  alarmsDuring = 0
): Omit<TrainingRecord, "risk_label" | "risk_score" | "risk_reasons" | "design_score" | "interaction_score" | "configuration_score" | "system_score" | "composite_score" | "grade" | "design_reasons" | "interaction_reasons" | "configuration_reasons" | "system_reasons"> {
  const drug = finalState.selectedDrug;

  // ── Interaction feature extraction ──────────────────────────────────
  const rateAdjusts = sessionLog.filter(e => e.event === "rate_adjust");
  const corrections  = sessionLog.filter(e => e.event === "correction");
  const boundaries   = sessionLog.filter(e => e.event === "boundary_hit");

  const largeUpCount   = rateAdjusts.filter(e => e.delta === +FACTORY_DEFAULTS.STEP_LARGE).length;
  const smallUpCount   = rateAdjusts.filter(e => e.delta === +FACTORY_DEFAULTS.STEP_SMALL).length;
  const smallDownCount = rateAdjusts.filter(e => e.delta === -FACTORY_DEFAULTS.STEP_SMALL).length;
  const largeDownCount = rateAdjusts.filter(e => e.delta === -FACTORY_DEFAULTS.STEP_LARGE).length;
  const totalKeypresses = rateAdjusts.length;

  const largeBtnRatio = totalKeypresses > 0
    ? +((largeUpCount + largeDownCount) / totalKeypresses).toFixed(3)
    : 0;

  // Entry time: from first keypress (rate_adjust) to infusion_started
  const firstAdjust  = rateAdjusts[0];
  const startEvent   = sessionLog.find(e => e.event === "infusion_started");
  const entryTimeMs  = firstAdjust && startEvent
    ? Math.max(0, startEvent.timestamp - firstAdjust.timestamp)
    : 0;

  // Golden path ratio: actual / minimum (Cauchi et al. 2011)
  const minPresses = minimumKeyprессes(drug.defaultRate, finalState.rateBuffer);
  const goldenPathRatio = minPresses > 0
    ? +Math.min(10, totalKeypresses / minPresses).toFixed(3)
    : (totalKeypresses > 0 ? 1.0 : 1.0);

  // ── Rate error computation ───────────────────────────────────────────
  const finalRateMlH = +rateToMlH(
    finalState.rate,
    drug,
    finalState.patientWeight
  ).toFixed(3);

  const errorMagnitudeMlH = +Math.abs(finalRateMlH - intendedRateMlH).toFixed(3);
  const relativeError = intendedRateMlH > 0
    ? +Math.min(2, errorMagnitudeMlH / intendedRateMlH).toFixed(4)
    : 0;

  // confirmed_incorrect = 1 only when error is substantial (>25%) and infusion was started.
  // Threshold of 0.25 keeps R08 distinct from R10 (>10% error, MEDIUM risk):
  // 10-25% error → R10 MEDIUM only; >25% error → R08 HIGH and R10 MEDIUM.
  const confirmedIncorrect: 0 | 1 = (relativeError > 0.25 && startEvent !== undefined) ? 1 : 0;

  // ── Guardrail feature extraction ────────────────────────────────────
  const guardrailWarnShown: 0 | 1 = sessionLog.some(e => e.event === "guardrail_warning") ? 1 : 0;
  const guardrailOverride: 0 | 1  = sessionLog.some(e => e.event === "guardrail_override") ? 1 : 0;
  const guardrailBlocked: 0 | 1   = sessionLog.some(e => e.event === "guardrail_blocked") ? 1 : 0;

  const rateWithinSoftLimits: 0 | 1 = (
    drug.id === "manual" ||
    (finalState.rate >= drug.softMin && finalState.rate <= drug.softMax)
  ) ? 1 : 0;

  // ── VTBI / bolus features ────────────────────────────────────────────
  const vtbiSet: 0 | 1    = finalState.vtbi !== null ? 1 : 0;
  const vtbiValueMl        = finalState.vtbi ?? 0;

  const bolusEndEvent = sessionLog.filter(e => e.event === "bolus_ended").pop();
  const bolusDelivered: 0 | 1 = bolusEndEvent !== undefined ? 1 : 0;
  const bolusVolumeMl = bolusEndEvent?.bolusVolume ?? 0;

  return {
    // Metadata (from deviceContext)
    record_id:               deviceContext.record_id,
    session_id:              deviceContext.session_id,
    timestamp_iso:           deviceContext.timestamp_iso,
    pump_model:              deviceContext.pump_model,
    firmware_version:        deviceContext.firmware_version,

    // Interaction
    entry_time_ms:           entryTimeMs,
    total_keypresses:        totalKeypresses,
    large_up_count:          largeUpCount,
    small_up_count:          smallUpCount,
    small_down_count:        smallDownCount,
    large_down_count:        largeDownCount,
    correction_count:        corrections.length,
    boundary_hit_count:      boundaries.length,
    large_btn_ratio:         largeBtnRatio,
    golden_path_ratio:       goldenPathRatio,
    final_rate_ml_h:         finalRateMlH,
    intended_rate_ml_h:      intendedRateMlH,
    error_magnitude_ml_h:    errorMagnitudeMlH,
    relative_error:          relativeError,
    confirmed_incorrect:     confirmedIncorrect,
    drug_unit_used:          drug.unit,

    // Configuration
    drug_id:                 drug.id,
    drug_name:               drug.name,
    drug_library_used:       drug.id !== "manual" ? 1 : 0,
    guardrail_soft_min:      drug.softMin,
    guardrail_soft_max:      drug.softMax,
    guardrail_hard_min:      drug.hardMin,
    guardrail_hard_max:      drug.hardMax,
    guardrail_warning_shown: guardrailWarnShown,
    guardrail_override:      guardrailOverride,
    guardrail_blocked:       guardrailBlocked,
    rate_within_soft_limits: rateWithinSoftLimits,
    vtbi_set:                vtbiSet,
    vtbi_value_ml:           vtbiValueMl,
    kvo_rate_ml_h:           FACTORY_DEFAULTS.KVO_RATE,
    bolus_delivered:         bolusDelivered,
    bolus_volume_ml:         typeof bolusVolumeMl === "number" ? bolusVolumeMl : 0,
    secondary_infusion:      0,
    patient_weight_kg:       finalState.patientWeight,
    pressure_alarm_level:    finalState.pressureLevel,

    // Device / system (from deviceContext)
    days_since_maintenance:  deviceContext.days_since_maintenance,
    battery_level_pct:       deviceContext.battery_level_pct,
    firmware_version_risk:   deviceContext.firmware_version_risk,
    network_connected:       deviceContext.network_connected,
    drug_library_age_days:   deviceContext.drug_library_age_days,
    config_drift_score:      deviceContext.config_drift_score,
    recent_occlusion_alarms: deviceContext.recent_occlusion_alarms,
    alarms_during_session:   alarmsDuring,
  };
}

/** All TrainingRecord CSV column names in canonical order. */
export const CSV_COLUMNS: Array<keyof TrainingRecord> = [
  "record_id", "session_id", "timestamp_iso", "pump_model", "firmware_version",
  "entry_time_ms", "total_keypresses", "large_up_count", "small_up_count",
  "small_down_count", "large_down_count", "correction_count", "boundary_hit_count",
  "large_btn_ratio", "golden_path_ratio", "final_rate_ml_h", "intended_rate_ml_h",
  "error_magnitude_ml_h", "relative_error", "confirmed_incorrect", "drug_unit_used",
  "drug_id", "drug_name", "drug_library_used",
  "guardrail_soft_min", "guardrail_soft_max", "guardrail_hard_min", "guardrail_hard_max",
  "guardrail_warning_shown", "guardrail_override", "guardrail_blocked",
  "rate_within_soft_limits", "vtbi_set", "vtbi_value_ml", "kvo_rate_ml_h",
  "bolus_delivered", "bolus_volume_ml", "secondary_infusion",
  "patient_weight_kg", "pressure_alarm_level",
  "days_since_maintenance", "battery_level_pct", "firmware_version_risk",
  "network_connected", "drug_library_age_days", "config_drift_score",
  "recent_occlusion_alarms", "alarms_during_session",
  "risk_label", "risk_score", "risk_reasons",
  "design_score", "interaction_score", "configuration_score", "system_score",
  "composite_score", "grade",
  "design_reasons", "interaction_reasons", "configuration_reasons", "system_reasons",
];

/**
 * Serialise an array of TrainingRecords to a CSV string.
 * risk_reasons is encoded as pipe-separated values (e.g. "R01|R05").
 */
export function toCSV(records: TrainingRecord[]): string {
  const header = CSV_COLUMNS.join(",");
  const rows = records.map(r =>
    CSV_COLUMNS.map(col => {
      const v = r[col];
      if (Array.isArray(v)) return `"${(v as string[]).join("|")}"`;
      if (typeof v === "string" && (v.includes(",") || v.includes('"')))
        return `"${v.replace(/"/g, '""')}"`;
      return String(v ?? "");
    }).join(",")
  );
  return [header, ...rows].join("\n");
}
