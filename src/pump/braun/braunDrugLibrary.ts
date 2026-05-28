/**
 * Drug library for the B. Braun Infusomat Space LVP simulator.
 *
 * ARCHITECTURE ROLE:
 *   Provides the drug list used by the B. Braun state machine and AI pipeline.
 *   Re-exports the Alaris GP DRUG_LIBRARY from src/pump/drugLibrary.ts as
 *   BRAUN_DRUG_LIBRARY to enable direct cross-device risk score comparison.
 *
 * WHY THE SAME DRUGS ARE USED:
 *   The primary research goal is to compare risk scores across device types
 *   for identical clinical scenarios. If the two simulators used different
 *   drug sets, any difference in risk distribution could be attributed to drug
 *   selection rather than device design differences. Using the same 10-drug
 *   subset ensures that all observed differences in risk scores reflect:
 *     a) Structural device differences (3-tier vs 2-tier guardrails, bolus max, etc.)
 *     b) CVE/recall differences captured in Layer 0 (deviceDesign.ts)
 *     c) B. Braun-specific rules (BB-R01 to BB-R05 in braunRules.ts)
 *   Source: CLAUDE.md research goals — "Data generation… feeds directly into
 *   a baseline AI risk model."
 *
 * IN PRODUCTION:
 *   A real B. Braun Infusomat Space implementation would use the hospital's
 *   Vigilant MasterMed library containing up to 1,500 entries, pushed to the
 *   pump via the SpaceCom2 module from the SpaceStation base unit.
 *   Source: B. Braun IFU — drug library section.
 *   Source: Vigilant Software Suite documentation (B. Braun).
 *
 * B. BRAUN SPECIFIC DIFFERENCES:
 *   - Drug library is managed by Vigilant MasterMed software (server-side).
 *   - Updates are pushed via SpaceCom2 WiFi module when connected to SpaceStation.
 *   - Three-tier guardrail limits (advisory zone concept) are applied on top of
 *     the same softMin/softMax/hardMin/hardMax values from this shared library.
 *     The advisory zone is computed in braunGuardrails.ts, not stored per drug.
 *
 * SOURCE:
 *   B. Braun Infusomat Space IFU — bbraunusa.com (2024), drug library section.
 *   Vigilant Software Suite documentation (B. Braun, agiliasystem.com adapted).
 *   All clinically validated drug values: src/pump/drugLibrary.ts.
 *
 * NO React imports allowed in this file.
 */

import { DRUG_LIBRARY } from '../drugLibrary';
import type { Drug } from '../types';

/**
 * B. Braun Infusomat Space drug library.
 *
 * Re-exports the Alaris GP DRUG_LIBRARY as the B. Braun library for research
 * comparability. See module-level JSDoc for the rationale.
 *
 * In the simulator the same 10 clinically validated drugs are used for both
 * device types. Advisory zone thresholds are computed dynamically in
 * braunGuardrails.ts using BRAUN_DEFAULTS.ADVISORY_ZONE_FRACTION.
 *
 * Drug IDs (for reference):
 *   "manual"        — MANUAL ml/h (no drug library protection)
 *   "adrenaline"    — Adrenaline µg/kg/min (ICU vasopressor)
 *   "morphine"      — Morphine mg/h (opioid analgesic)
 *   "heparin"       — Heparin U/h (anticoagulant)
 *   "dopamine"      — Dopamine µg/kg/min (vasopressor/inotrope)
 *   "noradrenaline" — Noradrenaline µg/kg/min (vasopressor)
 *   "propofol"      — Propofol mg/kg/h (sedative/anaesthetic)
 *   "insulin"       — Insulin U/h (hypoglycaemia risk)
 *   "amiodarone"    — Amiodarone mg/h (antiarrhythmic)
 *   "kcl"           — KCl 20mmol mmol/h (electrolyte, cardiac arrest risk)
 *
 * Source: CLAUDE.md Section 5 — Drug Library (all values clinically validated).
 */
export const BRAUN_DRUG_LIBRARY: Drug[] = DRUG_LIBRARY;

/**
 * Look up a drug from the B. Braun drug library by its ID.
 *
 * Returns undefined if no drug with the given ID exists.
 * Useful in the state machine where drug.id is stored in BraunPumpState.selectedDrugId
 * and the full drug object is needed for guardrail checks or rate-to-ml/h conversion.
 *
 * @param id - The drug ID string (e.g. "morphine", "heparin", "manual")
 * @returns The Drug object if found, undefined otherwise
 *
 * @example
 * const drug = getBraunDrug('morphine');
 * // drug.name === 'MORPHINE', drug.softMax === 10, drug.unit === 'mg/h'
 *
 * const missing = getBraunDrug('unknown');
 * // undefined
 *
 * Source: src/pump/drugLibrary.ts — clinically validated drug definitions.
 */
export function getBraunDrug(id: string): Drug | undefined {
  return BRAUN_DRUG_LIBRARY.find(d => d.id === id);
}
