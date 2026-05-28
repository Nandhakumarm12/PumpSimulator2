/**
 * Dataset builder — generates N synthetic training records by driving
 * the pure pump state machine programmatically (no React, no timers).
 *
 * ARCHITECTURE ROLE:
 *   This is the central assembly point for all four layers of the risk model:
 *     Layer 0 (Design):        computeDesignScore()    from deviceDesign.ts
 *     Layer 1 (Interaction):   applyLabellingRules()   from labellingRules.ts (R01-R02, R08, R10, R14-R15, R21)
 *     Layer 2 (Configuration): applyLabellingRules()   from labellingRules.ts (R03-R04, R07, R11-R13)
 *     Layer 3 (System):        applyLabellingRules()   from labellingRules.ts (R05-R06, R16-R20)
 *   After Step 2, design_score is populated with a real per-device value (not 0.0 placeholder).
 *   composite_score is then recomputed: 0.20×design + 0.30×interaction + 0.25×configuration + 0.25×system.
 *
 * Source: CLAUDE.md Section 12, Step 3 — "Build the AI pipeline".
 * Each record represents one complete simulated nurse–pump interaction session.
 * Run via: npm run generate   (entry point: vite-node src/ai/datasetBuilder.ts)
 * NO React imports allowed in this file.
 */

import type { PumpState, SessionLogEntry } from '../pump/types';
import * as SM from '../pump/stateMachine';
import { FACTORY_DEFAULTS } from '../pump/constants';
import { DRUG_LIBRARY } from '../pump/drugLibrary';
import { rateToMlH } from '../pump/display';
import type { Drug } from '../pump/types';

import {
  SCENARIO_PROFILES,
  generateDeviceContext,
  makeLcg,
  randInt,
  randFloat,
  makeSessionId,
  type ScenarioProfile,
} from './scenarioGenerator';
import { extractFeatures, toCSV, type TrainingRecord } from './featureExtractor';
import { applyLabellingRules } from './labellingRules';
import { computeDesignScore } from './deviceDesign';

// ─── Session simulation ───────────────────────────────────────────────────────

/** Mutable log builder used only inside the pure simulation (not the React hook). */
type MutableLog = SessionLogEntry[];

/**
 * Simulate chevron presses to move from the current rateBuffer towards targetBuffer.
 * Generates realistic log entries including corrections and boundary hits.
 *
 * @param state             - Current pump state (must be in RATE_ENTRY-compatible screen)
 * @param log               - Mutable log to append entries to
 * @param targetBuffer      - Desired final rateBuffer value (in drug units)
 * @param tsRef             - Timestamp counter (incremented per keypress)
 * @param keypressMs        - Time between keypresses (ms)
 * @param corrProb          - Probability of inserting a direction reversal
 * @param rng               - Deterministic random number generator
 * @returns Updated pump state after all chevron presses
 */
function simulateRateEntry(
  state: PumpState,
  log: MutableLog,
  targetBuffer: number,
  tsRef: { t: number },
  keypressMs: number,
  corrProb: number,
  rng: () => number
): PumpState {
  let s = state;

  // Optionally insert one "wrong direction" overshoot then correct
  const addCorrection = rng() < corrProb;

  if (addCorrection) {
    // Overshoot in the wrong direction first (1–3 small steps)
    const wrongDir = s.rateBuffer >= targetBuffer ? +1 : -1;
    const wrongSteps = randInt(1, 3, rng);
    for (let i = 0; i < wrongSteps; i++) {
      const delta = wrongDir * FACTORY_DEFAULTS.STEP_SMALL;
      const res = SM.adjustChevron(s, delta, tsRef.t, log);
      s = res.state;
      log.push(...res.logEntries);
      tsRef.t += keypressMs + Math.floor(rng() * keypressMs * 0.2);
    }
  }

  // Main adjustment loop: use large steps first, then small steps.
  // NOTE: targetBuffer must be an integer (caller's responsibility) because
  // STEP_SMALL=1. A fractional target would oscillate indefinitely.
  let iterations = 0;
  let prevBuffer = s.rateBuffer - 999; // sentinel
  let prevPrevBuffer = s.rateBuffer - 998; // for 2-step cycle detection
  while (Math.abs(+(s.rateBuffer - targetBuffer).toFixed(1)) >= 0.5 && iterations < 300) {
    iterations++;

    // Detect stall: no progress or 2-step cycle (value oscillates between two levels)
    if (s.rateBuffer === prevBuffer || s.rateBuffer === prevPrevBuffer) break;
    prevPrevBuffer = prevBuffer;
    prevBuffer = s.rateBuffer;

    const diff = +(targetBuffer - s.rateBuffer).toFixed(1);
    let delta: number;

    if (Math.abs(diff) >= FACTORY_DEFAULTS.STEP_LARGE) {
      delta = diff > 0 ? +FACTORY_DEFAULTS.STEP_LARGE : -FACTORY_DEFAULTS.STEP_LARGE;
    } else {
      delta = diff > 0 ? +FACTORY_DEFAULTS.STEP_SMALL : -FACTORY_DEFAULTS.STEP_SMALL;
    }

    const res = SM.adjustChevron(s, delta, tsRef.t, log);
    s = res.state;
    log.push(...res.logEntries);
    tsRef.t += keypressMs + Math.floor(rng() * keypressMs * 0.1);

    // Guard: boundary hit means we can't advance further in this direction
    if (res.logEntries.some(e => e.event === "boundary_hit")) break;
  }

  return s;
}

/**
 * Pick a target rate for a drug, within clinically plausible range.
 * IMPORTANT: Returns integer rates only. The simulator uses STEP_SMALL=1 in
 * drug units, so fractional targets cause infinite oscillation in the
 * simulation loop (unable to reach 0.3 by stepping ±1).
 * Drugs with very small softMax values (adrenaline, noradrenaline) use
 * rates of 1–10 as display-unit integers, as the Alaris GP would display
 * these rounded to the nearest integer in the dose-unit display.
 */
function pickIntendedRate(drug: Drug, _profile: ScenarioProfile, rng: () => number): number {
  // For MANUAL mode drugs, rates can be very high
  if (drug.id === "manual") {
    return randInt(10, 400, rng);
  }
  // For library drugs: target must be reachable with integer step from defaultRate
  // Use integer soft-limit bounds (minimum 1 to avoid boundary-lock at RATE_MIN)
  const softMinInt = Math.max(1, Math.ceil(drug.softMin));
  const softMaxInt = Math.max(softMinInt + 1, Math.floor(drug.softMax));
  const hardMaxInt = Math.max(softMaxInt + 1, Math.floor(drug.hardMax));

  const inSoftRange = rng() > 0.15;
  if (inSoftRange) {
    return randInt(softMinInt, softMaxInt, rng);
  }
  // Occasionally just above soft max (triggers guardrail warning)
  return randInt(softMaxInt + 1, Math.min(softMaxInt + 5, hardMaxInt), rng);
}

