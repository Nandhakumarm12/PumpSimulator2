/**
 * deviceRanker — converts per-device aggregate statistics into a ranked list.
 *
 * Ranking formula (lower rank_score = safer device):
 *
 *   rank_score = 0.30 × mean_risk_score
 *              + 0.25 × mean_relative_error    (capped at 1.0 in aggregator)
 *              + 0.20 × risk_high_pct
 *              + 0.15 × guardrail_override_pct
 *              + 0.10 × confirmed_incorrect_pct
 *
 * Grade thresholds (energy-label style):
 *   A+ ≤ 0.15 · A ≤ 0.25 · B ≤ 0.38 · C ≤ 0.52 · D ≤ 0.65 · E ≤ 0.80 · F > 0.80
 *
 * Sources:
 *   - Weight rationale: CLAUDE.md Section 9 labelling rules (relative priority)
 *   - Relative error weight: Thimbleby & Cairns (2010) — dose accuracy primary metric
 *   - Override weight: Cauchi et al. (2011) — guardrail override is highest-risk event
 */

import type { DeviceStats } from './deviceAggregator';

export type RankGrade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

/** DeviceStats extended with ranking outputs. */
export interface RankedDevice extends DeviceStats {
  /** Composite ranking score (0–1). Lower = safer. */
  rank_score:  number;
  /** Position in the ranking. 1 = safest. */
  rank:        number;
  /** Energy-label style grade derived from rank_score. */
  rank_grade:  RankGrade;
}

// ─── Grade assignment ─────────────────────────────────────────────────────────

function gradeFromScore(s: number): RankGrade {
  if (s <= 0.15) return 'A+';
  if (s <= 0.25) return 'A';
  if (s <= 0.38) return 'B';
  if (s <= 0.52) return 'C';
  if (s <= 0.65) return 'D';
  if (s <= 0.80) return 'E';
  return 'F';
}

// ─── Ranker ───────────────────────────────────────────────────────────────────

/**
 * Rank an array of DeviceStats by composite safety score.
 *
 * @param stats - Per-device statistics from aggregateByDevice().
 * @returns     - Same devices extended with rank, rank_score, rank_grade,
 *                sorted safest-first (rank 1 = lowest rank_score).
 */
export function rankDevices(stats: DeviceStats[]): RankedDevice[] {
  const scored: RankedDevice[] = stats.map(s => ({
    ...s,
    rank_score:
      0.30 * s.mean_risk_score +
      0.25 * s.mean_relative_error +
      0.20 * s.risk_high_pct +
      0.15 * s.guardrail_override_pct +
      0.10 * s.confirmed_incorrect_pct,
    rank:       0,           // assigned after sort
    rank_grade: 'F' as RankGrade,   // assigned after sort
  }));

  scored.sort((a, b) => a.rank_score - b.rank_score);

  scored.forEach((d, i) => {
    d.rank       = i + 1;
    d.rank_grade = gradeFromScore(d.rank_score);
  });

  return scored;
}

/** Human-readable display names for pump_model identifiers. */
export const MODEL_DISPLAY: Record<string, string> = {
  alaris_gp:        'Alaris GP',
  braun_infusomat:  'B. Braun',
  graseby_3100:     'Graseby 3100',
};

export function modelDisplayName(model: string): string {
  return MODEL_DISPLAY[model] ?? model;
}

/** Per-grade accent colour (hex). */
export const GRADE_COLOR: Record<RankGrade, string> = {
  'A+': '#00cc66',
  'A':  '#3aff3a',
  'B':  '#aadd44',
  'C':  '#ffcc00',
  'D':  '#ff8800',
  'E':  '#ff4444',
  'F':  '#cc0022',
};
