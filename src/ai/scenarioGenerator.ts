/**
 * Scenario profiles for synthetic dataset generation.
 * Defines 4 device-state profiles used to generate varied training records.
 * Source: CLAUDE.md Section 10 — Scenario Generator.
 * NO React imports allowed in this file.
 */

/** Range tuple [min, max] for random value generation. */
type Range = [number, number];

/** Device-state context injected into each synthetic session. */
export interface DeviceContext {
  record_id:               string;
  session_id:              string;
  timestamp_iso:           string;
  pump_model:              string;
  firmware_version:        string;
  firmware_version_risk:   0 | 1;
  days_since_maintenance:  number;
  battery_level_pct:       number;
  network_connected:       0 | 1;
  drug_library_age_days:   number;
  config_drift_score:      number;
  recent_occlusion_alarms: number;
}

/**
 * Describes the ranges used to generate a single scenario profile.
 * All numeric fields are [min, max] ranges; boolean fields may be fixed or "random".
 */
export interface ScenarioProfile {
  id:          string;
  name:        string;
  description: string;
  /**
   * Relative sampling weight for dataset generation.
   * Tuned so the generated distribution is roughly 30% low / 40% medium / 30% high
   * as required by CLAUDE.md Section 12 Step 5.
   */
  weight:      number;
  device: {
    firmware_version:        string | "random_cve";
    days_since_maintenance:  Range;
    battery_level_pct:       Range;
    network_connected:       boolean | "random";
    drug_library_age_days:   Range;
    config_drift_score:      Range;
    recent_occlusion_alarms: Range;
  };
  /** Behavioural parameters that shape how the operator interacts in this scenario. */
  behaviour: {
    /** Fraction of sessions where VTBI is NOT set (R13 trigger). */
    vtbi_omission_rate:    number;
    /** Max proportional rate error added (0 = perfect, 0.3 = up to 30% off). */
    max_rate_error:        number;
    /** Probability that a guardrail warning is overridden (if it appears). */
    override_probability:  number;
    /** Average ms between keypresses (higher = slower operator). */
    keypress_interval_ms:  number;
    /** Probability of a direction reversal during rate entry. */
    correction_probability: number;
    /** Force MANUAL drug mode (bypasses library). */
    force_manual:          boolean;
  };
}

/**
 * Four scenario profiles from CLAUDE.md Section 10.
 * Each represents a realistic clinical device/operator context.
 */
export const SCENARIO_PROFILES: ScenarioProfile[] = [
  {
    id: "ideal",
    name: "Well-maintained, connected",
    description: "Pump in perfect condition, connected to Gateway, library current",
    // weight=5: generates mostly LOW/MEDIUM; higher share moves distribution toward target
    weight: 5,
    device: {
      firmware_version:        "9.12",
      days_since_maintenance:  [0, 30],
      battery_level_pct:       [80, 100],
      network_connected:       true,
      drug_library_age_days:   [0, 14],
      config_drift_score:      [0, 0.05],
      recent_occlusion_alarms: [0, 0],
    },
    behaviour: {
      vtbi_omission_rate:    0.15,
      max_rate_error:        0.03,
      override_probability:  0.10,
      keypress_interval_ms:  300,
      correction_probability: 0.05,
      force_manual:          false,
    },
  },
  {
    id: "neglected",
    name: "Overdue maintenance, isolated",
    description: "Common ward scenario — pump not maintained, library out of date",
    // weight=2: generates mostly MEDIUM (many R10–R21 triggers without firmware CVE)
    // NOTE: firmware "7.2.0" intentionally non-CVE to keep this profile distinct
    // from cyber_risk; a neglected pump may run old firmware without a known CVE.
    weight: 2,
    device: {
      firmware_version:        "7.2.0",
      days_since_maintenance:  [90, 400],
      battery_level_pct:       [15, 50],
      network_connected:       false,
      drug_library_age_days:   [91, 365],
      config_drift_score:      [0.3, 0.8],
      recent_occlusion_alarms: [1, 5],
    },
    behaviour: {
      vtbi_omission_rate:    0.60,
      max_rate_error:        0.20,
      override_probability:  0.45,
      keypress_interval_ms:  600,
      correction_probability: 0.25,
      force_manual:          false,
    },
  },
  {
    id: "cyber_risk",
    name: "Known vulnerable firmware",
    description: "Firmware version with known CVE — security risk scenario",
    // weight=1: all sessions trigger R05 HIGH; limited share to avoid over-representing HIGH
    weight: 1,
    device: {
      firmware_version:        "random_cve",
      days_since_maintenance:  [30, 180],
      battery_level_pct:       [50, 90],
      network_connected:       true,
      drug_library_age_days:   [0, 30],
      config_drift_score:      [0, 0.3],
      recent_occlusion_alarms: [0, 2],
    },
    behaviour: {
      vtbi_omission_rate:    0.20,
      max_rate_error:        0.05,
      override_probability:  0.15,
      keypress_interval_ms:  350,
      correction_probability: 0.08,
      force_manual:          false,
    },
  },
  {
    id: "emergency",
    name: "Emergency use, no library",
    description: "Pump used in emergency without drug library — MANUAL mode only",
    // weight=2: generates HIGH/MEDIUM mix from R04, R02, R12, R13
    weight: 2,
    device: {
      firmware_version:        "9.12",
      days_since_maintenance:  [0, 300],
      battery_level_pct:       [30, 80],
      network_connected:       "random",
      drug_library_age_days:   [0, 60],
      config_drift_score:      [0.1, 0.5],
      recent_occlusion_alarms: [0, 3],
    },
    behaviour: {
      vtbi_omission_rate:    0.80,
      max_rate_error:        0.30,
      override_probability:  0.60,
      keypress_interval_ms:  200,
      correction_probability: 0.20,
      force_manual:          true,
    },
  },
];