/** Apply a random error factor to a target rate to simulate mis-entry.
 *  Returns integer to avoid oscillation in the chevron simulation loop.
 */
function applyRateError(target: number, maxError: number, rng: () => number): number {
  const errorFactor = randFloat(-maxError, +maxError, rng);
  const raw = Math.max(FACTORY_DEFAULTS.RATE_MIN, target * (1 + errorFactor));
  // Round to integer so the simulation loop can reach it exactly with step=1
  return Math.max(1, Math.round(raw));
}

/**
 * Simulate a complete nurse–pump interaction session.
 * Drives the pure state machine without any React or timers.
 *
 * Returns the session log, final pump state, intended rate, and alarms triggered.
 */
function simulateSession(
  profile: ScenarioProfile,
  recordIndex: number,
  rng: () => number
): {
  log: MutableLog;
  finalState: PumpState;
  intendedRateMlH: number;
  alarmsDuring: number;
} {
  const log: MutableLog = [];
  const tsRef = { t: 0 };
  const keypressMs = profile.behaviour.keypress_interval_ms;

  let s: PumpState = SM.getInitialState();

  // 1. Language select
  {
    const res = SM.selectLanguage(s, tsRef.t);
    s = res.state;
    log.push(...res.logEntries);
    tsRef.t += keypressMs;
  }

  // 2. Drug selection
  // For simulation stability, exclude drugs whose softMax < STEP_LARGE (= 10).
  // These drugs (adrenaline µg/kg/min softMax=0.5, noradrenaline softMax=0.3) have
  // clinically tiny rates that cannot be represented with integer STEP_SMALL=1 steps.
  // The Alaris GP uses fractional display steps for these drugs in real use, but our
  // simulator fixes steps at 1. Excluding them from batch simulation; they are still
  // exercised in the interactive pump UI.
  const SIMULABLE_DRUGS = DRUG_LIBRARY.filter(
    d => d.id === "manual" || d.softMax >= FACTORY_DEFAULTS.STEP_LARGE
  );

  let drug: Drug;
  if (profile.behaviour.force_manual) {
    drug = DRUG_LIBRARY[0]; // MANUAL
  } else {
    // Random drug from simulable subset (skip MANUAL at index 0)
    const simulableNonManual = SIMULABLE_DRUGS.filter(d => d.id !== "manual");
    const drugIndex = randInt(0, simulableNonManual.length - 1, rng);
    drug = simulableNonManual[drugIndex];
  }

  // Navigate cursor to drug
  const drugIndex = DRUG_LIBRARY.indexOf(drug);
  for (let i = 0; i < drugIndex; i++) {
    const res = SM.moveDrugCursor(s, 1);
    s = res.state;
    tsRef.t += keypressMs;
  }

  {
    const res = SM.confirmDrugSelection(s, tsRef.t);
    s = res.state;
    log.push(...res.logEntries);
    tsRef.t += keypressMs;
  }

  // 3. Weight entry (if weight-based drug)
  if (s.screen === "WEIGHT_ENTRY") {
    // Sometimes adjust weight (70 ± 20 kg)
    const newWeight = randInt(50, 100, rng);
    const steps = newWeight - FACTORY_DEFAULTS.WEIGHT_DEFAULT;
    const dir = steps > 0 ? 1 : -1;
    for (let i = 0; i < Math.abs(steps); i++) {
      const res = SM.adjustChevron(s, dir * FACTORY_DEFAULTS.STEP_SMALL, tsRef.t, log);
      s = res.state;
      tsRef.t += 80; // faster stepping for weight entry
    }
    const res = SM.confirmWeight(s, tsRef.t);
    s = res.state;
    log.push(...res.logEntries);
    tsRef.t += keypressMs;
  }

  if (s.screen !== "RATE_ENTRY") {
    // Unexpected state — return what we have
    return { log, finalState: s, intendedRateMlH: 0, alarmsDuring: 0 };
  }

  // 4. Optionally set VTBI
  const setVtbi = rng() > profile.behaviour.vtbi_omission_rate;
  if (setVtbi) {
    {
      const res = SM.openVtbiEntry(s, tsRef.t);
      s = res.state;
      tsRef.t += keypressMs;
    }
    // Set VTBI to a random value (50–500 ml)
    const vtbiTarget = randInt(50, 500, rng);
    s = simulateRateEntry(s, log, vtbiTarget, tsRef, keypressMs * 0.5, 0.02, rng);
    {
      const res = SM.confirmVtbi(s, tsRef.t);
      s = res.state;
      log.push(...res.logEntries);
      tsRef.t += keypressMs;
    }
  }

  // 5. Rate entry with realistic errors
  const intendedRateInUnits = pickIntendedRate(drug, profile, rng);
  const finalRateInUnits    = applyRateError(intendedRateInUnits, profile.behaviour.max_rate_error, rng);

  s = simulateRateEntry(
    s,
    log,
    finalRateInUnits,
    tsRef,
    keypressMs,
    profile.behaviour.correction_probability,
    rng
  );

  // 6. Press RUN
  let alarmsDuring = 0;
  {
    const res = SM.pressRun(s, tsRef.t);
    s = res.state;
    log.push(...res.logEntries);
    tsRef.t += keypressMs;
  }

  // 7. Handle guardrail screens
  if (s.screen === "GUARDRAIL_WARNING") {
    if (rng() < profile.behaviour.override_probability) {
      const res = SM.overrideGuardrail(s, tsRef.t);
      s = res.state;
      log.push(...res.logEntries);
    } else {
      // Re-enter: adjust rate slightly downward then RUN again
      const res = SM.reEnterRate(s, tsRef.t);
      s = res.state;
      log.push(...res.logEntries);
      tsRef.t += keypressMs;
      // Bring rate inside soft limits (integer to avoid simulation oscillation)
      const safeRate = Math.max(1, Math.floor(drug.softMax * 0.9));
      s = simulateRateEntry(s, log, safeRate, tsRef, keypressMs, 0, rng);
      const res2 = SM.pressRun(s, tsRef.t);
      s = res2.state;
      log.push(...res2.logEntries);
    }
    tsRef.t += keypressMs;
  } else if (s.screen === "GUARDRAIL_BLOCKED") {
    // Must re-enter — drop to just below hard max (integer to avoid oscillation)
    const res = SM.reEnterRate(s, tsRef.t);
    s = res.state;
    log.push(...res.logEntries);
    tsRef.t += keypressMs;
    const safeRate = Math.max(1, Math.floor(drug.hardMax * 0.85));
    s = simulateRateEntry(s, log, safeRate, tsRef, keypressMs, 0, rng);
    const res2 = SM.pressRun(s, tsRef.t);
    s = res2.state;
    log.push(...res2.logEntries);
    tsRef.t += keypressMs;
  }

  // 8. Simulate a brief period of infusion (a few ticks to accumulate volume)
  if (s.screen === "RUNNING") {
    const tickCount = randInt(2, 8, rng);
    for (let i = 0; i < tickCount; i++) {
      const res = SM.infusionTick(s, tsRef.t);
      if (res.logEntries.some(e => e.event === "alarm_triggered")) alarmsDuring++;
      s = res.state;
      log.push(...res.logEntries);
      tsRef.t += FACTORY_DEFAULTS.INFUSION_TICK_MS;
    }
  }

  // Convert intended rate to ml/h for the feature record
  const intendedRateMlH = +rateToMlH(
    intendedRateInUnits,
    drug,
    s.patientWeight
  ).toFixed(3);

  // Log session end
  log.push(SM.makeLogEntry(tsRef.t, s.screen, "session_end"));

  return { log, finalState: s, intendedRateMlH, alarmsDuring };
}

