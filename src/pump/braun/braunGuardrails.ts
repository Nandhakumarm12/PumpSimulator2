/**
 * Three-tier guardrail logic for the B. Braun Infusomat Space LVP simulator.
 *
 * ARCHITECTURE ROLE:
 *   Mirrors src/pump/guardrails.ts (Alaris GP) but implements the B. Braun
 *   three-tier guardrail system instead of the Alaris GP two-tier system.
 *
 * THREE-TIER SYSTEM (B. Braun) VS TWO-TIER SYSTEM (Alaris GP):
 *
 *   Alaris GP (two tiers):
 *     - Soft stop: rate > softMax or < softMin → nurse must override or re-enter.
 *     - Hard stop: rate > hardMax or < hardMin → nurse must re-enter (no override).
 *
 *   B. Braun Infusomat Space (three tiers):
 *     - Advisory (tier 1): rate is within soft limits but within 20% of the soft
 *       limit boundary. Infusion continues automatically after nurse acknowledgement.
 *       This tier acts as an early warning before the soft limit is reached.
 *       Source: B. Braun IFU — "Clinical Advisories" tier.
 *     - Soft Stop (tier 2): rate exceeds soft limits. Nurse must actively choose
 *       OVERRIDE or RE-ENTER. Equivalent to Alaris GP soft limit behaviour.
 *       Source: B. Braun IFU — "Soft Stop" tier.
 *     - Hard Stop (tier 3): rate exceeds hard limits. Only RE-ENTER is permitted.
 *       No override possible. Equivalent to Alaris GP hard limit behaviour.
 *       Source: B. Braun IFU — "Hard Stop" tier.
 *
 * ADVISORY ZONE CALCULATION:
 *   The advisory zone is defined as the region where:
 *     rate > (softMax × (1 - ADVISORY_ZONE_FRACTION))
 *   OR
 *     rate < (softMin × (1 + ADVISORY_ZONE_FRACTION))
 *   but still within the soft limits (i.e. rate <= softMax and rate >= softMin).
 *
 *   With ADVISORY_ZONE_FRACTION = 0.20:
 *     - If softMax = 10, advisory fires when rate > 8.0 (within 20% of softMax).
 *     - If softMin = 2, advisory fires when rate < 2.4 (within 20% above softMin).
 *
 *   Advisory is ONLY shown for drugs from the library (drug.id !== "manual").
 *   MANUAL mode bypasses all guardrail tiers entirely (same as Alaris GP).
 *   Source: B. Braun IFU — "Clinical Advisories" tier description.
 *
 * SOURCE:
 *   B. Braun Infusomat Space IFU — bbraunusa.com (2024), guardrail sections.
 *   CLAUDE.md Section 6.4 — Guardrail Logic (adapted for three-tier system).
 *
 * NO React imports allowed in this file.
 */

import type { Drug } from '../types';
import type { BraunGuardrailStatus } from './braunTypes';
import { BRAUN_DEFAULTS } from './braunConstants';

/**
 * Check the three-tier B. Braun guardrail status for a given rate and drug.
 *
 * Priority order (checked highest to lowest severity):
 *   1. Hard Stop: rate > hardMax or rate < hardMin → { status: 'blocked' }
 *   2. Soft Stop: rate > softMax or rate < softMin → { status: 'warning' }
 *   3. Advisory:  rate within soft limits but within advisory zone → { status: 'advisory' }
 *   4. OK:        rate within soft limits and outside advisory zone → { status: 'ok' }
 *
 * MANUAL mode (drug.id === "manual") always returns { status: 'ok' }:
 *   Drug library guardrails do not apply in MANUAL mode. This matches the Alaris GP
 *   behaviour and is consistent with the research dataset design (MANUAL = highest risk
 *   profile, separately flagged by rule R12 in labellingRules.ts).
 *
 * @param rate - Rate in the drug's own display units (e.g. mg/h, µg/kg/min, ml/h)
 * @param drug - The selected drug from BRAUN_DRUG_LIBRARY (or Alaris GP DRUG_LIBRARY)
 * @returns BraunGuardrailStatus indicating which tier (if any) was triggered
 *
 * @example
 * // Morphine softMin=1, softMax=10, hardMin=0.5, hardMax=20
 * checkBraunGuardrail(0.3, morphine); // blocked (< hardMin 0.5)
 * checkBraunGuardrail(15.0, morphine); // warning (> softMax 10)
 * checkBraunGuardrail(9.0, morphine);  // advisory (> 8.0, which is softMax × 0.80)
 * checkBraunGuardrail(5.0, morphine);  // ok
 *
 * Source: B. Braun Infusomat Space IFU — "Clinical Advisories", "Soft Stop", "Hard Stop".
 */
