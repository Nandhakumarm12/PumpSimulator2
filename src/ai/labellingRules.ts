/**
 * Risk labelling rules for the Alaris GP simulator training records.
 * Assigns risk_label ("low" | "medium" | "high"), risk_score, and risk_reasons
 * for Layers 1–3 of the 4-layer composite risk model.
 *
 * ARCHITECTURE ROLE:
 *   This file implements Layers 1, 2, and 3 of the composite risk scoring system.
 *   Layer 0 (Design) is implemented in deviceDesign.ts and wired in datasetBuilder.ts.
 *
 * LAYER CATEGORISATION (which R-rule IDs belong to which layer):
 *   Layer 0 — Design (deviceDesign.ts): inherent device design risk.
 *             No R-rule IDs — scored by DESIGN_PENALTY_WEIGHTS per DeviceDesignProfile.
 *
 *   Layer 1 — Interaction (nurse programming behaviour):
 *             R01, R02, R08, R10, R14, R15, R21
 *             Captures: dose error magnitude, correction count, boundary hits, entry time.
 *             Source: Cauchi et al. (2011) EICS4Med — interaction error taxonomy.
 *
 *   Layer 2 — Configuration (session setup decisions):
 *             R03, R04, R07, R11, R12, R13
 *             Captures: guardrail blocks/overrides, MANUAL mode, VTBI absence.
 *             Source: ISMP High-Alert Medications (R07); IEC 60601-2-24:2012 (R03).
 *
 *   Layer 3 — System (physical and cyber device state):
 *             R05, R06, R16, R17, R18, R19, R20
 *             Captures: firmware CVE, maintenance overdue, battery, network, occlusion alarms.
 *             Source: FDA Infusion Pump Safety guidance; CISA ICS-CERT advisories (R05).
 *
 * COMPOSITE FORMULA (weights applied in datasetBuilder.ts after Step 2):
 *   composite_score = 0.20 × design_score    (Layer 0 — deviceDesign.ts)
 *                   + 0.30 × interaction_score (Layer 1)
 *                   + 0.25 × configuration_score (Layer 2)
 *                   + 0.25 × system_score       (Layer 3)
 *
 * GRADE THRESHOLDS (applied to composite_score):
 *   0.00–0.10 = A+  → risk_label = "low"
 *   0.11–0.20 = A   → risk_label = "low"
 *   0.21–0.35 = B   → risk_label = "low"
 *   0.36–0.50 = C   → risk_label = "medium"
 *   0.51–0.65 = D   → risk_label = "medium"
 *   0.66–0.80 = E   → risk_label = "high"
 *   0.81–1.00 = F   → risk_label = "high"
 *
 * IMPLEMENTATION STATUS:
 *   Step 1 (implemented): Layers 1–3 scoring via R01–R21 rules.
 *   Step 2 (implemented): Layer 0 design_score wired in datasetBuilder.ts via
 *                         computeDesignScore() from deviceDesign.ts.
 *
 * NOTE: applyLabellingRules() still returns design_score = 0.0 as a placeholder.
 *       datasetBuilder.ts overwrites this with the real value from computeDesignScore().
 *       The placeholder is intentional — Layer 0 requires the device model context
 *       which is only available at the dataset builder level, not at the rule level.
 *
 * Source: CLAUDE.md Section 9.
 * Clinical basis:
 *   - Cauchi et al. (2011) — correction_count, boundary_hit, golden_path_ratio
 *   - Thimbleby & Cairns (2010) — dose error magnitude thresholds
 *   - ISMP High-Alert Medications — drug-specific rules (R07)
 * NO React imports allowed in this file.
 */

import type { TrainingRecord } from './featureExtractor';

/** A single labelling rule. */
interface Rule {
  id:    string;
  label: string;
  test:  (r: Omit<TrainingRecord, "risk_label" | "risk_score" | "risk_reasons" | "design_score" | "interaction_score" | "configuration_score" | "system_score" | "composite_score" | "grade" | "design_reasons" | "interaction_reasons" | "configuration_reasons" | "system_reasons">) => boolean;
}

// ─── HIGH RISK rules (R01–R08) ───────────────────────────────────────────────
// Any single trigger → risk_label = "high"