// ─── Dataset generation ───────────────────────────────────────────────────────

/**
 * Generate N synthetic TrainingRecords.
 * Records are distributed across the 4 scenario profiles.
 * A deterministic seed can be provided for reproducibility.
 *
 * @param n    - Number of records to generate (default: 500)
 * @param seed - RNG seed for reproducibility (default: 42)
 */
export function generateDataset(n = 500, seed = 42): TrainingRecord[] {
  const rng = makeLcg(seed);
  const records: TrainingRecord[] = [];
  const profileCount = SCENARIO_PROFILES.length;

  // Build weighted cumulative distribution for profile selection
  const totalWeight = SCENARIO_PROFILES.reduce((s, p) => s + p.weight, 0);
  const cumWeights  = SCENARIO_PROFILES.reduce<number[]>((acc, p) => {
    acc.push((acc[acc.length - 1] ?? 0) + p.weight / totalWeight);
    return acc;
  }, []);

  for (let i = 0; i < n; i++) {
    // Weighted random profile selection (tuned for ~30/40/30 distribution)
    const roll         = rng();
    const profileIndex = cumWeights.findIndex(w => roll <= w);
    const profile      = SCENARIO_PROFILES[Math.min(profileIndex, profileCount - 1)];

    const recordId = `alaris_${String(i + 1).padStart(4, "0")}_${profile.id}`;

    // Each session gets its own sub-RNG derived from the main rng + index
    const sessionSeed = Math.floor(rng() * 0xffffffff);
    const sessionRng  = makeLcg(sessionSeed);

    // Generate device context
    const deviceContext = generateDeviceContext(profile, recordId, sessionRng);
    // Refresh session_id with this session's index
    (deviceContext as { session_id: string }).session_id = makeSessionId(i, Date.now() + i);

    // Simulate the session
    const { log, finalState, intendedRateMlH, alarmsDuring } = simulateSession(
      profile,
      i,
      sessionRng
    );

    // Extract features
    const partial = extractFeatures(log, finalState, deviceContext, intendedRateMlH, alarmsDuring);

    // Apply labelling rules (returns risk fields + layer 1/2/3 scores; design_score = 0 placeholder)
    const labelResult = applyLabellingRules(partial);

    // Layer 0: compute design score from device model registry (Step 2)
    const designResult = computeDesignScore(deviceContext.pump_model);

    // Recompute composite_score with the real design_score (0.20 weight)
    // Formula: 0.20 × design + 0.30 × interaction + 0.25 × configuration + 0.25 × system
    const composite_score = +Math.min(1.0, +(
      0.20 * designResult.score +
      0.30 * labelResult.interaction_score +
      0.25 * labelResult.configuration_score +
      0.25 * labelResult.system_score
    ).toFixed(3));

    // Re-derive grade from updated composite_score
    let grade: TrainingRecord['grade'];
    if (composite_score <= 0.10)      grade = 'A+';
    else if (composite_score <= 0.20) grade = 'A';
    else if (composite_score <= 0.35) grade = 'B';
    else if (composite_score <= 0.50) grade = 'C';
    else if (composite_score <= 0.65) grade = 'D';
    else if (composite_score <= 0.80) grade = 'E';
    else                              grade = 'F';

    // Re-derive risk_label from updated grade
    let risk_label: TrainingRecord['risk_label'];
    if (grade === 'A+' || grade === 'A' || grade === 'B') risk_label = 'low';
    else if (grade === 'C' || grade === 'D')              risk_label = 'medium';
    else                                                  risk_label = 'high';

    records.push({
      ...partial,
      ...labelResult,
      design_score:    designResult.score,
      design_reasons:  designResult.reasons,
      composite_score,
      grade,
      risk_label,
      risk_score:      composite_score,
    });
  }

  return records;
}

/**
 * Summarise risk label distribution across a generated dataset.
 * Used for validation: target distribution ~30% low / 40% medium / 30% high.
 */
export function summariseDistribution(records: TrainingRecord[]): {
  total: number;
  low:    { count: number; pct: string };
  medium: { count: number; pct: string };
  high:   { count: number; pct: string };
} {
  const total  = records.length;
  const low    = records.filter(r => r.risk_label === "low").length;
  const medium = records.filter(r => r.risk_label === "medium").length;
  const high   = records.filter(r => r.risk_label === "high").length;
  const pct = (n: number) => ((n / total) * 100).toFixed(1) + "%";
  return {
    total,
    low:    { count: low,    pct: pct(low) },
    medium: { count: medium, pct: pct(medium) },
    high:   { count: high,   pct: pct(high) },
  };
}

// ─── B. Braun Infusomat Space dataset generation ──────────────────────────────

import * as BraunSM from '../pump/braun/braunStateMachine';
import { BRAUN_DEFAULTS } from '../pump/braun/braunConstants';
import { BRAUN_DRUG_LIBRARY } from '../pump/braun/braunDrugLibrary';
import type { BraunPumpState, BraunSessionLogEntry } from '../pump/braun/braunTypes';
import type { BraunTrainingRecord } from './braunRules';
import { applyBraunRules, computeBraunRuleScore, deriveBraunRiskLabel } from './braunRules';

/** Mutable log builder for B. Braun simulation sessions. */
type BraunMutableLog = BraunSessionLogEntry[];

/**
 * Simulate chevron presses on the B. Braun pump to move rate towards targetBuffer.
 * Mirrors simulateRateEntry() from the Alaris GP but uses B. Braun state machine.
 *
 * @param state      - Current B. Braun pump state (must be in RATE_ENTRY)
 * @param log        - Mutable log to append entries to
 * @param targetRate - Desired final rate value (must be an integer for step=1 convergence)
 * @param tsRef      - Timestamp counter reference (incremented per keypress)
 * @param keypressMs - Average time between keypresses in ms
 * @param corrProb   - Probability of inserting a direction reversal (correction)
 * @param rng        - Deterministic random number generator
 * @returns Updated B. Braun pump state after all chevron presses
 */
