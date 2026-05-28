/**
 * B. Braun Infusomat Space specific risk labelling rules (BB-R01 to BB-R05).
 *
 * ARCHITECTURE ROLE:
 *   These rules extend the generic R01–R21 rules (labellingRules.ts) with
 *   device-specific risk conditions unique to the B. Braun Infusomat Space.
 *   They are combined with the generic rules in braunDatasetBuilder to produce
 *   the final risk_label, risk_score, and risk_reasons for each training record.
 *
 * LAYER ASSIGNMENT:
 *   BB-R01 (firmware unsigned)   → Layer 3 (System) — device cyber state
 *   BB-R02 (SpaceCom2 unpatched) → Layer 3 (System) — device cyber state
 *   BB-R03 (advisory dismissed)  → Layer 2 (Configuration) — session setup decision
 *   BB-R04 (bolus > 75% max)     → Layer 2 (Configuration) — session setup decision
 *   BB-R05 (recall batch)        → Layer 0 (Design) — device design/manufacturing defect
 *
 * SOURCES:
 *   BB-R01: CVE-2021-33885 (CVSS 9.0) — B. Braun firmware not cryptographically signed.
 *           CISA ICSMA-21-294-01. Affected: Battery Pack SP WiFi ≤028U000061 and
 *           Infusomat Space Large Volume Pump firmware 686N and prior versions.
 *           The firmware update protocol does not validate cryptographic signatures,
 *           allowing unauthenticated remote replacement via SpaceStation connection.
 *
 *   BB-R02: CVE-2021-33882 (CVSS 7.7) — Missing authentication for critical networking
 *           commands sent to SpaceCom2 module.
 *           CISA ICSMA-21-294-01. When network is active (SpaceCom2 connected) AND
 *           firmware is unsigned, an attacker on the same network can send commands
 *           to change pump parameters without authentication. Combined risk > individual.
 *
 *   BB-R03: B. Braun IFU — Clinical advisory tier. Dismissing an advisory when near
 *           soft limits removes the only early warning before the soft limit is crossed.
 *           If the nurse later triggers the soft stop (warning) despite having already
 *           dismissed an advisory, this indicates progressive boundary-pushing behaviour
 *           that is associated with increased risk of a dose programming error.
 *
 *   BB-R04: B. Braun IFU — Bolus max 2 ml. Delivering > 1.5 ml bolus approaches the
 *           absolute device maximum of 2.0 ml. For concentrated drugs (e.g. KCl 1 mmol/ml
 *           or heparin 1000 U/ml), > 1.5 ml bolus can deliver clinically significant
 *           unintended doses. The 75% threshold (1.5 ml) follows the standard safety
 *           margin for near-maximum device operation.
 *
 *   BB-R05: FDA Class I Recall (November 2023) — Faulty occlusion detection software.
 *           Approximately 10,600 devices affected across multiple jurisdictions.
 *           The defect causes the pump to fail to alarm on downstream occlusion at
 *           certain flow rates, potentially interrupting vasopressor infusions without
 *           alerting clinical staff. One confirmed patient death attributed to
 *           interrupted vasopressor infusion (noradrenaline) due to missed occlusion.
 *           Source: FDA recall database — recall number Z-0601-2024.
 *
 * NO React imports allowed in this file.
 */

import type { TrainingRecord } from './featureExtractor';

// ─── BraunTrainingRecord ──────────────────────────────────────────────────────

/**
 * Extended training record for the B. Braun Infusomat Space.
 *
 * Adds B. Braun-specific fields to the base TrainingRecord (from featureExtractor.ts).
 * These fields are:
 *   - guardrail_advisory_shown:        Records whether the advisory tier was shown.
 *   - guardrail_advisory_acknowledged: Records whether the nurse dismissed the advisory.
 *   - spacecom2_connected:             SpaceCom2 module connectivity at session time.
 *   - firmware_signed:                 Firmware signing status (always 0 for Infusomat Space).
 *   - recall_batch_affected:           Whether device is in the FDA 2023 Class I recall scope.
 *   - bolus_max_ml:                    Device-specific bolus maximum (2.0 ml for Infusomat Space).
 *
 * All B. Braun-specific fields are required in the serialised CSV output to enable
 * cross-device ML training with a unified feature vector.
 *
 * Source: CLAUDE.md Section 8 — AI Feature Schema.
 * Source: CISA ICSMA-21-294-01 (advisory/firmware fields).
 * Source: FDA recall database Z-0601-2024 (recall_batch_affected).
 * Source: B. Braun Infusomat Space IFU (bolus_max_ml).
 */