const HIGH_RISK_RULES: Rule[] = [
  {
    id:    "R01",
    label: "10x dose error (≥90% relative error)",
    test:  r => r.relative_error >= 0.9,
  },
  {
    id:    "R02",
    label: "50% dose error (≥50% relative error)",
    test:  r => r.relative_error >= 0.5,
  },
  {
    id:    "R03",
    label: "Hard guardrail limit triggered (blocked)",
    test:  r => r.guardrail_blocked === 1,
  },
  {
    id:    "R04",
    label: "MANUAL mode with high rate (>200 ml/h) — no library protection",
    test:  r => r.drug_library_used === 0 && r.final_rate_ml_h > 200,
  },
  {
    id:    "R05",
    label: "Firmware version has known CVE vulnerability",
    test:  r => r.firmware_version_risk === 1,
  },
  {
    id:    "R06",
    label: "No maintenance in >1 year (>365 days)",
    test:  r => r.days_since_maintenance > 365,
  },
  {
    id:    "R07",
    label: "KCl above soft limits — cardiac arrest risk",
    test:  r => r.drug_id === "kcl" && r.rate_within_soft_limits === 0,
  },
  {
    id:    "R08",
    label: "Confirmed wrong value (>10% error and infusion started)",
    test:  r => r.confirmed_incorrect === 1 && r.relative_error > 0.1,
  },
];

// ─── MEDIUM RISK rules (R10–R21) ─────────────────────────────────────────────
// Any single trigger (without high) → risk_label = "medium"

const MEDIUM_RISK_RULES: Rule[] = [
  {
    id:    "R10",
    label: "10% dose error (≥10% relative error)",
    test:  r => r.relative_error >= 0.1,
  },
  {
    id:    "R11",
    label: "Soft guardrail warning overridden by operator",
    test:  r => r.guardrail_override === 1,
  },
  {
    id:    "R12",
    label: "MANUAL mode — no drug library protection",
    test:  r => r.drug_library_used === 0,
  },
  {
    id:    "R13",
    label: "VTBI not set — no infusion completion detection",
    test:  r => r.vtbi_set === 0,
  },
  {
    id:    "R14",
    label: "Excessive corrections during entry (>5 direction reversals)",
    test:  r => r.correction_count > 5,
  },
  {
    id:    "R15",
    label: "Boundary hit during rate entry — operator tested limits",
    test:  r => r.boundary_hit_count > 0,
  },
  {
    id:    "R16",
    label: "Drug library outdated (>90 days since update)",
    test:  r => r.drug_library_age_days > 90,
  },
  {
    id:    "R17",
    label: "Battery critically low (<20%)",
    test:  r => r.battery_level_pct < 20,
  },
  {
    id:    "R18",
    label: "Not connected to Gateway — no remote monitoring",
    test:  r => r.network_connected === 0,
  },
  {
    id:    "R19",
    label: "High configuration drift (>0.5) from hospital standard",
    test:  r => r.config_drift_score > 0.5,
  },
  {
    id:    "R20",
    label: "Recent occlusion alarms (≥3 in last 24h)",
    test:  r => r.recent_occlusion_alarms >= 3,
  },
  {
    id:    "R21",
    label: "Slow rate entry (>60 seconds) — possible confusion",
    test:  r => r.entry_time_ms > 60_000,
  },
];

// ─── Risk score weights ───────────────────────────────────────────────────────

/**
 * Score contribution per rule (0.0–1.0 additive, capped at 1.0).
 * Higher-severity rules contribute more to the continuous risk_score.
 */
const RULE_SCORES: Record<string, number> = {
  R01: 1.0,  // 10x error is maximum severity
  R02: 0.85,
  R03: 0.80,
  R04: 0.75,
  R05: 0.70,
  R06: 0.65,
  R07: 0.90,
  R08: 0.80,
  R10: 0.40,
  R11: 0.45,
  R12: 0.30,
  R13: 0.25,
  R14: 0.30,
  R15: 0.20,
  R16: 0.25,
  R17: 0.35,
  R18: 0.30,
  R19: 0.30,
  R20: 0.40,
  R21: 0.20,
};

// ─── Layer categorisation ─────────────────────────────────────────────────────