function simulateBraunRateEntry(
  state: BraunPumpState,
  log: BraunMutableLog,
  targetRate: number,
  tsRef: { t: number },
  keypressMs: number,
  corrProb: number,
  rng: () => number
): BraunPumpState {
  let s = state;

  // Optionally insert one wrong-direction overshoot then correct
  const addCorrection = rng() < corrProb;
  if (addCorrection) {
    const wrongDir = s.rate >= targetRate ? +1 : -1;
    const wrongSteps = randInt(1, 3, rng);
    for (let i = 0; i < wrongSteps; i++) {
      const delta = wrongDir * BRAUN_DEFAULTS.STEP_SMALL;
      const res = BraunSM.adjustChevron(s, delta, tsRef.t, log);
      s = res.state;
      log.push(...res.logEntries);
      tsRef.t += keypressMs + Math.floor(rng() * keypressMs * 0.2);
    }
  }

  // Main adjustment loop
  let iterations = 0;
  let prevRate = s.rate - 999;
  let prevPrevRate = s.rate - 998;
  while (Math.abs(+(s.rate - targetRate).toFixed(1)) >= 0.5 && iterations < 300) {
    iterations++;
    if (s.rate === prevRate || s.rate === prevPrevRate) break;
    prevPrevRate = prevRate;
    prevRate = s.rate;

    const diff = +(targetRate - s.rate).toFixed(1);
    let delta: number;
    if (Math.abs(diff) >= BRAUN_DEFAULTS.STEP_LARGE) {
      delta = diff > 0 ? +BRAUN_DEFAULTS.STEP_LARGE : -BRAUN_DEFAULTS.STEP_LARGE;
    } else {
      delta = diff > 0 ? +BRAUN_DEFAULTS.STEP_SMALL : -BRAUN_DEFAULTS.STEP_SMALL;
    }

    const res = BraunSM.adjustChevron(s, delta, tsRef.t, log);
    s = res.state;
    log.push(...res.logEntries);
    tsRef.t += keypressMs + Math.floor(rng() * keypressMs * 0.1);

    if (res.logEntries.some(e => e.event === 'boundary_hit')) break;
  }

  return s;
}

/**
 * Simulate a complete B. Braun nurse–pump interaction session.
 *
 * Drives the pure B. Braun state machine without React or timers.
 * Handles the three-tier guardrail system including advisory acknowledgement.
 *
 * @param profile      - Scenario profile defining device state and behaviour
 * @param _recordIndex - Record index (unused but kept for API consistency with Alaris GP)
 * @param rng          - Deterministic RNG for this session
 * @returns Session log, final state, intended rate, and alarm count
 */
function simulateBraunSession(
  profile: ScenarioProfile,
  _recordIndex: number,
  rng: () => number
): {
  log: BraunMutableLog;
  finalState: BraunPumpState;
  intendedRateMlH: number;
  alarmsDuring: number;
} {
  const log: BraunMutableLog = [];
  const tsRef = { t: 0 };
  const keypressMs = profile.behaviour.keypress_interval_ms;

  let s: BraunPumpState = BraunSM.getInitialBraunState();

  // 1. Boot sequence (STARTUP → DRUG_SELECT)
  {
    const res = BraunSM.completeBoot(s, tsRef.t);
    s = res.state;
    log.push(...res.logEntries);
    tsRef.t += keypressMs;
  }

  // 2. Drug selection — same simulable drugs as Alaris GP for comparability
  const SIMULABLE_BRAUN_DRUGS = BRAUN_DRUG_LIBRARY.filter(
    d => d.id === 'manual' || d.softMax >= BRAUN_DEFAULTS.STEP_LARGE
  );

  let selectedDrug = BRAUN_DRUG_LIBRARY[0]; // fallback to MANUAL
  if (profile.behaviour.force_manual) {
    selectedDrug = BRAUN_DRUG_LIBRARY[0]; // MANUAL
  } else {
    const nonManual = SIMULABLE_BRAUN_DRUGS.filter(d => d.id !== 'manual');
    const idx = randInt(0, nonManual.length - 1, rng);
    selectedDrug = nonManual[idx];
  }

  // Navigate cursor to drug
  const drugIdx = BRAUN_DRUG_LIBRARY.indexOf(selectedDrug);
  for (let i = 0; i < drugIdx; i++) {
    const res = BraunSM.moveDrugCursor(s, 1);
    s = res.state;
    tsRef.t += keypressMs;
  }
  {
    const res = BraunSM.confirmDrugSelection(s, tsRef.t);
    s = res.state;
    log.push(...res.logEntries);
    tsRef.t += keypressMs;
  }

  if (s.screen !== 'RATE_ENTRY') {
    return { log, finalState: s, intendedRateMlH: 0, alarmsDuring: 0 };
  }

  // 3. Optionally set VTBI
  const setVtbi = rng() > profile.behaviour.vtbi_omission_rate;
  if (setVtbi) {
    {
      const res = BraunSM.openVtbiEntry(s, tsRef.t);
      s = res.state;
      tsRef.t += keypressMs;
    }
    const vtbiTarget = randInt(50, 500, rng);
    s = simulateBraunRateEntry(s, log, vtbiTarget, tsRef, keypressMs * 0.5, 0.02, rng);
    {
      const res = BraunSM.confirmVtbi(s, vtbiTarget, tsRef.t);
      s = res.state;
      log.push(...res.logEntries);
      tsRef.t += keypressMs;
    }
  }

  // 4. Rate entry
  const softMinInt = Math.max(1, Math.ceil(selectedDrug.softMin));
  const softMaxInt = Math.max(softMinInt + 1, Math.floor(selectedDrug.softMax));
  const hardMaxInt = Math.max(softMaxInt + 1, Math.floor(selectedDrug.hardMax));

  let intendedRateInUnits: number;
  if (selectedDrug.id === 'manual') {
    intendedRateInUnits = randInt(10, 400, rng);
  } else {
    const inSoft = rng() > 0.15;
    intendedRateInUnits = inSoft
      ? randInt(softMinInt, softMaxInt, rng)
      : randInt(softMaxInt + 1, Math.min(softMaxInt + 5, hardMaxInt), rng);
  }

  const errorFactor = randFloat(-profile.behaviour.max_rate_error, +profile.behaviour.max_rate_error, rng);
  const rawFinalRate = Math.max(BRAUN_DEFAULTS.RATE_MIN, intendedRateInUnits * (1 + errorFactor));
  const finalRateInUnits = Math.max(1, Math.round(rawFinalRate));

  s = simulateBraunRateEntry(
    s, log, finalRateInUnits, tsRef, keypressMs, profile.behaviour.correction_probability, rng
  );

  // 5. Press RUN
  let alarmsDuring = 0;
  {
    const res = BraunSM.pressRun(s, selectedDrug, s.patientWeightKg, tsRef.t);
    s = res.state;
    log.push(...res.logEntries);
    tsRef.t += keypressMs;
  }

  // 6. Handle guardrail screens (three-tier)
  if (s.screen === 'GUARDRAIL_ADVISORY') {
    // Advisory: acknowledge and continue
    const res = BraunSM.acknowledgeAdvisory(s, selectedDrug, tsRef.t);
    s = res.state;
    log.push(...res.logEntries);
    tsRef.t += keypressMs;
  } else if (s.screen === 'GUARDRAIL_WARNING') {
    if (rng() < profile.behaviour.override_probability) {
      const res = BraunSM.overrideGuardrail(s, selectedDrug, tsRef.t);
      s = res.state;
      log.push(...res.logEntries);
    } else {
      const res = BraunSM.reEnterRate(s, tsRef.t);
      s = res.state;
      log.push(...res.logEntries);
      tsRef.t += keypressMs;
      const safeRate = Math.max(1, Math.floor(selectedDrug.softMax * 0.9));
      s = simulateBraunRateEntry(s, log, safeRate, tsRef, keypressMs, 0, rng);
      const res2 = BraunSM.pressRun(s, selectedDrug, s.patientWeightKg, tsRef.t);
      s = res2.state;
      log.push(...res2.logEntries);
    }
    tsRef.t += keypressMs;
  } else if (s.screen === 'GUARDRAIL_BLOCKED') {
    const res = BraunSM.reEnterRate(s, tsRef.t);
    s = res.state;
    log.push(...res.logEntries);
    tsRef.t += keypressMs;
    const safeRate = Math.max(1, Math.floor(selectedDrug.hardMax * 0.85));
    s = simulateBraunRateEntry(s, log, safeRate, tsRef, keypressMs, 0, rng);
    const res2 = BraunSM.pressRun(s, selectedDrug, s.patientWeightKg, tsRef.t);
    s = res2.state;
    log.push(...res2.logEntries);
    tsRef.t += keypressMs;
  }

  // 7. Infusion ticks
  if (s.screen === 'RUNNING') {
    const tickCount = randInt(2, 8, rng);
    for (let i = 0; i < tickCount; i++) {
      const res = BraunSM.infusionTick(s, selectedDrug, s.patientWeightKg, tsRef.t);
      if (BraunSM.didTriggerAlarm(res)) alarmsDuring++;
      s = res.state;
      log.push(...res.logEntries);
      tsRef.t += BRAUN_DEFAULTS.INFUSION_TICK_MS;
    }
  }

  // Convert intended rate to ml/h
  const intendedRateMlH = +rateToMlH(
    intendedRateInUnits,
    selectedDrug,
    s.patientWeightKg
  ).toFixed(3);

  log.push(BraunSM.makeBraunLogEntry(tsRef.t, s.screen, 'session_end'));

  return { log, finalState: s, intendedRateMlH, alarmsDuring };
}