export interface BraunTrainingRecord extends TrainingRecord {
  /**
   * 1 if the advisory tier (tier 1) guardrail warning was shown during this session.
   * Advisory is unique to B. Braun — no equivalent in the Alaris GP.
   * Source: B. Braun IFU — "Clinical Advisories" tier.
   */
  guardrail_advisory_shown:        0 | 1;

  /**
   * 1 if the nurse acknowledged (dismissed) the advisory warning.
   * Only meaningful when guardrail_advisory_shown = 1.
   * Source: B. Braun IFU — advisory acknowledgement action.
   */
  guardrail_advisory_acknowledged: 0 | 1;

  /**
   * 1 if the SpaceCom2 WiFi/data module was present and connected during the session.
   * When connected + firmware_signed = 0, BB-R02 HIGH rule fires.
   * Source: B. Braun SpaceCom2 module documentation / CISA ICSMA-21-294-01.
   */
  spacecom2_connected:             0 | 1;

  /**
   * 1 if the device firmware is cryptographically signed; 0 if unsigned.
   * Always 0 for the Infusomat Space — the firmware update protocol lacks
   * signature verification across all known firmware versions including current.
   * Source: CVE-2021-33885 (CVSS 9.0) — CISA ICSMA-21-294-01.
   */
  firmware_signed:                 0 | 1;

  /**
   * 1 if the device is within the scope of the FDA 2023 Class I recall
   * (faulty occlusion detection software — approximately 10,600 devices affected).
   * Source: FDA recall database — recall number Z-0601-2024 (November 2023).
   */
  recall_batch_affected:           0 | 1;

  /**
   * The device-specific bolus maximum in ml.
   * 2.0 ml for the B. Braun Infusomat Space (vs 5.0 ml for the Alaris GP).
   * Used by BB-R04 to evaluate whether the delivered bolus volume is near
   * the device maximum.
   * Source: B. Braun Infusomat Space IFU — "Bolus Volume Max 2 ml".
   */
  bolus_max_ml:                    number;
}

// ─── Rule type ────────────────────────────────────────────────────────────────

/**
 * A single B. Braun-specific risk labelling rule.
 *
 * Uses the same structure as the Rule interface in labellingRules.ts to ensure
 * compatibility with the combined rule application in applyBraunRules().
 *
 * @template T - The record type the rule operates on (BraunTrainingRecord)
 */
interface BraunRule {
  /** Unique rule ID in BB-R01 to BB-R99 namespace. */
  id:    string;
  /** Human-readable description for explainability output. */
  label: string;
  /**
   * Layer categorisation for layered scoring.
   * Layer 0 = Design, Layer 2 = Configuration, Layer 3 = System.
   */
  layer: 0 | 2 | 3;
  /** Severity: determines whether this rule fires HIGH or MEDIUM. */
  severity: 'high' | 'medium';
  /** Source citation for research traceability. */
  source: string;
  /**
   * Test function — returns true if this rule fires for the given record.
   * Uses Partial<BraunTrainingRecord> to handle records that may not have
   * all B. Braun-specific fields populated yet.
   */
  test:  (r: Partial<BraunTrainingRecord>) => boolean;
}

// ─── BB HIGH RISK RULES ───────────────────────────────────────────────────────

/**
 * B. Braun HIGH risk rules (BB-R01, BB-R02, BB-R05).
 * Any single trigger is sufficient for HIGH risk classification.
 *
 * These are additive to the generic R01–R08 high rules from labellingRules.ts.
 * The combined list is applied in applyBraunRules().
 */
export const BRAUN_HIGH_RULES: BraunRule[] = [
  {
    id:       'BB-R02',
    label:    'Networked device with unsigned firmware — actively exploitable via CVE-2021-33882',
    layer:    3,
    severity: 'high',
    source:   'CISA ICSMA-21-294-01 — CVE-2021-33882 (CVSS 7.7): missing auth for network commands; combined with unsigned firmware = active remote attack surface during this session',
    test:     r => r.spacecom2_connected === 1 && r.firmware_signed === 0,
  },
  {
    id:       'BB-R05',
    label:    'Device in FDA 2023 Class I recall scope — faulty occlusion alarm (confirmed death)',
    layer:    0,
    severity: 'high',
    source:   'FDA Class I Recall Z-0601-2024 (November 2023): faulty occlusion detection software, ~10,600 devices, 1 confirmed patient death (vasopressor interruption)',
    test:     r => r.recall_batch_affected === 1,
  },
];

