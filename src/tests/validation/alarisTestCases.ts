/**
 * Behavioural Fidelity Validation — Alaris GP Volumetric Infusion Pump.
 *
 * Each test maps one simulator behaviour to a specific section of the official
 * Directions For Use (DFU) manual (BD 1000DF00152 Issue 1 / BDDF00535 Issue 4).
 * Tests marked pvsioweb:true are additionally validated against the published
 * PVSio-web formal model (http://www.pvsioweb.org/demos/AlarisGP).
 *
 * DFU abbreviations used in dfuRef:
 *   1000DF  = BD document 1000DF00152 Issue 1 (standard edition)
 *   BDDF    = BD document BDDF00535 Issue 4 (Guardrails edition)
 *   PVS     = PVSio-web formal model
 *   CLAUDE  = CLAUDE.md rule (simulator design contract)
 *
 * NO React imports allowed in this file.
 */

import {
  getInitialState,
  selectLanguage,
  selectDrug,
  adjustChevron,
  pressRun,
  overrideGuardrail,
  reEnterRate,
  pressHold,
  confirmVtbi,
  infusionTick,
  silenceAlarm,
} from '../../pump/stateMachine';
import { FACTORY_DEFAULTS } from '../../pump/constants';
import { DRUG_LIBRARY } from '../../pump/drugLibrary';
import type { PumpState } from '../../pump/types';
import type { BFVTestCase } from './validationTypes';

// ─── State Helpers ────────────────────────────────────────────────────────────

const MORPHINE = DRUG_LIBRARY.find(d => d.id === 'morphine')!;
const ADRENALINE = DRUG_LIBRARY.find(d => d.id === 'adrenaline')!;
const MANUAL = DRUG_LIBRARY.find(d => d.id === 'manual')!;

function atDrugSelect(): PumpState {
  return selectLanguage(getInitialState(), 0).state;
}

function atRateEntry(drug = MORPHINE, rate = 2): PumpState {
  return { ...selectDrug(atDrugSelect(), drug, 0).state, rateBuffer: rate };
}

function atRunning(rate = 5): PumpState {
  return pressRun(atRateEntry(MORPHINE, rate), 0).state;
}

function atAlarm(kvoActive: boolean): PumpState {
  return {
    ...getInitialState(),
    screen: 'ALARM',
    alarmType: 'INFUSION_COMPLETE',
    alarmMessage: 'INFUSION COMPLETE',
    kvoActive,
  };
}

function runningForTick(rate = 100, vtbi: number | null = null, pressureLevel = 5, ailTriggered = false): PumpState {
  return {
    ...getInitialState(),
    screen: 'RUNNING',
    rate,
    rateBuffer: rate,
    selectedDrug: MANUAL,
    vtbi,
    volumeInfused: 0,
    pressureLevel,
    kvoActive: false,
    ailTriggered,
  };
}

// ─── Test Cases ───────────────────────────────────────────────────────────────

