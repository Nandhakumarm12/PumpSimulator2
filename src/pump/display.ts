/**
 * Display state computation for the Alaris GP pump.
 * Converts internal pump state values into display strings.
 * NO React imports allowed in this file.
 */

import type { Drug } from './types';
import { FACTORY_DEFAULTS } from './constants';

/**
 * Convert a rate in drug units to ml/h for the pump motor.
 * Handles all 14 DFU dose unit types.
 * @param rate - Rate in drug display units
 * @param drug - Selected drug
 * @param weightKg - Patient weight in kg (used for weight-based dosing)
 * @returns Rate in ml/h
 */
export function rateToMlH(rate: number, drug: Drug, weightKg: number): number {
  if (drug.id === "manual" || drug.unit === "ml/h") return rate;

  const unit = drug.unit;
  const conc = drug.concentration; // in concentrationUnit per ml

  // Weight-based per-minute units: µg/kg/min, ng/kg/min, mg/kg/min, mmol/kg/min
  if (unit === "µg/kg/min" || unit === "ng/kg/min" || unit === "mg/kg/min" || unit === "mmol/kg/min") {
    // rate [unit/kg/min] * weight [kg] * 60 [min/h] / concentration [unit/ml]
    // We need to normalise: µg → mg if concentration is in mg/ml
    let normalisedRate = rate;
    if (unit === "µg/kg/min") normalisedRate = rate / 1000; // µg → mg
    if (unit === "ng/kg/min") normalisedRate = rate / 1_000_000; // ng → mg
    // mmol/kg/min: concentration in mmol/ml, no conversion needed
    return (normalisedRate * weightKg * 60) / conc;
  }

  // Weight-based per-hour units: µg/kg/h, mg/kg/h, U/kg/h, mmol/kg/h
  if (unit === "µg/kg/h" || unit === "mg/kg/h" || unit === "U/kg/h" || unit === "mmol/kg/h") {
    let normalisedRate = rate;
    if (unit === "µg/kg/h") normalisedRate = rate / 1000;
    return (normalisedRate * weightKg) / conc;
  }

  // Non-weight per-minute: µg/min
  if (unit === "µg/min") {
    return (rate / 1000 * 60) / conc; // µg/min → mg/h → ml/h
  }

  // Non-weight per-hour: µg/h, mg/h, g/h, U/h, mmol/h
  if (unit === "µg/h") return (rate / 1000) / conc;
  if (unit === "mg/h") return rate / conc;
  if (unit === "g/h") return (rate * 1000) / conc;
  if (unit === "U/h") return rate / conc;
  if (unit === "mmol/h") return rate / conc;

  // Fallback — should never reach here with strict typing
  return rate;
}

/**
 * Format a time duration in minutes as "Xh MMm SSs".
 * Returns "24+" if duration exceeds 24 hours (DFU spec).
 */
export function formatTime(minutes: number | null): string {
  if (minutes === null) return "--:--:--";
  if (minutes > 1440) return "24+"; // DFU: show "24+" if > 24h
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  const s = Math.floor((minutes * 60) % 60);
  return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

/**
 * Compute time remaining in minutes given VTBI, volume infused, and current rate in ml/h.
 */
export function computeTimeRemaining(
  vtbi: number | null,
  volumeInfused: number,
  rateML_H: number
): number | null {
  if (vtbi === null || rateML_H <= 0) return null;
  return Math.max(0, ((vtbi - volumeInfused) / rateML_H) * 60);
}

/**
 * Clamp a rate value to within [RATE_MIN, RATE_MAX].
 * Returns { clamped, hitBoundary }.
 */
export function clampRate(value: number): { clamped: number; hitBoundary: boolean } {
  if (value < FACTORY_DEFAULTS.RATE_MIN) return { clamped: FACTORY_DEFAULTS.RATE_MIN, hitBoundary: true };
  if (value > FACTORY_DEFAULTS.RATE_MAX) return { clamped: FACTORY_DEFAULTS.RATE_MAX, hitBoundary: true };
  return { clamped: value, hitBoundary: false };
}

/**
 * Clamp a VTBI value to within [VTBI_MIN, VTBI_MAX].
 */
export function clampVtbi(value: number): number {
  return Math.max(FACTORY_DEFAULTS.VTBI_MIN, Math.min(FACTORY_DEFAULTS.VTBI_MAX, value));
}

/**
 * Clamp a pressure level to within [1, PRESSURE_MAX].
 */
export function clampPressure(value: number): number {
  return Math.max(1, Math.min(FACTORY_DEFAULTS.PRESSURE_MAX, value));
}

/**
 * Clamp a patient weight to within [WEIGHT_MIN, WEIGHT_MAX] kg.
 */
export function clampWeight(value: number): number {
  return Math.max(FACTORY_DEFAULTS.WEIGHT_MIN, Math.min(FACTORY_DEFAULTS.WEIGHT_MAX, value));
}
