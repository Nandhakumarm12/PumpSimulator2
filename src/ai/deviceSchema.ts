/**
 * Generalised medical device feature schema.
 *
 * Shows how the Alaris GP TrainingRecord schema extends to other regulated
 * medical devices. The core insight: all connected medical devices share the
 * same three-layer risk structure:
 *
 *   Layer 1 — Interaction Features  (HOW the clinician programs the device)
 *   Layer 2 — Configuration Features (WHAT the device is configured to do)
 *   Layer 3 — Device/System Features (WHAT STATE the device is in)
 *
 * Layers 1 and 3 are DEVICE-INDEPENDENT and reusable across device types.
 * Layer 2 is DEVICE-SPECIFIC and must be adapted per device class.
 *
 * Source: CLAUDE.md research goals — "AI-Empowered Safety and Security
 * Ranking System for Infusion Pump Medical Devices" (QR Seed Pilot Study).
 * This schema is the extensibility design for the multi-device phase.
 * NO React imports allowed in this file.
 */

// ─── Layer 1: Interaction features (device-independent) ───────────────────────

/**
 * Captures how a clinician interacted with the device during programming.
 * These features are applicable to ANY programmable medical device that uses
 * a keypad or touchscreen for value entry.
 *
 * Source: Cauchi et al. (2011) EICS4Med — golden_path_ratio, correction_count.
 * Source: Thimbleby & Cairns (2010) — error_magnitude, relative_error.
 */
export interface InteractionFeatures {
  /** Ms from first input action to final confirmation. */
  entry_time_ms:         number;
  /** Total button/key presses during the programming session. */
  total_keypresses:      number;
  /** Number of direction reversals (changed mind mid-entry). */
  correction_count:      number;
  /** Number of times a boundary limit was hit. */
  boundary_hit_count:    number;
  /** actual_keypresses / minimum_possible — 1.0 is optimal. */
  golden_path_ratio:     number;
  /** Final programmed value converted to base SI unit for comparison. */
  final_value_si:        number;
  /** Target value in same SI unit (from task mode or clinical order). */
  intended_value_si:     number;
  /** abs(final - intended) in SI unit. */
  error_magnitude_si:    number;
  /** error_magnitude / intended — 0 = perfect. */
  relative_error:        number;
  /** 1 if operator confirmed a value that was >25% off from intended. */
  confirmed_incorrect:   0 | 1;
}

// ─── Layer 3: Device/system features (device-independent) ─────────────────────

/**
 * Represents the physical and cyber state of the device.
 * Applicable to any connected, battery-powered, software-controlled medical device.
 * Source: FDA Infusion Pump Safety guidance + general IEC 62443 cyber criteria.
 */
export interface DeviceSystemFeatures {
  /** Days since last preventive maintenance was performed. */
  days_since_maintenance:  number;
  /** Current battery level as percentage (0–100). */
  battery_level_pct:       number;
  /** 1 if current firmware version has a known published CVE. */
  firmware_version_risk:   0 | 1;
  /** 1 if device is connected to a network/gateway for remote monitoring. */
  network_connected:       0 | 1;
  /** Days since the device's clinical knowledge base was last updated. */
  knowledge_base_age_days: number;
  /** 0.0–1.0: how far device config has drifted from hospital standard. */
  config_drift_score:      number;
  /** Count of critical alarms in the simulated/observed last 24 hours. */
  recent_critical_alarms:  number;
  /** Count of alarms triggered during this session. */
  alarms_during_session:   number;
}

// ─── Layer 2: Configuration features (device-specific) ────────────────────────

/**
 * Alaris GP Infusion Pump — Layer 2 configuration features.
 * (Already implemented in TrainingRecord in featureExtractor.ts)
 */
export interface InfusionPumpConfig {
  drug_id:                 string;
  drug_name:               string;
  drug_library_used:       0 | 1;
  guardrail_soft_min:      number;
  guardrail_soft_max:      number;
  guardrail_hard_min:      number;
  guardrail_hard_max:      number;
  guardrail_warning_shown: 0 | 1;
  guardrail_override:      0 | 1;
  guardrail_blocked:       0 | 1;
  rate_within_soft_limits: 0 | 1;
  vtbi_set:                0 | 1;
  vtbi_value_ml:           number;
  kvo_rate_ml_h:           number;
  bolus_delivered:         0 | 1;
  bolus_volume_ml:         number;
  patient_weight_kg:       number;
  pressure_alarm_level:    number;
}

/**
 * Mechanical Ventilator (e.g. Puritan Bennett PB980, Dräger Evita) — Layer 2.
 * Key risk: tidal volume too high → ventilator-induced lung injury (VILI).
 */
