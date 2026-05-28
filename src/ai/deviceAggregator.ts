/**
 * deviceAggregator — groups DeviceRankingRecord[] by pump_model and computes
 * per-device aggregate statistics across all four risk layers.
 *
 * Optionally filters to a single drug_id before aggregating, enabling
 * drug-specific comparisons: "for morphine, is Alaris safer than B. Braun?"
 */

import type { DeviceRankingRecord } from './csvParser';

// ─── Output shape ─────────────────────────────────────────────────────────────

export interface DeviceStats {
  pump_model:   string;
  /** The drug_id filter that produced this record, or null for all drugs. */
  drug_filter:  string | null;
  session_count: number;

  // ── Risk distribution ──────────────────────────────────────────────────────
  risk_low_pct:    number;   // 0–1
  risk_medium_pct: number;
  risk_high_pct:   number;
  mean_risk_score:          number;
  mean_composite_score:     number;

  // ── Layer 0: Design ────────────────────────────────────────────────────────
  mean_design_score: number;

  // ── Layer 1: Interaction ───────────────────────────────────────────────────
  mean_interaction_score:   number;
  mean_relative_error:      number;  // capped at 1.0 before averaging
  mean_error_magnitude_ml_h: number;
  confirmed_incorrect_pct:  number;  // 0–1
  mean_correction_count:    number;
  mean_entry_time_ms:       number;
  mean_boundary_hits:       number;
  mean_golden_path_ratio:   number;

  // ── Layer 2: Configuration ─────────────────────────────────────────────────
  mean_configuration_score: number;
  drug_library_used_pct:    number;
  guardrail_override_pct:   number;
  guardrail_blocked_pct:    number;
  guardrail_warning_pct:    number;
  vtbi_set_pct:             number;
  bolus_delivered_pct:      number;

  // ── Layer 3: System ────────────────────────────────────────────────────────
  mean_system_score:        number;
  mean_battery_pct:         number;
  network_connected_pct:    number;
  firmware_cve_pct:         number;
  mean_days_maintenance:    number;
  mean_config_drift:        number;
  mean_occlusion_alarms:    number;

  /** All unique drug_ids seen in the records for this device. */
  drugs_seen: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mean(arr: number[]): number {
  return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

/** Average over a 0|1 field — equivalent to computing a percentage. */
function meanBinary(arr: number[]): number {
  return mean(arr);
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

/**
 * Aggregate records into per-device statistics.
 *
 * @param records    - All loaded DeviceRankingRecords (may span multiple devices).
 * @param drugFilter - If set, only records with this drug_id are considered.
 *                     Pass null to include all drugs.
 * @returns One DeviceStats per unique pump_model found in the filtered records.
 */
export function aggregateByDevice(
  records: DeviceRankingRecord[],
  drugFilter: string | null,
): DeviceStats[] {
  const working = drugFilter
    ? records.filter(r => r.drug_id === drugFilter)
    : records;

  // Group by pump_model
  const byModel = new Map<string, DeviceRankingRecord[]>();
  for (const r of working) {
    const bucket = byModel.get(r.pump_model) ?? [];
    bucket.push(r);
    byModel.set(r.pump_model, bucket);
  }

  const result: DeviceStats[] = [];

  for (const [pump_model, recs] of byModel.entries()) {
    const n = recs.length;

    result.push({
      pump_model,
      drug_filter: drugFilter,
      session_count: n,

      // Risk
      risk_low_pct:    recs.filter(r => r.risk_label === 'low').length    / n,
      risk_medium_pct: recs.filter(r => r.risk_label === 'medium').length / n,
      risk_high_pct:   recs.filter(r => r.risk_label === 'high').length   / n,
      mean_risk_score:          mean(recs.map(r => r.risk_score)),
      mean_composite_score:     mean(recs.map(r => r.composite_score)),

      // Layer 0
      mean_design_score:        mean(recs.map(r => r.design_score)),

      // Layer 1
      mean_interaction_score:   mean(recs.map(r => r.interaction_score)),
      mean_relative_error:      mean(recs.map(r => Math.min(r.relative_error, 1.0))),
      mean_error_magnitude_ml_h: mean(recs.map(r => r.error_magnitude_ml_h)),
      confirmed_incorrect_pct:  meanBinary(recs.map(r => r.confirmed_incorrect)),
      mean_correction_count:    mean(recs.map(r => r.correction_count)),
      mean_entry_time_ms:       mean(recs.map(r => r.entry_time_ms)),
      mean_boundary_hits:       mean(recs.map(r => r.boundary_hit_count)),
      mean_golden_path_ratio:   mean(recs.map(r => r.golden_path_ratio)),

      // Layer 2
      mean_configuration_score: mean(recs.map(r => r.configuration_score)),
      drug_library_used_pct:    meanBinary(recs.map(r => r.drug_library_used)),
      guardrail_override_pct:   meanBinary(recs.map(r => r.guardrail_override)),
      guardrail_blocked_pct:    meanBinary(recs.map(r => r.guardrail_blocked)),
      guardrail_warning_pct:    meanBinary(recs.map(r => r.guardrail_warning_shown)),
      vtbi_set_pct:             meanBinary(recs.map(r => r.vtbi_set)),
      bolus_delivered_pct:      meanBinary(recs.map(r => r.bolus_delivered)),

      // Layer 3
      mean_system_score:        mean(recs.map(r => r.system_score)),
      mean_battery_pct:         mean(recs.map(r => r.battery_level_pct)),
      network_connected_pct:    meanBinary(recs.map(r => r.network_connected)),
      firmware_cve_pct:         meanBinary(recs.map(r => r.firmware_version_risk)),
      mean_days_maintenance:    mean(recs.map(r => r.days_since_maintenance)),
      mean_config_drift:        mean(recs.map(r => r.config_drift_score)),
      mean_occlusion_alarms:    mean(recs.map(r => r.recent_occlusion_alarms)),

      drugs_seen: [...new Set(recs.map(r => r.drug_id))].sort(),
    });
  }

  return result;
}

/**
 * Return all unique drug_ids from a record set, sorted alphabetically.
 * Used to populate the drug-filter dropdown in the UI.
 */
export function getUniqueDrugs(records: DeviceRankingRecord[]): string[] {
  return [...new Set(records.map(r => r.drug_id))].sort();
}