/**
 * Extract feature values from a B. Braun session log and pump state.
 *
 * Mirrors the Alaris GP extractFeatures() logic but operates on BraunSessionLogEntry[]
 * and BraunPumpState. Returns a partial BraunTrainingRecord for further enrichment
 * by the labelling rules.
 *
 * @param log           - Immutable B. Braun session log
 * @param finalState    - B. Braun pump state at session end
 * @param deviceContext - Device/system features from generateBraunDeviceContext()
 * @param intendedRateMlH - Target rate in ml/h
 * @param alarmsDuring  - Number of alarms triggered during the session
 * @param spacecom2Connected - Whether SpaceCom2 was connected during the session
 * @param recallBatchAffected - Whether device is in the FDA 2023 recall scope
 * @returns Partial BraunTrainingRecord (without risk fields)
 */
function extractBraunFeatures(
  log: readonly BraunSessionLogEntry[],
  finalState: BraunPumpState,
  deviceContext: ReturnType<typeof generateDeviceContext> & { pump_model: string; firmware_version: string },
  intendedRateMlH: number,
  alarmsDuring: number,
  spacecom2Connected: boolean,
  recallBatchAffected: boolean
): Omit<BraunTrainingRecord, 'risk_label' | 'risk_score' | 'risk_reasons' | 'design_score' | 'interaction_score' | 'configuration_score' | 'system_score' | 'composite_score' | 'grade' | 'design_reasons' | 'interaction_reasons' | 'configuration_reasons' | 'system_reasons'> {
  const drug = BraunSM.getCurrentDrug(finalState);

  // Interaction features (mirrors Alaris GP featureExtractor)
  const rateAdjusts = log.filter(e => e.event === 'rate_adjust');
  const corrections = log.filter(e => e.event === 'correction');
  const boundaries  = log.filter(e => e.event === 'boundary_hit');

  const largeUpCount   = rateAdjusts.filter(e => e.delta === +BRAUN_DEFAULTS.STEP_LARGE).length;
  const smallUpCount   = rateAdjusts.filter(e => e.delta === +BRAUN_DEFAULTS.STEP_SMALL).length;
  const smallDownCount = rateAdjusts.filter(e => e.delta === -BRAUN_DEFAULTS.STEP_SMALL).length;
  const largeDownCount = rateAdjusts.filter(e => e.delta === -BRAUN_DEFAULTS.STEP_LARGE).length;
  const totalKeypresses = rateAdjusts.length;

  const largeBtnRatio = totalKeypresses > 0
    ? +((largeUpCount + largeDownCount) / totalKeypresses).toFixed(3)
    : 0;

  const firstAdjust = rateAdjusts[0];
  const startEvent  = log.find(e => e.event === 'infusion_started');
  const entryTimeMs = firstAdjust && startEvent
    ? Math.max(0, startEvent.timestamp - firstAdjust.timestamp)
    : 0;

  // Golden path ratio
  const distance = Math.abs(+(finalState.rate - drug.defaultRate).toFixed(1));
  const minPresses = distance < 0.001
    ? 0
    : Math.floor(distance / BRAUN_DEFAULTS.STEP_LARGE) +
      Math.round((distance - Math.floor(distance / BRAUN_DEFAULTS.STEP_LARGE) * BRAUN_DEFAULTS.STEP_LARGE) / BRAUN_DEFAULTS.STEP_SMALL);
  const goldenPathRatio = minPresses > 0
    ? +Math.min(10, totalKeypresses / minPresses).toFixed(3)
    : 1.0;

  // Rate error
  const finalRateMlH = +rateToMlH(finalState.rate, drug, finalState.patientWeightKg).toFixed(3);
  const errorMagnitudeMlH = +Math.abs(finalRateMlH - intendedRateMlH).toFixed(3);
  const relativeError = intendedRateMlH > 0
    ? +Math.min(2, errorMagnitudeMlH / intendedRateMlH).toFixed(4)
    : 0;
  const confirmedIncorrect: 0 | 1 = (relativeError > 0.25 && startEvent !== undefined) ? 1 : 0;

  // Guardrail features (three-tier)
  const guardrailAdvisoryShown: 0 | 1    = log.some(e => e.event === 'guardrail_advisory') ? 1 : 0;
  const guardrailAdvisoryAcknowledged: 0 | 1 = log.some(e => e.event === 'guardrail_advisory_acknowledged') ? 1 : 0;
  const guardrailWarnShown: 0 | 1        = log.some(e => e.event === 'guardrail_warning') ? 1 : 0;
  const guardrailOverride: 0 | 1         = log.some(e => e.event === 'guardrail_override') ? 1 : 0;
  const guardrailBlocked: 0 | 1          = log.some(e => e.event === 'guardrail_blocked') ? 1 : 0;

  const rateWithinSoftLimits: 0 | 1 = (
    drug.id === 'manual' ||
    (finalState.rate >= drug.softMin && finalState.rate <= drug.softMax)
  ) ? 1 : 0;

  // VTBI / bolus
  const vtbiSetFlag: 0 | 1     = finalState.vtbiSet ? 1 : 0;
  const vtbiValueMl            = finalState.vtbiSet ? finalState.vtbi : 0;
  const bolusEndEvent          = log.filter(e => e.event === 'bolus_ended').pop();
  const bolusDelivered: 0 | 1  = bolusEndEvent !== undefined ? 1 : 0;
  const bolusVolumeMl          = typeof bolusEndEvent?.bolusVolume === 'number'
    ? bolusEndEvent.bolusVolume
    : 0;

  return {
    // Metadata
    record_id:              deviceContext.record_id,
    session_id:             deviceContext.session_id,
    timestamp_iso:          deviceContext.timestamp_iso,
    pump_model:             BRAUN_DEFAULTS.PUMP_MODEL,
    firmware_version:       deviceContext.firmware_version,

    // Interaction
    entry_time_ms:          entryTimeMs,
    total_keypresses:       totalKeypresses,
    large_up_count:         largeUpCount,
    small_up_count:         smallUpCount,
    small_down_count:       smallDownCount,
    large_down_count:       largeDownCount,
    correction_count:       corrections.length,
    boundary_hit_count:     boundaries.length,
    large_btn_ratio:        largeBtnRatio,
    golden_path_ratio:      goldenPathRatio,
    final_rate_ml_h:        finalRateMlH,
    intended_rate_ml_h:     intendedRateMlH,
    error_magnitude_ml_h:   errorMagnitudeMlH,
    relative_error:         relativeError,
    confirmed_incorrect:    confirmedIncorrect,
    drug_unit_used:         drug.unit,

    // Configuration (shared with Alaris GP)
    drug_id:                drug.id,
    drug_name:              drug.name,
    drug_library_used:      drug.id !== 'manual' ? 1 : 0,
    guardrail_soft_min:     drug.softMin,
    guardrail_soft_max:     drug.softMax,
    guardrail_hard_min:     drug.hardMin,
    guardrail_hard_max:     drug.hardMax,
    guardrail_warning_shown: guardrailWarnShown,
    guardrail_override:     guardrailOverride,
    guardrail_blocked:      guardrailBlocked,
    rate_within_soft_limits: rateWithinSoftLimits,
    vtbi_set:               vtbiSetFlag,
    vtbi_value_ml:          vtbiValueMl,
    kvo_rate_ml_h:          BRAUN_DEFAULTS.KVO_RATE,
    bolus_delivered:        bolusDelivered,
    bolus_volume_ml:        bolusVolumeMl,
    secondary_infusion:     0,
    patient_weight_kg:      finalState.patientWeightKg,
    pressure_alarm_level:   finalState.pressureLevel,

    // Device / system (from deviceContext)
    days_since_maintenance:  deviceContext.days_since_maintenance,
    battery_level_pct:       deviceContext.battery_level_pct,
    firmware_version_risk:   deviceContext.firmware_version_risk,
    network_connected:       deviceContext.network_connected,
    drug_library_age_days:   deviceContext.drug_library_age_days,
    config_drift_score:      deviceContext.config_drift_score,
    recent_occlusion_alarms: deviceContext.recent_occlusion_alarms,
    alarms_during_session:   alarmsDuring,

    // B. Braun specific
    guardrail_advisory_shown:        guardrailAdvisoryShown,
    guardrail_advisory_acknowledged: guardrailAdvisoryAcknowledged,
    spacecom2_connected:             spacecom2Connected ? 1 : 0,
    firmware_signed:                 BRAUN_DEFAULTS.FIRMWARE_SIGNED ? 1 : 0,
    recall_batch_affected:           recallBatchAffected ? 1 : 0,
    bolus_max_ml:                    BRAUN_DEFAULTS.BOLUS_MAX_ML,
  };
}

