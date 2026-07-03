/**
 * Behavioural Fidelity Validation — B. Braun Infusomat Space LVP.
 *
 * Each test maps one simulator behaviour to a specific section of the official
 * B. Braun Infusomat Space IFU (bbraunusa.com 2024, documents 586U-US / 686N-GB)
 * or to the CISA advisory ICSMA-21-294-01 (CVE-2021-33885 / CVE-2021-33882).
 *
 * Key contrasts with the Alaris GP (tested in alarisTestCases.ts):
 *   - Three-tier guardrail vs Alaris GP two-tier
 *   - Advisory acknowledgement (no explicit override required)
 *   - No rateBuffer — rate edited directly
 *   - SpaceCom2 network module (no equivalent in Alaris GP)
 *   - BOLUS_MAX_ML = 2.0 ml (vs Alaris GP 5.0 ml)
 *   - Starts at STARTUP screen, not LANGUAGE_SELECT
 *
 * NO React imports allowed in this file.
 */

import {
  getInitialBraunState,
  completeBoot,
  selectDrug,
  adjustChevron,
  pressRun,
  acknowledgeAdvisory,
  overrideGuardrail,
  reEnterRate,
  pressHold,
  pressRun_fromHold,
  stopBolus,
  connectSpaceCom2,
  disconnectSpaceCom2,
  infusionTick,
  confirmVtbi,
} from '../../pump/braun/braunStateMachine';
import { BRAUN_DEFAULTS } from '../../pump/braun/braunConstants';
import { BRAUN_DRUG_LIBRARY } from '../../pump/braun/braunDrugLibrary';
import type { BraunPumpState } from '../../pump/braun/braunTypes';
import type { BFVTestCase } from './validationTypes';

// ─── State Helpers ────────────────────────────────────────────────────────────

const MORPHINE = BRAUN_DRUG_LIBRARY.find(d => d.id === 'morphine')!;
const MANUAL_BB = BRAUN_DRUG_LIBRARY.find(d => d.id === 'manual')!;

function atDrugSelect(): BraunPumpState {
  return completeBoot(getInitialBraunState(), 0).state;
}

function atRateEntry(rate = 2): BraunPumpState {
  return { ...selectDrug(atDrugSelect(), MORPHINE, 0).state, rate };
}

function atRunning(rate = 5): BraunPumpState {
  return pressRun(atRateEntry(rate), MORPHINE, 70, 0).state;
}

function runningForTick(rate = 100, vtbi = 0, vtbiSet = false): BraunPumpState {
  return {
    ...getInitialBraunState(),
    screen: 'RUNNING',
    rate,
    vtbi,
    vtbiSet,
    volumeInfused: 0,
    kvoActive: false,
    selectedDrugId: 'manual',
  };
}

// ─── Test Cases ───────────────────────────────────────────────────────────────