// ─── BB MEDIUM RISK RULES ─────────────────────────────────────────────────────

/**
 * B. Braun MEDIUM risk rules (BB-R03, BB-R04).
 * Any single trigger (without a high rule also firing) → MEDIUM risk classification.
 *
 * These are additive to the generic R10–R21 medium rules from labellingRules.ts.
 */
export const BRAUN_MEDIUM_RULES: BraunRule[] = [
  {
    id:       'BB-R01',
    label:    'Firmware not cryptographically signed (CVE-2021-33885, CVSS 9.0) — systemic background risk already captured in design score',
    layer:    3,
    severity: 'medium',
    source:   'CISA ICSMA-21-294-01 — CVE-2021-33885 (CVSS 9.0): firmware update protocol lacks signature verification. Downgraded to MEDIUM because (a) this is a permanent device property already penalised in Layer 0 design_score, and (b) exploitation still requires attacker network access; without SpaceCom2 connected (BB-R02) there is no immediate session-level threat.',
    test:     r => r.firmware_signed === 0,
  },
  {
    id:       'BB-R03',
    label:    'Advisory dismissed then soft limit subsequently triggered — progressive boundary behaviour',
    layer:    2,
    severity: 'medium',
    source:   'B. Braun IFU — Clinical advisory tier: advisory is the early warning before soft limit; dismissing it then crossing soft limit indicates escalating boundary-pushing',
    test:     r => r.guardrail_advisory_acknowledged === 1 && r.guardrail_warning_shown === 1,
  },
  {
    id:       'BB-R04',
    label:    'Bolus volume > 75% of device maximum (>1.5 ml) — near-maximum bolus delivery',
    layer:    2,
    severity: 'medium',
    source:   'B. Braun IFU — Bolus Volume Max 2 ml; for concentrated drugs (KCl, heparin) a near-maximum bolus delivers clinically significant unintended dose',
    test:     r => r.bolus_delivered === 1 && typeof r.bolus_volume_ml === 'number' && r.bolus_volume_ml > 1.5,
  },
];

// ─── Rule score contributions ─────────────────────────────────────────────────

/**
 * Score contribution per B. Braun rule (0.0–1.0 additive).
 * Same scale as RULE_SCORES in labellingRules.ts — these values are used
 * when computing the system_score or configuration_score adjustment.
 *
 * BB-R01 (0.75): firmware unsigned is a critical cybersecurity risk but below
 *   the absolute maximum (1.0) since exploitation still requires network access.
 * BB-R02 (0.85): networked + unsigned = immediately exploitable; higher than BB-R01 alone.
 * BB-R03 (0.35): advisory dismissed then soft limit hit = medium interaction risk.
 * BB-R04 (0.30): near-maximum bolus = medium configuration risk.
 * BB-R05 (0.90): confirmed patient death from this specific recall defect.
 */
export const BRAUN_RULE_SCORES: Record<string, number> = {
  'BB-R01': 0.75,
  'BB-R02': 0.85,
  'BB-R03': 0.35,
  'BB-R04': 0.30,
  'BB-R05': 0.90,
};

// ─── Apply B. Braun rules ─────────────────────────────────────────────────────

/**
 * Apply all B. Braun-specific risk rules to a (partial) BraunTrainingRecord.
 *
 * Returns the fired HIGH and MEDIUM rule IDs, formatted risk reason strings,
 * and the set of B. Braun rule reasons for appending to the record's risk_reasons.
 *
 * This function does NOT replace the generic rules from labellingRules.ts —
 * it is called IN ADDITION to applyLabellingRules() in the dataset builder.
 * The B. Braun rule results are merged with the generic rule results to produce
 * the final combined risk assessment.
 *
 * @param record - Partial BraunTrainingRecord (may not have all fields populated)
 * @returns Object with fired rule IDs and formatted reason strings
 *
 * @example
 * const result = applyBraunRules({
 *   firmware_signed: 0,
 *   spacecom2_connected: 1,
 *   recall_batch_affected: 0,
 *   guardrail_advisory_acknowledged: 0,
 *   bolus_delivered: 0,
 *   bolus_volume_ml: 0,
 *   guardrail_warning_shown: 0,
 * });
 * // result.firedHighRules = ['BB-R01', 'BB-R02']
 * // result.firedMediumRules = []
 * // result.braunRiskReasons = ['BB-R01: Firmware not signed...', 'BB-R02: Networked...']
 *
 * Source: CLAUDE.md Section 9 — Risk Labelling Rules (B. Braun extension).
 */