/**
 * Firmware versions with known CVEs (plausible based on BD Alaris security advisories).
 * Source: BUILT.md — approximated, not verified against official CVE database.
 */
export const CVE_FIRMWARE_VERSIONS: string[] = ["6.0.2", "7.1.0", "8.05", "8.1.3"];

/** Seeded linear congruential generator — deterministic for reproducible datasets. */
export function makeLcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(1664525, s) + 1013904223;
    return (s >>> 0) / 0xffffffff;
  };
}

/** Return a random float in [min, max] using the provided rng. */
export function randFloat(min: number, max: number, rng: () => number): number {
  return min + (max - min) * rng();
}

/** Return a random integer in [min, max] inclusive using the provided rng. */
export function randInt(min: number, max: number, rng: () => number): number {
  return Math.floor(min + (max - min + 1) * rng());
}

/** Generate a simple deterministic UUID-like string. */
export function makeSessionId(counter: number, ts: number): string {
  return `alaris-${ts.toString(16)}-${counter.toString(16).padStart(4, "0")}`;
}

/**
 * Generate a DeviceContext from a ScenarioProfile using the provided rng.
 * This provides the Layer 3 (device/system) features for a TrainingRecord.
 */
export function generateDeviceContext(
  profile: ScenarioProfile,
  recordId: string,
  rng: () => number
): DeviceContext {
  const now = new Date();

  let firmware: string;
  let firmwareRisk: 0 | 1;
  if (profile.device.firmware_version === "random_cve") {
    firmware = CVE_FIRMWARE_VERSIONS[randInt(0, CVE_FIRMWARE_VERSIONS.length - 1, rng)];
    firmwareRisk = 1;
  } else {
    firmware = profile.device.firmware_version;
    firmwareRisk = CVE_FIRMWARE_VERSIONS.includes(firmware) ? 1 : 0;
  }

  let networkConn: 0 | 1;
  if (profile.device.network_connected === "random") {
    networkConn = rng() > 0.5 ? 1 : 0;
  } else {
    networkConn = profile.device.network_connected ? 1 : 0;
  }

  return {
    record_id:               recordId,
    session_id:              makeSessionId(parseInt(recordId.split("_")[2] ?? "0", 10), now.getTime()),
    timestamp_iso:           now.toISOString(),
    pump_model:              "alaris_gp",
    firmware_version:        firmware,
    firmware_version_risk:   firmwareRisk,
    days_since_maintenance:  randInt(...profile.device.days_since_maintenance, rng),
    battery_level_pct:       randInt(...profile.device.battery_level_pct, rng),
    network_connected:       networkConn,
    drug_library_age_days:   randInt(...profile.device.drug_library_age_days, rng),
    config_drift_score:      +randFloat(...profile.device.config_drift_score, rng).toFixed(3),
    recent_occlusion_alarms: randInt(...profile.device.recent_occlusion_alarms, rng),
  };
}
