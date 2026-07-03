/**
 * Behavioural Fidelity Validation — Vitest runner.
 *
 * Runs all BFV test cases as standard Vitest tests.
 * Each test case's evaluate() function is called; a failure means the
 * simulator deviates from the corresponding DFU specification.
 *
 * Usage:
 *   npm test                  — run all tests
 *   npm run validate          — run tests + generate data/validation/report.json
 *
 * Test IDs follow the pattern:
 *   BFV-AG-NNN  Alaris GP (BD 1000DF00152 / BDDF00535)
 *   BFV-BB-NNN  B. Braun Infusomat Space (IFU 586U-US / 686N-GB)
 *   BFV-GR-NNN  Graseby 3100 (Operators Manual 2002)
 *   BFV-CD-NNN  Cross-device comparison
 */

import { describe, it, expect } from 'vitest';
import { ALARIS_TEST_CASES } from './alarisTestCases';
import { BRAUN_TEST_CASES } from './braunTestCases';
import { GRASEBY_TEST_CASES } from './grasebyTestCases';
import { CROSS_DEVICE_TEST_CASES } from './crossDeviceTestCases';
import type { BFVTestCase } from './validationTypes';

function runSuite(label: string, cases: BFVTestCase[]) {
  describe(label, () => {
    for (const tc of cases) {
      it(`[${tc.id}] ${tc.description}`, () => {
        const { passed, actual } = tc.evaluate();
        expect(passed, `Expected: ${tc.expected}\nActual:   ${actual}\nDFU ref:  ${tc.dfuRef}`).toBe(true);
      });
    }
  });
}

runSuite('Alaris GP — BD 1000DF00152 / BDDF00535', ALARIS_TEST_CASES);
runSuite('B. Braun Infusomat Space — IFU 586U-US / 686N-GB', BRAUN_TEST_CASES);
runSuite('Graseby 3100 — Operators Manual 2002', GRASEBY_TEST_CASES);
runSuite('Cross-Device Comparison', CROSS_DEVICE_TEST_CASES);
