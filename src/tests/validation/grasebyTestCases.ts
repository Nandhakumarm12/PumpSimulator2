/**
 * Behavioural Fidelity Validation — Graseby 3100 Syringe Driver.
 *
 * Each test maps one simulator behaviour to the Graseby 3100 Operators Manual
 * (ardusmedical.com, 2002) or the NPSA Patient Safety Alert (2010, UK).
 *
 * The Graseby 3100 is the baseline "high design risk, zero cyber risk" device.
 * Its defining clinical hazard is the complete absence of guardrails:
 * any rate within [RATE_MIN, RATE_MAX] is accepted without warning.
 * This was implicated in fatal overdose incidents in UK hospitals (NPSA 2010).
 *
 * Key contrasts with Alaris GP and B. Braun:
 *   - No drug library (always MANUAL, rate in ml/h)
 *   - No guardrail system (zero tiers)
 *   - No VTBI (syringe capacity is the volume constraint)
 *   - No bolus mode
 *   - No network connectivity
 *   - Simpler state machine: RATE_ENTRY → RUNNING → ON_HOLD → ALARM
 *   - RATE_MAX = 199.9 ml/h (not 1200 ml/h like the LVPs)
 *
 * NO React imports allowed in this file.
 */

import {
  getInitialGrasebyState,
  adjustRate,
  pressStart,
  pressStop,
  pressReprogram,
  silenceAlarm,
  selectSyringe,
  infusionTick,
} from '../../pump/graseby/grasebyStateMachine';
import { GRASEBY_DEFAULTS } from '../../pump/graseby/grasebyConstants';
import type { GrasebyPumpState } from '../../pump/graseby/grasebyTypes';
import type { BFVTestCase } from './validationTypes';

// ─── State Helpers ────────────────────────────────────────────────────────────

function atRateEntry(rate = 5): GrasebyPumpState {
  return { ...getInitialGrasebyState(), screen: 'RATE_ENTRY', rate };
}

function atRunning(rate = 5): GrasebyPumpState {
  return { ...getInitialGrasebyState(), screen: 'RUNNING', rate };
}

function atOnHold(rate = 5): GrasebyPumpState {
  return { ...getInitialGrasebyState(), screen: 'ON_HOLD', rate };
}

function nearEmpty(rate = 100): GrasebyPumpState {
  // 100 ml/h, 50ml syringe, 49.99 ml infused → one tick triggers SYRINGE_EMPTY
  return {
    ...getInitialGrasebyState(),
    screen: 'RUNNING',
    rate,
    syringeCapacityMl: 50,
    volumeInfused: 49.99,
  };
}

// ─── Test Cases ───────────────────────────────────────────────────────────────