export interface VentilatorConfig {
  /** Programmed tidal volume (ml). */
  tidal_volume_ml:         number;
  /** Target: ideal body weight-based tidal volume (6–8 ml/kg IBW). */
  intended_tidal_volume_ml: number;
  /** Positive end-expiratory pressure (cmH2O). */
  peep_cmh2o:              number;
  /** Fraction of inspired oxygen (0.21–1.0). */
  fio2:                    number;
  /** Respiratory rate (breaths/min). */
  rr_per_min:              number;
  /** 1 if peak pressure alarm is set. */
  peak_pressure_alarm_set: 0 | 1;
  /** 1 if apnea alarm is active. */
  apnea_alarm_active:      0 | 1;
  /** Ventilation mode (e.g. "VC-AC", "PC-SIMV", "CPAP"). */
  ventilation_mode:        string;
  /** 1 if low VTE (exhaled tidal volume) alarm is enabled. */
  low_vte_alarm_enabled:   0 | 1;
}

/**
 * Patient-Controlled Analgesia (PCA) pump (e.g. Smiths CADD-Solis) — Layer 2.
 * Key risk: excessive opioid delivery → respiratory depression.
 */
export interface PCAConfig {
  /** Bolus dose programmed (mg or mcg). */
  bolus_dose:              number;
  /** Lockout interval (minutes) — minimum time between patient doses. */
  lockout_interval_min:    number;
  /** 4-hour dose limit (mg). */
  four_hour_limit:         number;
  /** Basal/background infusion rate (ml/h). */
  basal_rate_ml_h:         number;
  /** 1 if 4-hour limit is set (safety feature). */
  four_hour_limit_set:     0 | 1;
  /** Number of patient-initiated demands in the session. */
  patient_demands:         number;
  /** Number of delivered doses (demands within lockout do not deliver). */
  doses_delivered:         number;
  /** Drug concentration (mg/ml). */
  concentration_mg_ml:     number;
}

/**
 * Syringe Driver (e.g. BD Alaris Syringe, Graseby 3100) — Layer 2.
 * Key risk: air embolism, dose error from wrong syringe size.
 */
export interface SyringeDriverConfig {
  /** Syringe size selected (ml). */
  syringe_size_ml:         number;
  /** Rate programmed (ml/h). */
  rate_ml_h:               number;
  /** Drug concentration (mg/ml or U/ml). */
  concentration:           number;
  /** 1 if occlusion alarm is enabled. */
  occlusion_alarm_enabled: 0 | 1;
  /** 1 if near-end-of-syringe alarm is set. */
  near_end_alarm_set:      0 | 1;
}

// ─── Generalised training record ──────────────────────────────────────────────

/**
 * B. Braun Infusomat Space LVP — Layer 2 configuration features.
 *
 * Key risk differentiators vs standard InfusionPumpConfig:
 *   - Three-tier guardrail (advisory + soft + hard) — unique to B. Braun.
 *   - SpaceCom2 module as separate network component (not just a flag).
 *   - Bolus capped at 2 ml (vs 5 ml Alaris GP).
 *   - Firmware signing status tracks CVE-2021-33885 risk.
 *   - recall_batch_affected tracks FDA 2023 Class I recall scope.
 *
 * Source: B. Braun Infusomat Space IFU (bbraunusa.com, 2024)
 * Source: CISA ICSMA-21-294-01 (CVE-2021-33885, CVE-2021-33882)
 * Source: FDA recall database — recall number Z-0601-2024 (November 2023)
 */
export interface BraunInfusomatConfig extends InfusionPumpConfig {
  /**
   * 1 if the advisory tier (tier 1) guardrail warning was shown during this session.
   * The advisory tier is unique to B. Braun — no equivalent in the Alaris GP.
   * Source: B. Braun IFU — "Clinical Advisories" tier description.
   */
  guardrail_advisory_shown:        0 | 1;

  /**
   * 1 if the nurse acknowledged (dismissed) the advisory tier warning.
   * Only meaningful when guardrail_advisory_shown = 1.
   * Source: B. Braun IFU — advisory acknowledgement action.
   */
  guardrail_advisory_acknowledged: 0 | 1;

  /**
   * 1 if the SpaceCom2 WiFi/data module was present and connected during the session.
   * When spacecom2_connected = 1 AND firmware_signed = 0, BB-R02 HIGH rule fires:
   * CVE-2021-33882 — missing authentication for critical network commands.
   * Source: B. Braun SpaceCom2 module documentation; CISA ICSMA-21-294-01.
   */
  spacecom2_connected:             0 | 1;

  /**
   * 1 if the device firmware is cryptographically signed; 0 if unsigned.
   * Always 0 for the B. Braun Infusomat Space — the firmware update protocol lacks
   * cryptographic signature verification across all known firmware versions.
   * BB-R01 HIGH rule fires when firmware_signed = 0.
   * Source: CVE-2021-33885 (CVSS 9.0) — CISA ICSMA-21-294-01.
   */
  firmware_signed:                 0 | 1;

  /**
   * 1 if the device is within the scope of the FDA 2023 Class I recall
   * (faulty occlusion detection software — approximately 10,600 devices affected,
   * one confirmed patient death from interrupted vasopressor infusion).
   * BB-R05 HIGH rule fires when recall_batch_affected = 1.
   * Source: FDA recall database — recall number Z-0601-2024 (November 2023).
   */
  recall_batch_affected:           0 | 1;

