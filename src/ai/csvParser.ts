/**
 * csvParser — parses a CSV file (produced by toCSV() in featureExtractor.ts)
 * into an array of DeviceRankingRecord for use by deviceAggregator.
 *
 * Handles:
 *  - Quoted fields (commas / newlines inside values)
 *  - Pipe-separated arrays (*_reasons columns)
 *  - Missing columns (default to 0 / 'unknown')
 *  - Malformed rows (skipped, counted)
 *  - Optional pump_model override (for single-device CSV files without that column)
 */

// ─── Record shape ─────────────────────────────────────────────────────────────

/** Subset of TrainingRecord used for device ranking aggregation. */
export interface DeviceRankingRecord {
  pump_model:               string;
  drug_id:                  string;
  drug_name:                string;
  risk_label:               'low' | 'medium' | 'high';
  risk_score:               number;
  composite_score:          number;
  design_score:             number;
  interaction_score:        number;
  configuration_score:      number;
  system_score:             number;
  grade:                    string;
  relative_error:           number;
  error_magnitude_ml_h:     number;
  confirmed_incorrect:      number;
  correction_count:         number;
  entry_time_ms:            number;
  boundary_hit_count:       number;
  golden_path_ratio:        number;
  drug_library_used:        number;
  guardrail_override:       number;
  guardrail_blocked:        number;
  guardrail_warning_shown:  number;
  vtbi_set:                 number;
  bolus_delivered:          number;
  battery_level_pct:        number;
  network_connected:        number;
  firmware_version_risk:    number;
  days_since_maintenance:   number;
  config_drift_score:       number;
  recent_occlusion_alarms:  number;
  alarms_during_session:    number;
}

export interface ParseResult {
  records:  DeviceRankingRecord[];
  /** Rows skipped due to parse errors or insufficient columns. */
  skipped:  number;
  /** Column names found in the header row. */
  columns:  string[];
}

// ─── CSV tokeniser ────────────────────────────────────────────────────────────

/**
 * Split one CSV line into fields, respecting RFC-4180 double-quoting.
 * Escaped double-quotes (`""`) inside quoted fields are preserved.
 */
function splitLine(line: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQ = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      fields.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

// ─── Parser ───────────────────────────────────────────────────────────────────

/**
 * Parse CSV text into DeviceRankingRecord[].
 *
 * @param text       - Raw UTF-8 CSV file content.
 * @param forceModel - If provided, overrides `pump_model` for every record.
 *                     Use this when uploading a single-device CSV that has no
 *                     pump_model column (e.g. exported from the Alaris session log).
 */
export function parseCSV(text: string, forceModel?: string): ParseResult {
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter(l => l.trim().length > 0);

  if (lines.length < 2) return { records: [], skipped: 0, columns: [] };

  const columns = splitLine(lines[0]).map(c => c.trim());
  const idx = Object.fromEntries(columns.map((c, i) => [c, i]));

  /** Get a string field value, defaulting to `def` if the column is absent. */
  function str(row: string[], col: string, def = ''): string {
    const i = idx[col];
    return i !== undefined ? (row[i] ?? def).trim() : def;
  }

  /** Get a numeric field value, defaulting to 0 for missing / non-numeric. */
  function num(row: string[], col: string): number {
    const v = str(row, col, '0');
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }

  const records: DeviceRankingRecord[] = [];
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const row = splitLine(lines[i]);
    if (row.length < 3) { skipped++; continue; }

    const pump_model = forceModel ?? str(row, 'pump_model', 'unknown');
    const risk_raw   = str(row, 'risk_label', 'low');
    const risk_label: 'low' | 'medium' | 'high' =
      risk_raw === 'high' ? 'high' : risk_raw === 'medium' ? 'medium' : 'low';

    records.push({
      pump_model,
      drug_id:                 str(row, 'drug_id',   'unknown'),
      drug_name:               str(row, 'drug_name', 'UNKNOWN'),
      risk_label,
      grade:                   str(row, 'grade', '?'),
      risk_score:              num(row, 'risk_score'),
      composite_score:         num(row, 'composite_score'),
      design_score:            num(row, 'design_score'),
      interaction_score:       num(row, 'interaction_score'),
      configuration_score:     num(row, 'configuration_score'),
      system_score:            num(row, 'system_score'),
      relative_error:          num(row, 'relative_error'),
      error_magnitude_ml_h:    num(row, 'error_magnitude_ml_h'),
      confirmed_incorrect:     num(row, 'confirmed_incorrect'),
      correction_count:        num(row, 'correction_count'),
      entry_time_ms:           num(row, 'entry_time_ms'),
      boundary_hit_count:      num(row, 'boundary_hit_count'),
      golden_path_ratio:       num(row, 'golden_path_ratio'),
      drug_library_used:       num(row, 'drug_library_used'),
      guardrail_override:      num(row, 'guardrail_override'),
      guardrail_blocked:       num(row, 'guardrail_blocked'),
      guardrail_warning_shown: num(row, 'guardrail_warning_shown'),
      vtbi_set:                num(row, 'vtbi_set'),
      bolus_delivered:         num(row, 'bolus_delivered'),
      battery_level_pct:       num(row, 'battery_level_pct'),
      network_connected:       num(row, 'network_connected'),
      firmware_version_risk:   num(row, 'firmware_version_risk'),
      days_since_maintenance:  num(row, 'days_since_maintenance'),
      config_drift_score:      num(row, 'config_drift_score'),
      recent_occlusion_alarms: num(row, 'recent_occlusion_alarms'),
      alarms_during_session:   num(row, 'alarms_during_session'),
    });
  }

  return { records, skipped, columns };
}