/**
 * Generate N synthetic B. Braun Infusomat Space TrainingRecords.
 *
 * Mirrors generateDataset() for the Alaris GP but:
 *   - Uses braunStateMachine.ts functions for session simulation
 *   - Sets pump_model to 'braun_infusomat'
 *   - Sets firmware_signed to false always (CVE-2021-33885 applies universally)
 *   - Sets spacecom2_connected based on scenario profile (connected in ideal/cyber_risk;
 *     not connected in neglected/emergency)
 *   - Sets recall_batch_affected = 1 for ~30% of neglected/emergency sessions
 *   - Runs applyBraunRules() in addition to applyLabellingRules()
 *   - Appends BB-rule reasons to risk_reasons
 *   - Uses computeDesignScore('braun_infusomat') for design_score
 *
 * SpaceCom2 connectivity by profile:
 *   ideal:        spacecom2 = true  (well-maintained, connected environment)
 *   neglected:    spacecom2 = false (isolated, outdated)
 *   cyber_risk:   spacecom2 = true  (network-connected + unsigned firmware = BB-R02)
 *   emergency:    spacecom2 = random
 *
 * @param n    - Number of records to generate (default: 500)
 * @param seed - RNG seed for reproducibility (default: 42)
 * @returns Array of BraunTrainingRecord with all fields populated
 *
 * Source: CLAUDE.md Step 3 — "Build the AI pipeline".
 * Source: braunRules.ts — BB-R01 to BB-R05 rule definitions.
 */