/**
 * Rule IDs categorised into the 4-layer model.
 * Layer 0 (Design) is not represented in R-rules; it comes from deviceDesign.ts.
 * Layer 1 (Interaction): human programming behaviour rules.
 * Layer 2 (Configuration): pump setup and drug library configuration rules.
 * Layer 3 (System): physical and cyber device state rules.
 */
const LAYER_1_INTERACTION_IDS  = new Set(["R01", "R02", "R08", "R10", "R14", "R15", "R21"]);
const LAYER_2_CONFIGURATION_IDS = new Set(["R03", "R04", "R07", "R11", "R12", "R13"]);
const LAYER_3_SYSTEM_IDS        = new Set(["R05", "R06", "R16", "R17", "R18", "R19", "R20"]);

/** Grade thresholds derived from composite_score. */
type Grade = "A+" | "A" | "B" | "C" | "D" | "E" | "F";

/**
 * Map a composite_score (0–1) to an energy-label style grade.
 * Thresholds from CLAUDE.md Step 1 specification.
 */
function scoreToGrade(score: number): Grade {
  if (score <= 0.10) return "A+";
  if (score <= 0.20) return "A";
  if (score <= 0.35) return "B";
  if (score <= 0.50) return "C";
  if (score <= 0.65) return "D";
  if (score <= 0.80) return "E";
  return "F";
}

/**
 * Compute a layer sub-score from a set of fired rules.
 * Uses the same algorithm as the overall risk_score:
 *   max(fired rule scores) + 0.1 * sum(remaining scores)
 * Returns 0.0 if no rules fired in this layer.
 */
function layerScore(firedIds: string[]): number {
  if (firedIds.length === 0) return 0.0;
  const scores = firedIds.map(id => RULE_SCORES[id] ?? 0.1);
  const maxScore = Math.max(...scores);
  const sumRemaining = scores
    .filter(s => s < maxScore)
    .reduce((acc, s) => acc + s * 0.1, 0);
  return +Math.min(1.0, maxScore + sumRemaining).toFixed(3);
}

// ─── computeLayeredScores ────────────────────────────────────────────────────

/**
 * Compute the 4-layer sub-scores and composite score from a partial TrainingRecord.
 * design_score is always 0.0 in this layer (filled by deviceDesign.ts in Step 2).
 *
 * Composite formula (weights from CLAUDE.md Step 1):
 *   composite = 0.20 × design + 0.30 × interaction + 0.25 × configuration + 0.25 × system
 *
 * @param partial - TrainingRecord without risk and layered score fields
 */
export function computeLayeredScores(
  partial: Omit<TrainingRecord, "risk_label" | "risk_score" | "risk_reasons" | "design_score" | "interaction_score" | "configuration_score" | "system_score" | "composite_score" | "grade" | "design_reasons" | "interaction_reasons" | "configuration_reasons" | "system_reasons">
): {
  interaction_score:      number;
  configuration_score:    number;
  system_score:           number;
  interaction_reasons:    string[];
  configuration_reasons:  string[];
  system_reasons:         string[];
  composite_score:        number;
  grade:                  Grade;
} {
  const allHighFired   = HIGH_RISK_RULES.filter(r => r.test(partial));
  const allMediumFired = MEDIUM_RISK_RULES.filter(r => r.test(partial));
  const allFired       = [...allHighFired, ...allMediumFired];

  const firedL1 = allFired.filter(r => LAYER_1_INTERACTION_IDS.has(r.id));
  const firedL2 = allFired.filter(r => LAYER_2_CONFIGURATION_IDS.has(r.id));
  const firedL3 = allFired.filter(r => LAYER_3_SYSTEM_IDS.has(r.id));

  const interaction_score   = layerScore(firedL1.map(r => r.id));
  const configuration_score = layerScore(firedL2.map(r => r.id));
  const system_score        = layerScore(firedL3.map(r => r.id));
  const design_score        = 0.0; // placeholder — deviceDesign.ts fills this in Step 2

  const composite_raw =
    0.20 * design_score +
    0.30 * interaction_score +
    0.25 * configuration_score +
    0.25 * system_score;

  const composite_score = +Math.min(1.0, composite_raw).toFixed(3);
  const grade           = scoreToGrade(composite_score);

  return {
    interaction_score,
    configuration_score,
    system_score,
    interaction_reasons:   firedL1.map(r => `${r.id}: ${r.label}`),
    configuration_reasons: firedL2.map(r => `${r.id}: ${r.label}`),
    system_reasons:        firedL3.map(r => `${r.id}: ${r.label}`),
    composite_score,
    grade,
  };
}