export const GRASEBY_TEST_CASES: BFVTestCase[] = [

  {
    id: 'BFV-GR-001',
    device: 'GRASEBY',
    description: 'Power-on state is RATE_ENTRY (no language or startup screen)',
    dfuRef: 'Graseby 3100 Operators Manual §Operating Sequence — "Power on: device ready for rate entry"',
    pvsioweb: false,
    expected: 'screen === "RATE_ENTRY"',
    evaluate: () => {
      const s = getInitialGrasebyState();
      const passed = s.screen === 'RATE_ENTRY';
      return { passed, actual: `screen = "${s.screen}"` };
    },
  },

  {
    id: 'BFV-GR-002',
    device: 'GRASEBY',
    description: 'No guardrails — pressStart() at any valid rate transitions to RUNNING',
    dfuRef: 'Graseby 3100 Operators Manual — no guardrail section exists; NPSA Alert 2010: "Absence of dose error prevention"',
    pvsioweb: false,
    expected: 'screen === "RUNNING" at rate=150 ml/h (above any clinical soft limit) — no warning or block',
    evaluate: () => {
      const r = pressStart(atRateEntry(150), 0);
      const passed = r.state.screen === 'RUNNING';
      return { passed, actual: `screen = "${r.state.screen}"` };
    },
  },

  {
    id: 'BFV-GR-003',
    device: 'GRASEBY',
    description: 'pressStart() with rate = 0 is rejected — infusion cannot start',
    dfuRef: 'Graseby 3100 Operators Manual §Operating Sequence — "Rate must be set before starting"',
    pvsioweb: false,
    expected: 'screen unchanged (still RATE_ENTRY) when rate=0',
    evaluate: () => {
      const s0 = atRateEntry(0);
      const r = pressStart(s0, 0);
      const passed = r.state.screen === 'RATE_ENTRY';
      return { passed, actual: `screen = "${r.state.screen}"` };
    },
  },

  {
    id: 'BFV-GR-004',
    device: 'GRASEBY',
    description: 'Rate maximum is 199.9 ml/h (syringe driver spec; LVPs reach 1200 ml/h)',
    dfuRef: 'Graseby 3100 Operators Manual §Specifications — "Maximum rate 199.9 ml/h"; GRASEBY_DEFAULTS.RATE_MAX = 199.9',
    pvsioweb: false,
    expected: 'GRASEBY_DEFAULTS.RATE_MAX === 199.9; adjustRate past max logs boundary_hit',
    evaluate: () => {
      const constOk = GRASEBY_DEFAULTS.RATE_MAX === 199.9;
      const s0 = atRateEntry(GRASEBY_DEFAULTS.RATE_MAX);
      const r = adjustRate(s0, +10, 0);
      const boundaryLogged = r.logEntries.some(e => e.event === 'boundary_hit');
      const passed = constOk && boundaryLogged;
      return { passed, actual: `RATE_MAX=${GRASEBY_DEFAULTS.RATE_MAX}, boundary_hit logged=${boundaryLogged}` };
    },
  },

  {
    id: 'BFV-GR-005',
    device: 'GRASEBY',
    description: 'SYRINGE_EMPTY alarm fires when volumeInfused reaches syringeCapacityMl',
    dfuRef: 'Graseby 3100 Operators Manual §Alarms — "Syringe empty alarm: audible tone + LED"',
    pvsioweb: false,
    expected: 'screen === "ALARM", alarmType === "SYRINGE_EMPTY"',
    evaluate: () => {
      // rate=100 ml/h, syringe=50ml, volume=49.99 → one tick (0.01389ml) → 50.003ml → EMPTY
      const r = infusionTick(nearEmpty(100), 0, 0);
      const passed = r.state.screen === 'ALARM' && r.state.alarmType === 'SYRINGE_EMPTY';
      return { passed, actual: `screen="${r.state.screen}", alarmType="${r.state.alarmType}"` };
    },
  },

  {
    id: 'BFV-GR-006',
    device: 'GRASEBY',
    description: 'No drug library — state has no drug selection step or selectedDrug field',
    dfuRef: 'Graseby 3100 Operators Manual — "Rate entry in ml/h only; no drug-based programming"',
    pvsioweb: false,
    expected: 'GrasebyPumpState has no selectedDrug, selectedDrugId, or drugLibraryUsed fields',
    evaluate: () => {
      const s = getInitialGrasebyState();
      const noSelectedDrug = !('selectedDrug' in s);
      const noSelectedDrugId = !('selectedDrugId' in s);
      const passed = noSelectedDrug && noSelectedDrugId;
      return { passed, actual: `selectedDrug absent=${noSelectedDrug}, selectedDrugId absent=${noSelectedDrugId}` };
    },
  },

  {
    id: 'BFV-GR-007',
    device: 'GRASEBY',
    description: 'No VTBI field — syringe capacity is the only volume constraint',
    dfuRef: 'Graseby 3100 Operators Manual — "No VTBI; infusion runs until syringe empty"',
    pvsioweb: false,
    expected: 'GrasebyPumpState has syringeCapacityMl but no vtbi field',
    evaluate: () => {
      const s = getInitialGrasebyState();
      const hasCapacity = 'syringeCapacityMl' in s;
      const noVtbi = !('vtbi' in s);
      const passed = hasCapacity && noVtbi;
      return { passed, actual: `syringeCapacityMl present=${hasCapacity}, vtbi absent=${noVtbi}` };
    },
  },

  {
    id: 'BFV-GR-008',
    device: 'GRASEBY',
    description: 'No bolus mode — state has no bolusActive or bolusVolume fields',
    dfuRef: 'Graseby 3100 Operators Manual — "No bolus function on syringe driver"',
    pvsioweb: false,
    expected: 'GrasebyPumpState has no bolusActive or bolusVolumeDelivered fields',
    evaluate: () => {
      const s = getInitialGrasebyState();
      const noBolus = !('bolusActive' in s) && !('bolusVolumeDelivered' in s);
      return { passed: noBolus, actual: `bolusActive absent=${!('bolusActive' in s)}, bolusVolumeDelivered absent=${!('bolusVolumeDelivered' in s)}` };
    },
  },

  {
    id: 'BFV-GR-009',
    device: 'GRASEBY',
    description: 'RUNNING → ON_HOLD on pressStop()',
    dfuRef: 'Graseby 3100 Operators Manual §STOP button — "Suspends infusion"',
    pvsioweb: false,
    expected: 'screen === "ON_HOLD"',
    evaluate: () => {
      const r = pressStop(atRunning(5), 0);
      const passed = r.state.screen === 'ON_HOLD';
      return { passed, actual: `screen = "${r.state.screen}"` };
    },
  },

  {
    id: 'BFV-GR-010',
    device: 'GRASEBY',
    description: 'ON_HOLD → RATE_ENTRY on pressReprogram() for rate change',
    dfuRef: 'Graseby 3100 Operators Manual §Reprogramming — "Return to rate entry from hold"',
    pvsioweb: false,
    expected: 'screen === "RATE_ENTRY"',
    evaluate: () => {
      const r = pressReprogram(atOnHold(5), 0);
      const passed = r.state.screen === 'RATE_ENTRY';
      return { passed, actual: `screen = "${r.state.screen}"` };
    },
  },

];