export function generateBraunDataset(n = 500, seed = 42): BraunTrainingRecord[] {
  const rng = makeLcg(seed + 1); // offset seed from Alaris GP to generate different data
  const records: BraunTrainingRecord[] = [];
  const profileCount = SCENARIO_PROFILES.length;

  const totalWeight = SCENARIO_PROFILES.reduce((s, p) => s + p.weight, 0);
  const cumWeights  = SCENARIO_PROFILES.reduce<number[]>((acc, p) => {
    acc.push((acc[acc.length - 1] ?? 0) + p.weight / totalWeight);
    return acc;
  }, []);

  for (let i = 0; i < n; i++) {
    const roll         = rng();
    const profileIndex = cumWeights.findIndex(w => roll <= w);
    const profile      = SCENARIO_PROFILES[Math.min(profileIndex, profileCount - 1)];

    const recordId = `braun_${String(i + 1).padStart(4, "0")}_${profile.id}`;

    const sessionSeed = Math.floor(rng() * 0xffffffff);
    const sessionRng  = makeLcg(sessionSeed);

    // Generate device context using shared scenarioGenerator
    const baseContext = generateDeviceContext(profile, recordId, sessionRng);
    // Override pump_model for B. Braun
    const deviceContext = {
      ...baseContext,
      pump_model:        BRAUN_DEFAULTS.PUMP_MODEL,
      firmware_version:  BRAUN_DEFAULTS.FIRMWARE_VERSION,
      // firmware_version_risk: B. Braun firmware is always "at risk" due to CVE-2021-33885
      // but the generic firmware CVE list maps Alaris versions, not B. Braun versions.
      // We set risk to 1 here because BB-R01 covers it; the generic R05 would fire on
      // the Alaris CVE list which doesn't apply to B. Braun version strings.
      firmware_version_risk: 1 as 0 | 1,
    };
    (deviceContext as { session_id: string }).session_id = makeSessionId(i, Date.now() + i + n);

    // Determine SpaceCom2 connectivity from profile
    let spacecom2: boolean;
    if (profile.id === 'ideal' || profile.id === 'cyber_risk') {
      spacecom2 = true;
    } else if (profile.id === 'neglected') {
      spacecom2 = false;
    } else {
      // emergency: random
      spacecom2 = sessionRng() > 0.5;
    }

    // Recall batch: ~30% of neglected/emergency sessions are in the FDA 2023 recall scope
    const recallBatchAffected =
      (profile.id === 'neglected' || profile.id === 'emergency') &&
      sessionRng() < 0.30;

    // Simulate session
    const { log, finalState, intendedRateMlH, alarmsDuring } = simulateBraunSession(
      profile, i, sessionRng
    );

    // Extract features
    const partial = extractBraunFeatures(
      log, finalState, deviceContext, intendedRateMlH, alarmsDuring, spacecom2, recallBatchAffected
    );

    // Apply generic Alaris GP labelling rules (R01–R21)
    const labelResult = applyLabellingRules(partial);

    // Apply B. Braun-specific rules (BB-R01 to BB-R05)
    const braunResult = applyBraunRules(partial);

    // Layer 0: design score for B. Braun
    const designResult = computeDesignScore(BRAUN_DEFAULTS.PUMP_MODEL);

    // Compute additional score contributions from B. Braun rules per layer
    const bbSystemFired  = braunResult.firedHighRules.filter(id => ['BB-R01', 'BB-R02'].includes(id));
    const bbConfigFired  = [...braunResult.firedMediumRules.filter(id => ['BB-R03', 'BB-R04'].includes(id))];
    const bbDesignFired  = braunResult.firedHighRules.filter(id => id === 'BB-R05');

    const bbSystemScore  = computeBraunRuleScore(bbSystemFired);
    const bbConfigScore  = computeBraunRuleScore(bbConfigFired);
    const bbDesignScore  = computeBraunRuleScore(bbDesignFired);

    // Recompute composite with B. Braun adjustments
    const adjustedSystemScore  = +Math.min(1.0, labelResult.system_score + bbSystemScore).toFixed(3);
    const adjustedConfigScore  = +Math.min(1.0, labelResult.configuration_score + bbConfigScore).toFixed(3);
    const adjustedDesignScore  = +Math.min(1.0, designResult.score + bbDesignScore * 0.20).toFixed(3);

    const composite_score = +Math.min(1.0, +(
      0.20 * adjustedDesignScore +
      0.30 * labelResult.interaction_score +
      0.25 * adjustedConfigScore +
      0.25 * adjustedSystemScore
    ).toFixed(3));

    // Re-derive grade
    let grade: TrainingRecord['grade'];
    if (composite_score <= 0.10)      grade = 'A+';
    else if (composite_score <= 0.20) grade = 'A';
    else if (composite_score <= 0.35) grade = 'B';
    else if (composite_score <= 0.50) grade = 'C';
    else if (composite_score <= 0.65) grade = 'D';
    else if (composite_score <= 0.80) grade = 'E';
    else                              grade = 'F';

    // Derive risk_label using B. Braun-aware logic
    const genericHighFired = labelResult.risk_reasons
      .filter(r => !r.startsWith('R1') && r.match(/^R0[1-8]/))
      .map(r => r.split(':')[0]);

    const risk_label = deriveBraunRiskLabel(
      genericHighFired,
      braunResult.firedHighRules,
      composite_score
    );

    // Merge all risk reasons
    const risk_reasons = [
      ...labelResult.risk_reasons,
      ...braunResult.braunRiskReasons,
    ];

    records.push({
      ...partial,
      ...labelResult,
      design_score:          adjustedDesignScore,
      design_reasons:        [...designResult.reasons, ...braunResult.braunRiskReasons.filter(r => r.startsWith('BB-R05'))],
      system_score:          adjustedSystemScore,
      system_reasons:        [...labelResult.system_reasons, ...braunResult.braunRiskReasons.filter(r => r.startsWith('BB-R01') || r.startsWith('BB-R02'))],
      configuration_score:   adjustedConfigScore,
      configuration_reasons: [...labelResult.configuration_reasons, ...braunResult.braunRiskReasons.filter(r => r.startsWith('BB-R03') || r.startsWith('BB-R04'))],
      composite_score,
      grade,
      risk_label,
      risk_score:     composite_score,
      risk_reasons,
    } as BraunTrainingRecord);
  }

  return records;
}

/**
 * Generate N records for the Graseby 3100 Syringe Driver.
 *
 * The Graseby 3100 has:
 *   - No drug library (always MANUAL mode, drug_library_used = 0)
 *   - No guardrails (no warnings, overrides, or blocked states)
 *   - No VTBI (syringe capacity drives completion instead)
 *   - No bolus mode
 *   - Rate in ml/h directly — no drug-unit conversion
 *
 * The design score is computed from 'graseby_3100' via deviceDesign.ts, which
 * captures the Layer 0 penalty for the device's lack of safety features.
 * Interaction (Layer 1) simulation mirrors the Alaris GP chevron-based entry
 * because the Graseby 3100 uses a similar rotary encoder → chevron button mapping.
 *
 * @param n    - Number of records to generate (default: 500)
 * @param seed - RNG seed for reproducibility (default: 44, offset from Alaris/Braun)
 * @returns Array of TrainingRecord with pump_model = 'graseby_3100'
 *
 * Source: Graseby 3100 Syringe Driver Operators Manual — ardusmedical.com (2002).
 */