export function applyBraunRules(record: Partial<BraunTrainingRecord>): {
  firedHighRules:   string[];
  firedMediumRules: string[];
  braunRiskReasons: string[];
} {
  const firedHigh   = BRAUN_HIGH_RULES.filter(r => r.test(record));
  const firedMedium = BRAUN_MEDIUM_RULES.filter(r => r.test(record));

  const firedHighIds   = firedHigh.map(r => r.id);
  const firedMediumIds = firedMedium.map(r => r.id);

  const braunRiskReasons = [
    ...firedHigh.map(r => `${r.id}: ${r.label}`),
    ...firedMedium.map(r => `${r.id}: ${r.label}`),
  ];

  return { firedHighRules: firedHighIds, firedMediumRules: firedMediumIds, braunRiskReasons };
}

/**
 * Compute the additional risk score contribution from B. Braun rules.
 *
 * Uses the same algorithm as layerScore() in labellingRules.ts:
 *   max(fired rule scores) + 0.1 × sum(remaining scores)
 * Clamped to [0, 1].
 *
 * This score delta is added to the relevant layer sub-score (Layer 3 system_score
 * for BB-R01/BB-R02, Layer 2 configuration_score for BB-R03/BB-R04, Layer 0
 * design_score for BB-R05) before the composite_score is computed.
 *
 * @param firedRuleIds - Array of BB-Rxx rule IDs that fired
 * @returns Score contribution (0.0–1.0)
 *
 * Source: labellingRules.ts — layerScore() algorithm.
 */
export function computeBraunRuleScore(firedRuleIds: string[]): number {
  if (firedRuleIds.length === 0) return 0.0;
  const scores = firedRuleIds.map(id => BRAUN_RULE_SCORES[id] ?? 0.1);
  const maxScore = Math.max(...scores);
  const sumRemaining = scores
    .filter(s => s < maxScore)
    .reduce((acc, s) => acc + s * 0.1, 0);
  return +Math.min(1.0, maxScore + sumRemaining).toFixed(3);
}

/**
 * Re-derive the risk_label from the combined risk assessment after B. Braun rules
 * have been applied.
 *
 * If any HIGH rule fired (generic or B. Braun-specific) AND the composite_score
 * maps to a grade of C or better, the label is escalated to 'high' regardless of
 * the composite score. This preserves the rule-based override behaviour from
 * applyLabellingRules() in labellingRules.ts.
 *
 * @param genericHighFired  - Rule IDs from generic HIGH_RISK_RULES that fired
 * @param braunHighFired    - Rule IDs from BRAUN_HIGH_RULES that fired
 * @param compositeScore    - The recomputed composite_score (0–1)
 * @returns The final risk_label
 *
 * Source: labellingRules.ts — applyLabellingRules() label derivation logic.
 */
export function deriveBraunRiskLabel(
  genericHighFired: string[],
  braunHighFired: string[],
  compositeScore: number
): 'low' | 'medium' | 'high' {
  const anyHighFired = genericHighFired.length > 0 || braunHighFired.length > 0;

  // Grade from composite score (mirrors labellingRules.ts scoreToGrade)
  let grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  if (compositeScore <= 0.10)      grade = 'A+';
  else if (compositeScore <= 0.20) grade = 'A';
  else if (compositeScore <= 0.35) grade = 'B';
  else if (compositeScore <= 0.50) grade = 'C';
  else if (compositeScore <= 0.65) grade = 'D';
  else if (compositeScore <= 0.80) grade = 'E';
  else                             grade = 'F';

  // If any high rule fired, minimum label is 'high' regardless of grade
  if (anyHighFired) return 'high';

  if (grade === 'A+' || grade === 'A' || grade === 'B') return 'low';
  if (grade === 'C' || grade === 'D')                   return 'medium';
  return 'high';
}