export const BRAUN_TEST_CASES: BFVTestCase[] = [

  {
    id: 'BFV-BB-001',
    device: 'B_BRAUN',
    description: 'Power-on state is STARTUP (self-test), not LANGUAGE_SELECT',
    dfuRef: 'B. Braun IFU §Startup sequence — "Device performs self-test on power-on"',
    pvsioweb: false,
    expected: 'screen === "STARTUP"',
    evaluate: () => {
      const s = getInitialBraunState();
      const passed = s.screen === 'STARTUP';
      return { passed, actual: `screen = "${s.screen}"` };
    },
  },

  {
    id: 'BFV-BB-002',
    device: 'B_BRAUN',
    description: 'STARTUP → DRUG_SELECT on completeBoot()',
    dfuRef: 'B. Braun IFU §Power-on — "Self-test complete: pump advances to drug selection"',
    pvsioweb: false,
    expected: 'screen === "DRUG_SELECT"',
    evaluate: () => {
      const r = completeBoot(getInitialBraunState(), 0);
      const passed = r.state.screen === 'DRUG_SELECT';
      return { passed, actual: `screen = "${r.state.screen}"` };
    },
  },

  {
    id: 'BFV-BB-003',
    device: 'B_BRAUN',
    description: 'Rate in advisory zone (within 20% of softMax) triggers GUARDRAIL_ADVISORY on RUN',
    dfuRef: 'B. Braun IFU "Clinical Advisories" tier — rate within 20% of soft limit boundary; BRAUN_DEFAULTS.ADVISORY_ZONE_FRACTION = 0.20',
    pvsioweb: false,
    expected: 'screen === "GUARDRAIL_ADVISORY" (morphine rate=9, advisory threshold=8.0, softMax=10)',
    evaluate: () => {
      // morphine softMax=10; advisory zone = rate > 10*(1-0.20)=8.0 and rate <=10
      const r = pressRun(atRateEntry(9), MORPHINE, 70, 0);
      const passed = r.state.screen === 'GUARDRAIL_ADVISORY';
      return { passed, actual: `screen = "${r.state.screen}"` };
    },
  },

  {
    id: 'BFV-BB-004',
    device: 'B_BRAUN',
    description: 'Rate exceeding soft limit triggers GUARDRAIL_WARNING (Soft Stop) on RUN',
    dfuRef: 'B. Braun IFU "Soft Stop" tier — "Rate exceeds programmed soft limit; nurse must override or re-enter"',
    pvsioweb: false,
    expected: 'screen === "GUARDRAIL_WARNING" (morphine rate=15 > softMax=10)',
    evaluate: () => {
      const r = pressRun(atRateEntry(15), MORPHINE, 70, 0);
      const passed = r.state.screen === 'GUARDRAIL_WARNING';
      return { passed, actual: `screen = "${r.state.screen}"` };
    },
  },

  {
    id: 'BFV-BB-005',
    device: 'B_BRAUN',
    description: 'Rate exceeding hard limit triggers GUARDRAIL_BLOCKED (Hard Stop) on RUN',
    dfuRef: 'B. Braun IFU "Hard Stop" tier — "Rate exceeds hard limit; only RE-ENTER permitted"',
    pvsioweb: false,
    expected: 'screen === "GUARDRAIL_BLOCKED" (morphine rate=25 > hardMax=20)',
    evaluate: () => {
      const r = pressRun(atRateEntry(25), MORPHINE, 70, 0);
      const passed = r.state.screen === 'GUARDRAIL_BLOCKED';
      return { passed, actual: `screen = "${r.state.screen}"` };
    },
  },

  {
    id: 'BFV-BB-006',
    device: 'B_BRAUN',
    description: 'Acknowledging advisory notice transitions to RUNNING and logs event',
    dfuRef: 'B. Braun IFU "Clinical Advisories" — "Nurse acknowledges to continue; infusion starts automatically"',
    pvsioweb: false,
    expected: 'screen === "RUNNING", log contains guardrail_advisory_acknowledged',
    evaluate: () => {
      const advisoryState = pressRun(atRateEntry(9), MORPHINE, 70, 0).state;
      const r = acknowledgeAdvisory(advisoryState, MORPHINE, 100);
      const screenOk = r.state.screen === 'RUNNING';
      const logOk = r.logEntries.some(e => e.event === 'guardrail_advisory_acknowledged');
      const passed = screenOk && logOk;
      return { passed, actual: `screen="${r.state.screen}", advisory_ack logged=${logOk}` };
    },
  },

  {
    id: 'BFV-BB-007',
    device: 'B_BRAUN',
    description: 'Advisory zone boundary is exactly 20% of soft limit (ADVISORY_ZONE_FRACTION=0.20)',
    dfuRef: 'B. Braun IFU "Clinical Advisories"; BRAUN_DEFAULTS.ADVISORY_ZONE_FRACTION = 0.20',
    pvsioweb: false,
    expected: 'rate=8.0 (exactly at threshold) → NOT advisory; rate=8.1 → advisory',
    evaluate: () => {
      // morphine softMax=10; advisory zone: rate > 10*(1-0.20) = 8.0 strictly
      const atThreshold = pressRun(atRateEntry(8.0), MORPHINE, 70, 0);
      const aboveThreshold = pressRun(atRateEntry(8.1), MORPHINE, 70, 0);
      const thresholdIsOk = atThreshold.state.screen === 'RUNNING';   // 8.0 is NOT advisory
      const aboveIsAdvisory = aboveThreshold.state.screen === 'GUARDRAIL_ADVISORY';
      const passed = thresholdIsOk && aboveIsAdvisory;
      return {
        passed,
        actual: `rate=8.0 → "${atThreshold.state.screen}", rate=8.1 → "${aboveThreshold.state.screen}"`,
      };
    },
  },

  {
    id: 'BFV-BB-008',
    device: 'B_BRAUN',
    description: 'Bolus volume is clamped at BOLUS_MAX_ML = 2.0 ml (vs Alaris GP 5.0 ml)',
    dfuRef: 'B. Braun IFU Bolus section — "Bolus Volume Max 2 ml"; BRAUN_DEFAULTS.BOLUS_MAX_ML = 2.0',
    pvsioweb: false,
    expected: 'bolusVolumeDelivered clamped to 2.0 ml when 3.0 ml was accumulated',
    evaluate: () => {
      const stateWith3ml: BraunPumpState = {
        ...getInitialBraunState(),
        screen: 'RUNNING',
        bolusActive: true,
        bolusVolumeDelivered: 3.0, // exceeded max
      };
      const r = stopBolus(stateWith3ml, 0);
      const passed = r.state.bolusVolumeDelivered === BRAUN_DEFAULTS.BOLUS_MAX_ML;
      return {
        passed,
        actual: `bolusVolumeDelivered = ${r.state.bolusVolumeDelivered} ml (max = ${BRAUN_DEFAULTS.BOLUS_MAX_ML})`,
      };
    },
  },

  {
    id: 'BFV-BB-009',
    device: 'B_BRAUN',
    description: 'Connecting SpaceCom2 sets spacecom2Connected=true and logs spacecom2_connected',
    dfuRef: 'B. Braun SpaceCom2 module docs; CISA ICSMA-21-294-01 — CVE-2021-33882 attack surface (networked device)',
    pvsioweb: false,
    expected: 'spacecom2Connected === true, log contains spacecom2_connected',
    evaluate: () => {
      const s0 = { ...getInitialBraunState(), spacecom2Connected: false };
      const r = connectSpaceCom2(s0, 0);
      const flagOk = r.state.spacecom2Connected === true;
      const logOk = r.logEntries.some(e => e.event === 'spacecom2_connected');
      const passed = flagOk && logOk;
      return { passed, actual: `connected=${r.state.spacecom2Connected}, event logged=${logOk}` };
    },
  },

  {
    id: 'BFV-BB-010',
    device: 'B_BRAUN',
    description: 'Disconnecting SpaceCom2 sets spacecom2Connected=false and logs spacecom2_disconnected',
    dfuRef: 'B. Braun SpaceCom2 module docs — disconnected pump cannot receive drug library updates',
    pvsioweb: false,
    expected: 'spacecom2Connected === false, log contains spacecom2_disconnected',
    evaluate: () => {
      const r = disconnectSpaceCom2(getInitialBraunState(), 0);
      const flagOk = r.state.spacecom2Connected === false;
      const logOk = r.logEntries.some(e => e.event === 'spacecom2_disconnected');
      const passed = flagOk && logOk;
      return { passed, actual: `connected=${r.state.spacecom2Connected}, event logged=${logOk}` };
    },
  },

  {
    id: 'BFV-BB-011',
    device: 'B_BRAUN',
    description: 'RUNNING → ON_HOLD on pressHold()',
    dfuRef: 'B. Braun IFU §HOLD button — "Suspends infusion, amber LED lit"',
    pvsioweb: false,
    expected: 'screen === "ON_HOLD"',
    evaluate: () => {
      const r = pressHold(atRunning(5), 0);
      const passed = r.state.screen === 'ON_HOLD';
      return { passed, actual: `screen = "${r.state.screen}"` };
    },
  },

  {
    id: 'BFV-BB-012',
    device: 'B_BRAUN',
    description: 'ON_HOLD → RUNNING on pressRun_fromHold()',
    dfuRef: 'B. Braun IFU §RUN button from hold — "Resumes infusion at programmed rate"',
    pvsioweb: false,
    expected: 'screen === "RUNNING"',
    evaluate: () => {
      const onHold = pressHold(atRunning(5), 0).state;
      const r = pressRun_fromHold(onHold, 100);
      const passed = r.state.screen === 'RUNNING';
      return { passed, actual: `screen = "${r.state.screen}"` };
    },
  },

  {
    id: 'BFV-BB-013',
    device: 'B_BRAUN',
    description: 'INFUSION_COMPLETE alarm fires when volumeInfused reaches VTBI',
    dfuRef: 'B. Braun IFU §VTBI — "Alarm sounds when programmed volume is delivered"',
    pvsioweb: false,
    expected: 'screen === "ALARM", alarmType === "INFUSION_COMPLETE"',
    evaluate: () => {
      const st = runningForTick(100, 0.01, true);
      const r = infusionTick(st, MANUAL_BB, 70, 0);
      const passed = r.state.screen === 'ALARM' && r.state.alarmType === 'INFUSION_COMPLETE';
      return { passed, actual: `screen="${r.state.screen}", alarmType="${r.state.alarmType}"` };
    },
  },

  {
    id: 'BFV-BB-014',
    device: 'B_BRAUN',
    description: 'KVO rate = 1.0 ml/h after INFUSION_COMPLETE (same as Alaris GP)',
    dfuRef: 'B. Braun IFU — "KVO rate 1 ml/h"; BRAUN_DEFAULTS.KVO_RATE = 1.0',
    pvsioweb: false,
    expected: 'state.rate === 1.0 after INFUSION_COMPLETE',
    evaluate: () => {
      const st = runningForTick(100, 0.01, true);
      const r = infusionTick(st, MANUAL_BB, 70, 0);
      const passed = r.state.rate === BRAUN_DEFAULTS.KVO_RATE;
      return { passed, actual: `rate = ${r.state.rate} ml/h (expected ${BRAUN_DEFAULTS.KVO_RATE})` };
    },
  },

  {
    id: 'BFV-BB-015',
    device: 'B_BRAUN',
    description: 'Rate is edited directly in state.rate (no separate rateBuffer field)',
    dfuRef: 'B. Braun Infusomat Space IFU — rate entry model; braunStateMachine.ts design note §6',
    pvsioweb: false,
    expected: 'adjustChevron updates state.rate directly; no rateBuffer property in BraunPumpState',
    evaluate: () => {
      const s0 = atRateEntry(5);
      const r = adjustChevron(s0, +1, 0, []);
      const rateUpdated = r.state.rate === 6;
      const noRateBuffer = !('rateBuffer' in r.state);
      const passed = rateUpdated && noRateBuffer;
      return { passed, actual: `rate=${r.state.rate}, rateBuffer absent=${noRateBuffer}` };
    },
  },

  {
    id: 'BFV-BB-016',
    device: 'B_BRAUN',
    description: 'firmwareSigned = false by design on all Infusomat Space devices',
    dfuRef: 'CISA ICSMA-21-294-01 — CVE-2021-33885 (CVSS 9.0): firmware update protocol lacks cryptographic signature verification',
    pvsioweb: false,
    expected: 'BRAUN_DEFAULTS.FIRMWARE_SIGNED === false; initial state firmwareSigned === false',
    evaluate: () => {
      const defaultsOk = BRAUN_DEFAULTS.FIRMWARE_SIGNED === false;
      const stateOk = getInitialBraunState().firmwareSigned === false;
      const passed = defaultsOk && stateOk;
      return { passed, actual: `BRAUN_DEFAULTS.FIRMWARE_SIGNED=${BRAUN_DEFAULTS.FIRMWARE_SIGNED}, state.firmwareSigned=${getInitialBraunState().firmwareSigned}` };
    },
  },

  {
    id: 'BFV-BB-017',
    device: 'B_BRAUN',
    description: 'MANUAL mode bypasses all three guardrail tiers — infusion starts immediately',
    dfuRef: 'B. Braun IFU — "MANUAL mode: drug library not consulted, no guardrail limits apply"',
    pvsioweb: false,
    expected: 'screen === "RUNNING" with MANUAL drug at 500 ml/h',
    evaluate: () => {
      const s = { ...selectDrug(atDrugSelect(), MANUAL_BB, 0).state, rate: 500 };
      const r = pressRun(s, MANUAL_BB, 70, 0);
      const passed = r.state.screen === 'RUNNING';
      return { passed, actual: `screen = "${r.state.screen}"` };
    },
  },

  {
    id: 'BFV-BB-018',
    device: 'B_BRAUN',
    description: 'confirmVtbi() sets vtbi and vtbiSet=true, returns to RATE_ENTRY',
    dfuRef: 'B. Braun IFU §VTBI programming — "VTBI confirmed: pump stores volume, returns to rate screen"',
    pvsioweb: false,
    expected: 'vtbi === 250, vtbiSet === true, screen === "RATE_ENTRY"',
    evaluate: () => {
      const vtbiState: BraunPumpState = { ...atRateEntry(), screen: 'VTBI_ENTRY', vtbiBuffer: 250 };
      const r = confirmVtbi(vtbiState, 250, 0);
      const passed = r.state.vtbi === 250 && r.state.vtbiSet === true && r.state.screen === 'RATE_ENTRY';
      return { passed, actual: `vtbi=${r.state.vtbi}, vtbiSet=${r.state.vtbiSet}, screen="${r.state.screen}"` };
    },
  },

];