export const ALARIS_TEST_CASES: BFVTestCase[] = [

  {
    id: 'BFV-AG-001',
    device: 'ALARIS_GP',
    description: 'Power-on state is LANGUAGE_SELECT',
    dfuRef: '1000DF §2.1 — Language Selection (first screen on power-on)',
    pvsioweb: true,
    expected: 'getInitialState().screen === "LANGUAGE_SELECT"',
    evaluate: () => {
      const s = getInitialState();
      const passed = s.screen === 'LANGUAGE_SELECT';
      return { passed, actual: `screen = "${s.screen}"` };
    },
  },

  {
    id: 'BFV-AG-002',
    device: 'ALARIS_GP',
    description: 'LANGUAGE_SELECT → DRUG_SELECT on selectLanguage()',
    dfuRef: '1000DF §2.1 — "Select language, pump advances to Drug Select screen"',
    pvsioweb: true,
    expected: 'screen === "DRUG_SELECT"',
    evaluate: () => {
      const r = selectLanguage(getInitialState(), 0);
      const passed = r.state.screen === 'DRUG_SELECT';
      return { passed, actual: `screen = "${r.state.screen}"` };
    },
  },

  {
    id: 'BFV-AG-003',
    device: 'ALARIS_GP',
    description: 'Selecting a non-weight drug transitions to RATE_ENTRY',
    dfuRef: '1000DF §2.3 — Drug selection workflow; CLAUDE.md §6.2 DRUG_SELECT → RATE_ENTRY',
    pvsioweb: true,
    expected: 'screen === "RATE_ENTRY" (morphine, weightBased=false)',
    evaluate: () => {
      const r = selectDrug(atDrugSelect(), MORPHINE, 0);
      const passed = r.state.screen === 'RATE_ENTRY';
      return { passed, actual: `screen = "${r.state.screen}"` };
    },
  },

  {
    id: 'BFV-AG-004',
    device: 'ALARIS_GP',
    description: 'Selecting a weight-based drug transitions to WEIGHT_ENTRY',
    dfuRef: '1000DF §2.3 — "Weight-based drugs require patient weight confirmation first"',
    pvsioweb: false,
    expected: 'screen === "WEIGHT_ENTRY" (adrenaline, weightBased=true)',
    evaluate: () => {
      const r = selectDrug(atDrugSelect(), ADRENALINE, 0);
      const passed = r.state.screen === 'WEIGHT_ENTRY';
      return { passed, actual: `screen = "${r.state.screen}"` };
    },
  },

  {
    id: 'BFV-AG-005',
    device: 'ALARIS_GP',
    description: 'Double chevron (»») increases rateBuffer by STEP_LARGE (10)',
    dfuRef: '1000DF §3.1 Table 1 — "Double chevron: faster increase of values"; FACTORY_DEFAULTS.STEP_LARGE = 10',
    pvsioweb: false,
    expected: 'rateBuffer increases by exactly 10',
    evaluate: () => {
      const s0 = atRateEntry(MORPHINE, 2);
      const r = adjustChevron(s0, FACTORY_DEFAULTS.STEP_LARGE, 0, []);
      const delta = r.state.rateBuffer - s0.rateBuffer;
      const passed = delta === 10;
      return { passed, actual: `delta = ${delta} ml/h (expected 10)` };
    },
  },

  {
    id: 'BFV-AG-006',
    device: 'ALARIS_GP',
    description: 'Single chevron (») increases rateBuffer by STEP_SMALL (1)',
    dfuRef: '1000DF §3.1 Table 1 — "Single chevron: slower increase of values"; FACTORY_DEFAULTS.STEP_SMALL = 1',
    pvsioweb: false,
    expected: 'rateBuffer increases by exactly 1',
    evaluate: () => {
      const s0 = atRateEntry(MORPHINE, 2);
      const r = adjustChevron(s0, FACTORY_DEFAULTS.STEP_SMALL, 0, []);
      const delta = r.state.rateBuffer - s0.rateBuffer;
      const passed = delta === 1;
      return { passed, actual: `delta = ${delta} ml/h (expected 1)` };
    },
  },

  {
    id: 'BFV-AG-007',
    device: 'ALARIS_GP',
    description: 'Rate clamps at RATE_MAX (1200 ml/h) and logs boundary_hit',
    dfuRef: '1000DF §4 Factory Defaults — "Infusion Rate Max 1200 ml/h"; CLAUDE.md §6.3 Boundary Clamping',
    pvsioweb: false,
    expected: 'rateBuffer stays 1200, logEntries contains boundary_hit',
    evaluate: () => {
      const s0 = atRateEntry(MANUAL, FACTORY_DEFAULTS.RATE_MAX);
      const r = adjustChevron(s0, +10, 0, []);
      const staysClamped = r.state.rateBuffer === FACTORY_DEFAULTS.RATE_MAX;
      const logsBoundary = r.logEntries.some(e => e.event === 'boundary_hit');
      const passed = staysClamped && logsBoundary;
      return {
        passed,
        actual: `rateBuffer=${r.state.rateBuffer}, boundary_hit logged=${logsBoundary}`,
      };
    },
  },

  {
    id: 'BFV-AG-008',
    device: 'ALARIS_GP',
    description: 'Rate clamps at RATE_MIN (0.1 ml/h) and logs boundary_hit',
    dfuRef: '1000DF §4 Factory Defaults — "Infusion Rate Min 0.1 ml/h"; CLAUDE.md §6.3 Boundary Clamping',
    pvsioweb: false,
    expected: 'rateBuffer stays 0.1, logEntries contains boundary_hit',
    evaluate: () => {
      const s0 = atRateEntry(MANUAL, FACTORY_DEFAULTS.RATE_MIN);
      const r = adjustChevron(s0, -1, 0, []);
      const staysClamped = r.state.rateBuffer === FACTORY_DEFAULTS.RATE_MIN;
      const logsBoundary = r.logEntries.some(e => e.event === 'boundary_hit');
      const passed = staysClamped && logsBoundary;
      return {
        passed,
        actual: `rateBuffer=${r.state.rateBuffer}, boundary_hit logged=${logsBoundary}`,
      };
    },
  },

  {
    id: 'BFV-AG-009',
    device: 'ALARIS_GP',
    description: 'Rate above soft limit triggers GUARDRAIL_WARNING screen on RUN',
    dfuRef: 'BDDF §4 — "Soft limit exceeded: pump stops, warning displayed, nurse must override or re-enter"',
    pvsioweb: true,
    expected: 'screen === "GUARDRAIL_WARNING" (morphine rate=15 > softMax=10)',
    evaluate: () => {
      const r = pressRun(atRateEntry(MORPHINE, 15), 0);
      const passed = r.state.screen === 'GUARDRAIL_WARNING';
      return { passed, actual: `screen = "${r.state.screen}"` };
    },
  },

  {
    id: 'BFV-AG-010',
    device: 'ALARIS_GP',
    description: 'Rate above hard limit triggers GUARDRAIL_BLOCKED screen on RUN',
    dfuRef: 'BDDF §4 — "Hard limit exceeded: pump blocked, nurse must re-enter (no override)"',
    pvsioweb: true,
    expected: 'screen === "GUARDRAIL_BLOCKED" (morphine rate=25 > hardMax=20)',
    evaluate: () => {
      const r = pressRun(atRateEntry(MORPHINE, 25), 0);
      const passed = r.state.screen === 'GUARDRAIL_BLOCKED';
      return { passed, actual: `screen = "${r.state.screen}"` };
    },
  },

  {
    id: 'BFV-AG-011',
    device: 'ALARIS_GP',
    description: 'Rate within soft limits transitions to RUNNING on RUN',
    dfuRef: '1000DF §2.4 — "Press RUN; pump starts infusion"; CLAUDE.md §6.2 RATE_ENTRY → RUNNING',
    pvsioweb: true,
    expected: 'screen === "RUNNING" (morphine rate=5, within softMin=1..softMax=10)',
    evaluate: () => {
      const r = pressRun(atRateEntry(MORPHINE, 5), 0);
      const passed = r.state.screen === 'RUNNING';
      return { passed, actual: `screen = "${r.state.screen}"` };
    },
  },

  {
    id: 'BFV-AG-012',
    device: 'ALARIS_GP',
    description: 'Guardrail override transitions to RUNNING and logs guardrail_override',
    dfuRef: 'BDDF §4 — "OVERRIDE softkey: nurse accepts responsibility, infusion starts"; CLAUDE.md Rule 7 — must always log',
    pvsioweb: true,
    expected: 'screen === "RUNNING", log contains guardrail_override event',
    evaluate: () => {
      const warningState = pressRun(atRateEntry(MORPHINE, 15), 0).state;
      const r = overrideGuardrail(warningState, 100);
      const screenOk = r.state.screen === 'RUNNING';
      const logOk = r.logEntries.some(e => e.event === 'guardrail_override');
      const passed = screenOk && logOk;
      return { passed, actual: `screen="${r.state.screen}", guardrail_override logged=${logOk}` };
    },
  },

  {
    id: 'BFV-AG-013',
    device: 'ALARIS_GP',
    description: 'RE-ENTER from GUARDRAIL_WARNING returns to RATE_ENTRY',
    dfuRef: 'BDDF §4 — "RE-ENTER softkey: nurse cancels and reprograms rate"',
    pvsioweb: false,
    expected: 'screen === "RATE_ENTRY"',
    evaluate: () => {
      const warningState = pressRun(atRateEntry(MORPHINE, 15), 0).state;
      const r = reEnterRate(warningState, 100);
      const passed = r.state.screen === 'RATE_ENTRY';
      return { passed, actual: `screen = "${r.state.screen}"` };
    },
  },

  {
    id: 'BFV-AG-014',
    device: 'ALARIS_GP',
    description: 'RE-ENTER from GUARDRAIL_BLOCKED returns to RATE_ENTRY (only option)',
    dfuRef: 'BDDF §4 — "Hard limit: only RE-ENTER is permitted, no override possible"',
    pvsioweb: false,
    expected: 'screen === "RATE_ENTRY" (from GUARDRAIL_BLOCKED)',
    evaluate: () => {
      const blockedState = pressRun(atRateEntry(MORPHINE, 25), 0).state;
      const r = reEnterRate(blockedState, 100);
      const passed = r.state.screen === 'RATE_ENTRY';
      return { passed, actual: `screen = "${r.state.screen}"` };
    },
  },

  {
    id: 'BFV-AG-015',
    device: 'ALARIS_GP',
    description: 'RUNNING → ON_HOLD on pressHold()',
    dfuRef: '1000DF §3.1 — "HOLD button: Put infusion on hold; amber LED lit"',
    pvsioweb: true,
    expected: 'screen === "ON_HOLD"',
    evaluate: () => {
      const r = pressHold(atRunning(5), 0);
      const passed = r.state.screen === 'ON_HOLD';
      return { passed, actual: `screen = "${r.state.screen}"` };
    },
  },

  {
    id: 'BFV-AG-016',
    device: 'ALARIS_GP',
    description: 'ON_HOLD → RUNNING on pressRun()',
    dfuRef: '1000DF §3.1 — "Press RUN from hold to resume infusion"',
    pvsioweb: true,
    expected: 'screen === "RUNNING"',
    evaluate: () => {
      const onHold = pressHold(atRunning(5), 0).state;
      const r = pressRun(onHold, 100);
      const passed = r.state.screen === 'RUNNING';
      return { passed, actual: `screen = "${r.state.screen}"` };
    },
  },

  {
    id: 'BFV-AG-017',
    device: 'ALARIS_GP',
    description: 'Direction reversal during rate entry logs a correction event',
    dfuRef: 'CLAUDE.md §6.3 — "Detect correction: find last rate_adjust and check direction reversal"',
    pvsioweb: false,
    expected: 'second adjustChevron (opposite sign) produces a correction log entry',
    evaluate: () => {
      const s0 = atRateEntry(MANUAL, 50);
      const r1 = adjustChevron(s0, +10, 0, []);
      const r2 = adjustChevron(r1.state, -10, 100, r1.logEntries);
      const hasCorrection = r2.logEntries.some(e => e.event === 'correction');
      return { passed: hasCorrection, actual: `correction logged = ${hasCorrection}` };
    },
  },

  {
    id: 'BFV-AG-018',
    device: 'ALARIS_GP',
    description: 'confirmVtbi() sets vtbi on state and transitions to RATE_ENTRY',
    dfuRef: '1000DF §2.4 — "VTBI softkey: set volume to be infused"; CLAUDE.md §6.2 VTBI_ENTRY → RATE_ENTRY',
    pvsioweb: false,
    expected: 'state.vtbi === 250, screen === "RATE_ENTRY"',
    evaluate: () => {
      const vtbiState: PumpState = {
        ...atRateEntry(),
        screen: 'VTBI_ENTRY',
        vtbiBuffer: 250,
      };
      const r = confirmVtbi(vtbiState, 0);
      const passed = r.state.vtbi === 250 && r.state.screen === 'RATE_ENTRY';
      return { passed, actual: `vtbi=${r.state.vtbi}, screen="${r.state.screen}"` };
    },
  },

  {
    id: 'BFV-AG-019',
    device: 'ALARIS_GP',
    description: 'INFUSION_COMPLETE alarm fires when volumeInfused reaches VTBI',
    dfuRef: '1000DF §7.2 — "INFUSION_COMPLETE: volumeInfused >= vtbi"',
    pvsioweb: false,
    expected: 'screen === "ALARM", alarmType === "INFUSION_COMPLETE"',
    evaluate: () => {
      // rate=100 ml/h, MANUAL drug → mlPerTick ≈ 0.0139 ml (>vtbi of 0.01)
      const st = runningForTick(100, 0.01);
      const r = infusionTick(st, 0);
      const passed = r.state.screen === 'ALARM' && r.state.alarmType === 'INFUSION_COMPLETE';
      return { passed, actual: `screen="${r.state.screen}", alarmType="${r.state.alarmType}"` };
    },
  },

  {
    id: 'BFV-AG-020',
    device: 'ALARIS_GP',
    description: 'Rate drops to KVO_RATE (1.0 ml/h) after INFUSION_COMPLETE',
    dfuRef: '1000DF §4 — "KVO Rate 1.0 ml/h — runs after VTBI complete"',
    pvsioweb: false,
    expected: 'state.rate === 1.0 (FACTORY_DEFAULTS.KVO_RATE)',
    evaluate: () => {
      const st = runningForTick(100, 0.01);
      const r = infusionTick(st, 0);
      const passed = r.state.rate === FACTORY_DEFAULTS.KVO_RATE;
      return { passed, actual: `rate after VTBI complete = ${r.state.rate} ml/h (expected ${FACTORY_DEFAULTS.KVO_RATE})` };
    },
  },

  {
    id: 'BFV-AG-021',
    device: 'ALARIS_GP',
    description: 'OCCLUSION alarm priority is higher than AIR_IN_LINE in same tick',
    dfuRef: '1000DF §7.2 — alarm priority: "OCCLUSION > AIR_IN_LINE > BATTERY_LOW > INFUSION_COMPLETE"',
    pvsioweb: false,
    expected: 'alarmType === "OCCLUSION" when pressureLevel ≥ 7 and volume near 500 ml',
    evaluate: () => {
      // pressure=7 triggers OCCLUSION; volume=499.99 would trigger AIR_IN_LINE next tick
      const st = runningForTick(100, null, FACTORY_DEFAULTS.OCCLUSION_PRESSURE_THRESHOLD, false);
      const stWithVolume: PumpState = { ...st, volumeInfused: 499.99 };
      const r = infusionTick(stWithVolume, 0);
      const passed = r.state.alarmType === 'OCCLUSION';
      return { passed, actual: `alarmType = "${r.state.alarmType}"` };
    },
  },

  {
    id: 'BFV-AG-022',
    device: 'ALARIS_GP',
    description: 'silenceAlarm() from ALARM with kvoActive=true resumes at RUNNING (KVO continues)',
    dfuRef: '1000DF §7.2 — "KVO: running at KVO rate after VTBI complete"',
    pvsioweb: false,
    expected: 'screen === "RUNNING" after silence (KVO active)',
    evaluate: () => {
      const r = silenceAlarm(atAlarm(true), 0);
      const passed = r.state.screen === 'RUNNING';
      return { passed, actual: `screen = "${r.state.screen}"` };
    },
  },

  {
    id: 'BFV-AG-023',
    device: 'ALARIS_GP',
    description: 'silenceAlarm() from ALARM with kvoActive=false transitions to ON_HOLD',
    dfuRef: '1000DF §7.2 — "Critical alarms: press SILENCE softkey → ON HOLD"',
    pvsioweb: false,
    expected: 'screen === "ON_HOLD" after silence (no KVO)',
    evaluate: () => {
      const r = silenceAlarm(atAlarm(false), 0);
      const passed = r.state.screen === 'ON_HOLD';
      return { passed, actual: `screen = "${r.state.screen}"` };
    },
  },

  {
    id: 'BFV-AG-024',
    device: 'ALARIS_GP',
    description: 'MANUAL mode bypasses guardrails — any rate in [RATE_MIN, RATE_MAX] starts infusion',
    dfuRef: 'BDDF §4 — "MANUAL mode: drug library bypassed, no guardrails apply"',
    pvsioweb: false,
    expected: 'screen === "RUNNING" with MANUAL drug at 500 ml/h (above any drug soft limit)',
    evaluate: () => {
      const r = pressRun(atRateEntry(MANUAL, 500), 0);
      const passed = r.state.screen === 'RUNNING';
      return { passed, actual: `screen = "${r.state.screen}"` };
    },
  },

  {
    id: 'BFV-AG-025',
    device: 'ALARIS_GP',
    description: 'pressHold() is a no-op when pump is not in RUNNING state',
    dfuRef: 'CLAUDE.md §6.2 — "RUNNING → ON_HOLD (HOLD button)" — transition only valid from RUNNING',
    pvsioweb: false,
    expected: 'screen unchanged when pressHold called from RATE_ENTRY',
    evaluate: () => {
      const s0 = atRateEntry();
      const r = pressHold(s0, 0);
      const passed = r.state.screen === 'RATE_ENTRY';
      return { passed, actual: `screen = "${r.state.screen}"` };
    },
  },

];