export function checkBraunGuardrail(rate: number, drug: Drug): BraunGuardrailStatus {
  // MANUAL mode — no drug library guardrails apply
  if (drug.id === 'manual') return { status: 'ok' };

  // Tier 3 — Hard Stop: rate outside absolute hard limits
  if (rate > drug.hardMax || rate < drug.hardMin) {
    return {
      status: 'blocked',
      message: rate > drug.hardMax
        ? `HARD STOP — RATE TOO HIGH\n${rate.toFixed(3)} > ${drug.hardMax} ${drug.unit}`
        : `HARD STOP — RATE TOO LOW\n${rate.toFixed(3)} < ${drug.hardMin} ${drug.unit}`,
    };
  }

  // Tier 2 — Soft Stop: rate outside soft limits (but within hard limits)
  if (rate > drug.softMax || rate < drug.softMin) {
    return {
      status: 'warning',
      message: rate > drug.softMax
        ? `SOFT STOP — RATE HIGH\n${rate.toFixed(3)} > ${drug.softMax} ${drug.unit}`
        : `SOFT STOP — RATE LOW\n${rate.toFixed(3)} < ${drug.softMin} ${drug.unit}`,
    };
  }

  // Tier 1 — Advisory: rate within soft limits but near the boundary
  if (isInAdvisoryZone(rate, drug)) {
    return {
      status: 'advisory',
      message: rate > drug.softMax * (1 - BRAUN_DEFAULTS.ADVISORY_ZONE_FRACTION)
        ? `ADVISORY — APPROACHING HIGH LIMIT\n${rate.toFixed(3)} ${drug.unit} (soft max: ${drug.softMax})`
        : `ADVISORY — APPROACHING LOW LIMIT\n${rate.toFixed(3)} ${drug.unit} (soft min: ${drug.softMin})`,
    };
  }

  // OK — rate is within soft limits and outside advisory zone
  return { status: 'ok' };
}

/**
 * Determine if a rate is within the advisory zone for a given drug.
 *
 * The advisory zone is the region within the soft limits that is "close" to
 * a soft limit boundary, defined by BRAUN_DEFAULTS.ADVISORY_ZONE_FRACTION (0.20 = 20%).
 *
 * Upper advisory zone: rate > softMax × (1 - 0.20) = softMax × 0.80
 *   i.e. rate is in the top 20% of the soft-limit range approaching softMax
 *
 * Lower advisory zone: rate < softMin × (1 + 0.20) = softMin × 1.20
 *   i.e. rate is within 20% above softMin
 *
 * Both conditions must still satisfy rate <= softMax AND rate >= softMin
 * (i.e. the advisory zone is strictly within the soft limit range).
 *
 * Advisory zone is NEVER shown for MANUAL mode drugs.
 *
 * @param rate - Rate in drug display units
 * @param drug - The selected drug
 * @returns true if rate is in the advisory zone (within soft limits but near boundary)
 *
 * @example
 * // Morphine softMin=1, softMax=10, ADVISORY_ZONE_FRACTION=0.20
 * isInAdvisoryZone(9.0, morphine);  // true  (> 10 × 0.80 = 8.0)
 * isInAdvisoryZone(8.0, morphine);  // false (not strictly > 8.0)
 * isInAdvisoryZone(1.1, morphine);  // true  (< 1 × 1.20 = 1.2)
 * isInAdvisoryZone(5.0, morphine);  // false
 *
 * Source: B. Braun IFU — "Clinical Advisories" tier description.
 */
export function isInAdvisoryZone(rate: number, drug: Drug): boolean {
  // Advisory never applies to MANUAL mode
  if (drug.id === 'manual') return false;

  const f = BRAUN_DEFAULTS.ADVISORY_ZONE_FRACTION;

  // Upper advisory zone: approaching softMax from below
  const upperAdvisoryThreshold = drug.softMax * (1 - f);
  const inUpperZone = rate > upperAdvisoryThreshold && rate <= drug.softMax;

  // Lower advisory zone: approaching softMin from above
  // Only meaningful when softMin > 0; use additive fraction when softMin is very small
  const lowerAdvisoryThreshold = drug.softMin > 0
    ? drug.softMin * (1 + f)
    : drug.softMin + f;
  const inLowerZone = rate < lowerAdvisoryThreshold && rate >= drug.softMin;

  return inUpperZone || inLowerZone;
}