  /**
   * Device bolus maximum in ml.
   * 2.0 ml for the B. Braun Infusomat Space (vs 5.0 ml for the Alaris GP).
   * Used by BB-R04 MEDIUM rule to detect near-maximum bolus delivery.
   * Source: B. Braun Infusomat Space IFU — "Bolus Volume Max 2 ml".
   */
  bolus_max_ml:                    number;
}

/** All supported device types in the generalised schema. */
export type DeviceType =
  | "infusion_pump"
  | "braun_infusomat"
  | "ventilator"
  | "pca_pump"
  | "syringe_driver"
  | "dialysis_machine"
  | "defibrillator";

/**
 * Generalised training record for any medical device.
 * device_type discriminates which config block is populated.
 *
 * For ML training: flatten all config fields into the feature vector,
 * filling with 0/null for fields not applicable to the current device_type.
 * A `device_type_*` one-hot encoding column is included automatically.
 */
export interface GeneralisedTrainingRecord {
  // Metadata
  record_id:          string;
  session_id:         string;
  timestamp_iso:      string;
  device_type:        DeviceType;
  device_model:       string;    // e.g. "alaris_gp", "pb980", "cadd_solis"
  firmware_version:   string;

  // Layer 1 — Interaction (all devices)
  interaction:        InteractionFeatures;

  // Layer 3 — Device/System (all devices)
  system:             DeviceSystemFeatures;

  // Layer 2 — Configuration (device-specific, use the matching type)
  config:
    | InfusionPumpConfig
    | BraunInfusomatConfig
    | VentilatorConfig
    | PCAConfig
    | SyringeDriverConfig
    | Record<string, number | string | boolean>;

  // Risk output
  risk_label:         "low" | "medium" | "high";
  risk_score:         number;
  risk_reasons:       string[];
}

// ─── Risk rule registry ────────────────────────────────────────────────────────

/**
 * Structure for a device-specific risk rule.
 * Rules R01–R21 are Alaris GP-specific (see labellingRules.ts).
 * Other devices define their own rule sets in the same structure.
 */
export interface RiskRule<T extends object> {
  /** Unique rule ID across all devices (e.g. "VENT-R01", "PCA-R01"). */
  id:       string;
  /** Human-readable description for explainability. */
  label:    string;
  /** Severity level. */
  severity: "high" | "medium";
  /** Clinical/source reference (for paper traceability). */
  source:   string;
  /** Test function — returns true if this rule fires. */
  test:     (record: T) => boolean;
}

/**
 * Example ventilator-specific risk rules.
 * These would be implemented in a future ventilatorRules.ts file.
 * Documented here to show the extensibility pattern.
 */
export const EXAMPLE_VENTILATOR_RULES: Array<RiskRule<VentilatorConfig & DeviceSystemFeatures>> = [
  {
    id:       "VENT-R01",
    label:    "Tidal volume >10 ml/kg IBW — VILI risk",
    severity: "high",
    source:   "ARDSNet protocol — NEJM 2000;342:1301",
    test:     r => (r.tidal_volume_ml / 70) > 10, // simplified: assumes 70kg IBW
  },
  {
    id:       "VENT-R02",
    label:    "FiO2 1.0 for >24h — oxygen toxicity risk",
    severity: "high",
    source:   "O'Driscoll et al. BMJ 2017;356:j280",
    test:     r => r.fio2 >= 1.0,
  },
  {
    id:       "VENT-R03",
    label:    "No peak pressure alarm set",
    severity: "medium",
    source:   "AARC Clinical Practice Guideline 2013",
    test:     r => r.peak_pressure_alarm_set === 0,
  },
  {
    id:       "VENT-R04",
    label:    "No apnea alarm active",
    severity: "high",
    source:   "FDA Ventilator Safety Alert 2018",
    test:     r => r.apnea_alarm_active === 0,
  },
];

/**
 * Example PCA-specific risk rules.
 */
export const EXAMPLE_PCA_RULES: Array<RiskRule<PCAConfig & DeviceSystemFeatures>> = [
  {
    id:       "PCA-R01",
    label:    "No 4-hour dose limit set — opioid accumulation risk",
    severity: "high",
    source:   "ISMP PCA Safety Guidelines 2016",
    test:     r => r.four_hour_limit_set === 0,
  },
  {
    id:       "PCA-R02",
    label:    "Lockout interval < 6 minutes",
    severity: "medium",
    source:   "Joint Commission Sentinel Event Alert #49 (2012)",
    test:     r => r.lockout_interval_min < 6,
  },
  {
    id:       "PCA-R03",
    label:    "Demand:delivery ratio > 3 — possible inadequate analgesia or confusion",
    severity: "medium",
    source:   "Pasero & McCaffery (2011) Pain Assessment and Pharmacologic Management",
    test:     r => r.patient_demands > 0 && (r.patient_demands / Math.max(1, r.doses_delivered)) > 3,
  },
];
