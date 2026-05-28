/**
 * Rule-based risk explainer — applies R01–R21 labelling rules to a single
 * TrainingRecord row and returns a structured explanation.
 *
 * Source: CLAUDE.md Section 9 — Risk Labelling Rules.
 * References: Cauchi et al. (2011), Thimbleby & Cairns (2010).
 *
 * NO React imports allowed in this file (src/ai/ is pure TypeScript).
 */

import type { TrainingRecord } from './featureExtractor';

// ─── Public types ─────────────────────────────────────────────────────────────

/** A single risk rule that fired for a given row. */
export interface FiredRule {
  /** Rule identifier, e.g. "R01". */
  id: string;
  /** Human-readable description of the rule. */
  label: string;
  /** Whether this is a high or medium severity rule. */
  severity: 'high' | 'medium';
  /** Clinical or research source reference for this rule. */
  source: string;
}

/** Complete explanation for a single row's risk assignment. */
export interface RuleExplanation {
  /** All rules that fired (high + medium combined). */
  firedRules: FiredRule[];
  /** The final assigned label based on fired rules. */
  assignedLabel: 'low' | 'medium' | 'high';
  /** Subset of firedRules that are high severity. */
  highRules: FiredRule[];
  /** Subset of firedRules that are medium severity. */
  mediumRules: FiredRule[];
}

// ─── Rule definitions ─────────────────────────────────────────────────────────

interface RuleDefinition {
  id: string;
  label: string;
  severity: 'high' | 'medium';
  source: string;
  test: (r: Partial<TrainingRecord>) => boolean;
}

/**
 * HIGH RISK rules — any single trigger is sufficient for HIGH label.
 * Source: CLAUDE.md Section 9, HIGH_RISK_RULES.
 */
const HIGH_RISK_RULES: RuleDefinition[] = [
  {
    id: 'R01',
    label: '10x dose error (relative error ≥ 90%)',
    severity: 'high',
    source: 'Thimbleby & Cairns (2010) J. Royal Society Interface 7(51)',
    test: r => (r.relative_error ?? 0) >= 0.9,
  },
  {
    id: 'R02',
    label: '50% dose error (relative error ≥ 50%)',
    severity: 'high',
    source: 'ISMP Error-Prone Abbreviations; Cauchi et al. (2011) EICS4Med',
    test: r => (r.relative_error ?? 0) >= 0.5,
  },
  {
    id: 'R03',
    label: 'Hard guardrail limit triggered — pump blocked delivery',
    severity: 'high',
    source: 'BD Alaris GP DFU BDDF00535 Issue 4 — Guardrails section',
    test: r => r.guardrail_blocked === 1,
  },
  {
    id: 'R04',
    label: 'No drug library used and rate > 200 ml/h',
    severity: 'high',
    source: 'CLAUDE.md R04; FDA Infusion Pump Safety guidance',
    test: r => r.drug_library_used === 0 && (r.final_rate_ml_h ?? 0) > 200,
  },
  {
    id: 'R05',
    label: 'Firmware version with known CVE vulnerability',
    severity: 'high',
    source: 'CVE database; ICS-CERT advisories for BD Alaris devices',
    test: r => r.firmware_version_risk === 1,
  },
  {
    id: 'R06',
    label: 'No maintenance in over 1 year (>365 days)',
    severity: 'high',
    source: 'BD Technical Service Manual 1000SM00013 Iss. 4',
    test: r => (r.days_since_maintenance ?? 0) > 365,
  },
  {
    id: 'R07',
    label: 'KCl infusion outside soft limits — cardiac arrest risk',
    severity: 'high',
    source: 'ISMP high-alert medications; rapid KCl = cardiac arrest risk',
    test: r => r.drug_id === 'kcl' && r.rate_within_soft_limits === 0,
  },
  {
    id: 'R08',
    label: 'Confirmed wrong value — started infusion with >10% error',
    severity: 'high',
    source: 'Cauchi et al. (2011) — confirmed_incorrect definition',
    test: r => r.confirmed_incorrect === 1 && (r.relative_error ?? 0) > 0.1,
  },
];

/**
 * MEDIUM RISK rules — any single trigger (without a high trigger) gives MEDIUM.
 * Source: CLAUDE.md Section 9, MEDIUM_RISK_RULES.
 */