export function generateGrasebyDataset(n = 500, seed = 44): TrainingRecord[] {
  const rng = makeLcg(seed + 2); // distinct offset from Alaris (seed) and B. Braun (seed+1)
  const records: TrainingRecord[] = [];
  const profileCount = SCENARIO_PROFILES.length;

  const totalWeight = SCENARIO_PROFILES.reduce((s, p) => s + p.weight, 0);
  const cumWeights  = SCENARIO_PROFILES.reduce<number[]>((acc, p) => {
    acc.push((acc[acc.length - 1] ?? 0) + p.weight / totalWeight);
    return acc;
  }, []);

  for (let i = 0; i < n; i++) {
    const roll         = rng();
    const profileIndex = cumWeights.findIndex(w => roll <= w);
    const profile      = SCENARIO_PROFILES[Math.min(profileIndex, profileCount - 1)];

    const recordId = `graseby_${String(i + 1).padStart(4, "0")}_${profile.id}`;

    const sessionSeed = Math.floor(rng() * 0xffffffff);
    const sessionRng  = makeLcg(sessionSeed);

    // Generate device context, then override for Graseby
    const baseContext = generateDeviceContext(profile, recordId, sessionRng);
    const deviceContext = {
      ...baseContext,
      pump_model:           'graseby_3100',
      firmware_version:     '3100-v1.0',
      // Graseby 3100 has no documented CVEs — firmware risk is always 0
      firmware_version_risk: 0 as 0 | 1,
    };
    (deviceContext as { session_id: string }).session_id = makeSessionId(i, Date.now() + i + n * 2);

    // Simulate session using Alaris GP interaction model (same chevron-based entry)
    const { log, finalState, intendedRateMlH, alarmsDuring } = simulateSession(
      profile, i, sessionRng
    );

    // Extract features
    const partial = extractFeatures(log, finalState, deviceContext, intendedRateMlH, alarmsDuring);

    // Override Graseby-specific fields (no drug library, no guardrails, no VTBI, no bolus)
    const grasebyPartial = {
      ...partial,
      pump_model:              'graseby_3100',
      drug_library_used:       0 as 0 | 1,
      drug_id:                 'manual',
      drug_name:               'MANUAL ml/h',
      guardrail_warning_shown: 0 as 0 | 1,
      guardrail_override:      0 as 0 | 1,
      guardrail_blocked:       0 as 0 | 1,
      vtbi_set:                0 as 0 | 1,
      vtbi_value_ml:           0,
      bolus_delivered:         0 as 0 | 1,
      bolus_volume_ml:         0,
    };

    // Apply labelling rules
    const labelResult = applyLabellingRules(grasebyPartial);

    // Layer 0: design score for Graseby 3100 (lowest design score — no safety features)
    const designResult = computeDesignScore('graseby_3100');

    const composite_score = +Math.min(1.0, +(
      0.20 * designResult.score +
      0.30 * labelResult.interaction_score +
      0.25 * labelResult.configuration_score +
      0.25 * labelResult.system_score
    ).toFixed(3));

    let grade: TrainingRecord['grade'];
    if (composite_score <= 0.10)      grade = 'A+';
    else if (composite_score <= 0.20) grade = 'A';
    else if (composite_score <= 0.35) grade = 'B';
    else if (composite_score <= 0.50) grade = 'C';
    else if (composite_score <= 0.65) grade = 'D';
    else if (composite_score <= 0.80) grade = 'E';
    else                              grade = 'F';

    let risk_label: TrainingRecord['risk_label'];
    if (grade === 'A+' || grade === 'A' || grade === 'B') risk_label = 'low';
    else if (grade === 'C' || grade === 'D')              risk_label = 'medium';
    else                                                  risk_label = 'high';

    records.push({
      ...grasebyPartial,
      ...labelResult,
      design_score:   designResult.score,
      design_reasons: designResult.reasons,
      composite_score,
      grade,
      risk_label,
      risk_score: composite_score,
    });
  }

  return records;
}

/**
 * Generate N records for ALL THREE devices (Alaris GP + B. Braun + Graseby 3100)
 * and return them concatenated into a single unified array.
 *
 * The combined dataset has 3×n records total:
 *   - n records with pump_model = 'alaris_gp'
 *   - n records with pump_model = 'braun_infusomat'
 *   - n records with pump_model = 'graseby_3100'
 *
 * @param nPerDevice - Number of records per device (total = 3 × nPerDevice)
 * @param seed       - RNG seed for reproducibility (default: 42)
 * @returns Combined array of all three device types
 *
 * Source: CLAUDE.md Step 5 — "Run the dataset generator for 500 records".
 */
export function generateCombinedDataset(nPerDevice = 500, seed = 42): TrainingRecord[] {
  const alarisRecords  = generateDataset(nPerDevice, seed);
  const braunRecords   = generateBraunDataset(nPerDevice, seed);
  const grasebyRecords = generateGrasebyDataset(nPerDevice, seed);
  return [...alarisRecords, ...braunRecords, ...grasebyRecords];
}

// ─── CLI entry point (vite-node src/ai/datasetBuilder.ts) ─────────────────────

async function main() {
  const n    = parseInt(process.env["DATASET_N"] ?? "500", 10);
  const seed = parseInt(process.env["DATASET_SEED"] ?? "42", 10);

  console.log(`Generating ${n} records (seed=${seed})…`);
  const records = generateDataset(n, seed);

  const dist = summariseDistribution(records);
  console.log(`Distribution: low=${dist.low.pct}  medium=${dist.medium.pct}  high=${dist.high.pct}`);

  // Write output files
  const { writeFileSync, mkdirSync } = await import("fs");
  const { join, dirname } = await import("path");
  const { fileURLToPath } = await import("url");

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const outDir    = join(__dirname, "../../data/dataset");

  mkdirSync(outDir, { recursive: true });

  const jsonPath = join(outDir, "training.json");
  const csvPath  = join(outDir, "training.csv");

  writeFileSync(jsonPath, JSON.stringify(records, null, 2));
  writeFileSync(csvPath,  toCSV(records));

  console.log(`Written: ${jsonPath}`);
  console.log(`Written: ${csvPath}`);
  console.log(`Done — ${records.length} records.`);
}

// Run when executed directly via vite-node
if (typeof process !== "undefined" && process.argv[1]?.includes("datasetBuilder")) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