// ─── Main labelling function ──────────────────────────────────────────────────

/**
 * Apply all risk labelling rules to a partial TrainingRecord and return
 * risk_label, risk_score (0.0–1.0), risk_reasons, and all layered score fields.
 *
 * Algorithm:
 *   1. Check all HIGH rules — if any fires, label = "high"
 *   2. Else check all MEDIUM rules — if any fires, label = "medium"
 *   3. Else label = "low"
 *   risk_score now equals composite_score.
 *   risk_label is derived from grade (A+/A/B → low; C/D → medium; E/F → high).
 */
export function applyLabellingRules(
  partial: Omit<TrainingRecord, "risk_label" | "risk_score" | "risk_reasons" | "design_score" | "interaction_score" | "configuration_score" | "system_score" | "composite_score" | "grade" | "design_reasons" | "interaction_reasons" | "configuration_reasons" | "system_reasons">
): {
  risk_label:             "low" | "medium" | "high";
  risk_score:             number;
  risk_reasons:           string[];
  design_score:           number;
  interaction_score:      number;
  configuration_score:    number;
  system_score:           number;
  composite_score:        number;
  grade:                  Grade;
  design_reasons:         string[];
  interaction_reasons:    string[];
  configuration_reasons:  string[];
  system_reasons:         string[];
} {
  const triggeredHigh   = HIGH_RISK_RULES.filter(r => r.test(partial));
  const triggeredMedium = MEDIUM_RISK_RULES.filter(r => r.test(partial));
  const allTriggered    = [...triggeredHigh, ...triggeredMedium];

  const risk_reasons = allTriggered.map(r => `${r.id}: ${r.label}`);

  // Compute layered scores
  const layered = computeLayeredScores(partial);

  // risk_score is now the composite_score
  const risk_score = layered.composite_score;

  // risk_label derived from grade
  let risk_label: "low" | "medium" | "high";
  const g = layered.grade;
  if (g === "A+" || g === "A" || g === "B") {
    risk_label = "low";
  } else if (g === "C" || g === "D") {
    risk_label = "medium";
  } else {
    risk_label = "high";
  }

  return {
    risk_label,
    risk_score,
    risk_reasons,
    design_score:           0.0,
    interaction_score:      layered.interaction_score,
    configuration_score:    layered.configuration_score,
    system_score:           layered.system_score,
    composite_score:        layered.composite_score,
    grade:                  layered.grade,
    design_reasons:         [],
    interaction_reasons:    layered.interaction_reasons,
    configuration_reasons:  layered.configuration_reasons,
    system_reasons:         layered.system_reasons,
  };
}

/** Return only the HIGH risk rule IDs that fired (for audit log). */
export function getHighRiskRuleIds(
  partial: Omit<TrainingRecord, "risk_label" | "risk_score" | "risk_reasons" | "design_score" | "interaction_score" | "configuration_score" | "system_score" | "composite_score" | "grade" | "design_reasons" | "interaction_reasons" | "configuration_reasons" | "system_reasons">
): string[] {
  return HIGH_RISK_RULES.filter(r => r.test(partial)).map(r => r.id);
}

/** Return only the MEDIUM risk rule IDs that fired. */
export function getMediumRiskRuleIds(
  partial: Omit<TrainingRecord, "risk_label" | "risk_score" | "risk_reasons" | "design_score" | "interaction_score" | "configuration_score" | "system_score" | "composite_score" | "grade" | "design_reasons" | "interaction_reasons" | "configuration_reasons" | "system_reasons">
): string[] {
  return MEDIUM_RISK_RULES.filter(r => r.test(partial)).map(r => r.id);
}

/** Export the rule lists for inspection / display in the Research Panel. */
export { HIGH_RISK_RULES, MEDIUM_RISK_RULES };
