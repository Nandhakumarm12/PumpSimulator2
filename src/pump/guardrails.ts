/**
 * Guardrail logic for the Alaris GP pump simulator.
 * Source: DFU Manual BDDF00535 Issue 4 (Guardrails version).
 * Operates on drug-unit rates, NOT ml/h.
 * NO React imports allowed in this file.
 */

import type { Drug, GuardrailResult } from './types';

/**
 * Check whether a rate (in drug units) violates soft or hard guardrail limits.
 * MANUAL mode always returns "ok" — no guardrails apply.
 * @param rate - Rate in the drug's own units (e.g. µg/kg/min, mg/h)
 * @param drug - The selected drug from the library
 * @returns GuardrailResult with status and optional message
 */
export function checkGuardrail(rate: number, drug: Drug): GuardrailResult {
  if (drug.id === "manual") return { status: "ok" };

  if (rate > drug.hardMax || rate < drug.hardMin) {
    return {
      status: "blocked",
      message: rate > drug.hardMax
        ? `HARD MAX\n${rate.toFixed(3)} > ${drug.hardMax} ${drug.unit}`
        : `HARD MIN\n${rate.toFixed(3)} < ${drug.hardMin} ${drug.unit}`
    };
  }

  if (rate > drug.softMax || rate < drug.softMin) {
    return {
      status: "warning",
      message: rate > drug.softMax
        ? `RATE TOO HIGH\n${rate.toFixed(3)} > ${drug.softMax} ${drug.unit}`
        : `RATE TOO LOW\n${rate.toFixed(3)} < ${drug.softMin} ${drug.unit}`
    };
  }

  return { status: "ok" };
}