const MEDIUM_RISK_RULES: RuleDefinition[] = [
  {
    id: 'R10',
    label: '10% dose error (relative error ≥ 10%)',
    severity: 'medium',
    source: 'Thimbleby & Cairns (2010); ISMP safe practices',
    test: r => (r.relative_error ?? 0) >= 0.1,
  },
  {
    id: 'R11',
    label: 'Soft guardrail warning overridden by operator',
    severity: 'medium',
    source: 'BD Alaris GP DFU — Guardrails override procedure',
    test: r => r.guardrail_override === 1,
  },
  {
    id: 'R12',
    label: 'No drug library used (MANUAL mode)',
    severity: 'medium',
    source: 'FDA Infusion Pump Safety; BD Alaris GP DFU Section 4',
    test: r => r.drug_library_used === 0,
  },
  {
    id: 'R13',
    label: 'VTBI not set — no volume limit programmed',
    severity: 'medium',
    source: 'BD Alaris GP DFU — VTBI programming recommended',
    test: r => r.vtbi_set === 0,
  },
  {
    id: 'R14',
    label: 'Excessive corrections during entry (>5 reversals)',
    severity: 'medium',
    source: 'Cauchi et al. (2011) — correction_count definition',
    test: r => (r.correction_count ?? 0) > 5,
  },
  {
    id: 'R15',
    label: 'Rate boundary hit during entry (RATE_MIN or RATE_MAX)',
    severity: 'medium',
    source: 'Cauchi et al. (2011) — boundary_hit definition',
    test: r => (r.boundary_hit_count ?? 0) > 0,
  },
  {
    id: 'R16',
    label: 'Drug library outdated (>90 days since last update)',
    severity: 'medium',
    source: 'BD Alaris GP Guardrails — library currency requirement',
    test: r => (r.drug_library_age_days ?? 0) > 90,
  },
  {
    id: 'R17',
    label: 'Low battery (<20%) — risk of unexpected shutdown',
    severity: 'medium',
    source: 'BD Alaris GP DFU — Battery Low alarm specification',
    test: r => (r.battery_level_pct ?? 100) < 20,
  },
  {
    id: 'R18',
    label: 'Disconnected from hospital Gateway network',
    severity: 'medium',
    source: 'BD Alaris GP Guardrails — network connectivity spec',
    test: r => r.network_connected === 0,
  },
  {
    id: 'R19',
    label: 'High configuration drift from hospital standard (>0.5)',
    severity: 'medium',
    source: 'CLAUDE.md Section 10 — config_drift_score definition',
    test: r => (r.config_drift_score ?? 0) > 0.5,
  },
  {
    id: 'R20',
    label: 'Recent occlusion alarms (≥3 in last 24h)',
    severity: 'medium',
    source: 'BD Alaris GP DFU — OCCLUSION alarm section',
    test: r => (r.recent_occlusion_alarms ?? 0) >= 3,
  },
  {
    id: 'R21',
    label: 'Slow rate entry (>60 seconds) — operator uncertainty',
    severity: 'medium',
    source: 'Cauchi et al. (2011) — entry_time_ms definition',
    test: r => (r.entry_time_ms ?? 0) > 60000,
  },
];

// ─── Public function ──────────────────────────────────────────────────────────

/**
 * Apply R01–R21 rules to a single (possibly partial) TrainingRecord row and
 * return a full explanation including which rules fired and the assigned label.
 *
 * HIGH rules are checked first. Any single HIGH rule → HIGH label.
 * If no HIGH rules fire, any MEDIUM rule → MEDIUM label.
 * If no rules fire at all → LOW label.
 *
 * @param row - A partial TrainingRecord (e.g. parsed from CSV). Missing fields
 *              default to 0 / safe fallback values via the rule tests.
 * @returns RuleExplanation with fired rules and assigned label.
 */
export function explainRow(row: Partial<TrainingRecord>): RuleExplanation {
  const firedHigh: FiredRule[] = HIGH_RISK_RULES
    .filter(rule => rule.test(row))
    .map(({ id, label, severity, source }) => ({ id, label, severity, source }));

  const firedMedium: FiredRule[] = MEDIUM_RISK_RULES
    .filter(rule => rule.test(row))
    .map(({ id, label, severity, source }) => ({ id, label, severity, source }));

  const firedRules: FiredRule[] = [...firedHigh, ...firedMedium];

  let assignedLabel: 'low' | 'medium' | 'high';
  if (firedHigh.length > 0) {
    assignedLabel = 'high';
  } else if (firedMedium.length > 0) {
    assignedLabel = 'medium';
  } else {
    assignedLabel = 'low';
  }

  return {
    firedRules,
    assignedLabel,
    highRules: firedHigh,
    mediumRules: firedMedium,
  };
}
