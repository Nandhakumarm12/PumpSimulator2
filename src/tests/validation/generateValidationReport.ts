/**
 * Standalone Behavioural Fidelity Validation report generator.
 *
 * Runs all BFV test cases and writes a structured JSON report to
 * data/validation/report.json. This report is the primary artefact
 * cited in Paper 2 (Section 6: Behavioural Fidelity Validation).
 *
 * Usage:
 *   npm run validate
 *
 * Output: data/validation/report.json
 *
 * The JSON report contains:
 *   - Per-device pass rate
 *   - Per-test result with DFU reference, expected, actual, pass/fail
 *   - PVSio-web formal model alignment flag per test
 *
 * NO React imports allowed in this file.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { ALARIS_TEST_CASES } from './alarisTestCases';
import { BRAUN_TEST_CASES } from './braunTestCases';
import { GRASEBY_TEST_CASES } from './grasebyTestCases';
import { CROSS_DEVICE_TEST_CASES } from './crossDeviceTestCases';
import type { BFVTestCase, BFVTestResult, ValidationReport, DeviceSummary } from './validationTypes';

const ALL_CASES: BFVTestCase[] = [
  ...ALARIS_TEST_CASES,
  ...BRAUN_TEST_CASES,
  ...GRASEBY_TEST_CASES,
  ...CROSS_DEVICE_TEST_CASES,
];

function runAll(): ValidationReport {
  const results: BFVTestResult[] = ALL_CASES.map(tc => {
    let passed = false;
    let actual = 'ERROR: evaluate() threw an exception';
    try {
      const r = tc.evaluate();
      passed = r.passed;
      actual = r.actual;
    } catch (err) {
      actual = `EXCEPTION: ${err instanceof Error ? err.message : String(err)}`;
    }
    return {
      id:          tc.id,
      device:      tc.device,
      description: tc.description,
      dfuRef:      tc.dfuRef,
      pvsioweb:    tc.pvsioweb,
      expected:    tc.expected,
      actual,
      passed,
    };
  });

  const total  = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;

  const byDevice: Record<string, DeviceSummary> = {};
  for (const r of results) {
    if (!byDevice[r.device]) byDevice[r.device] = { total: 0, passed: 0, failed: 0 };
    byDevice[r.device].total++;
    if (r.passed) byDevice[r.device].passed++;
    else          byDevice[r.device].failed++;
  }

  return {
    generatedAt: new Date().toISOString(),
    totalTests:  total,
    passed,
    failed,
    passRate:    parseFloat((passed / total).toFixed(4)),
    byDevice,
    tests:       results,
  };
}

function printSummary(report: ValidationReport): void {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  Behavioural Fidelity Validation Report');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Generated : ${report.generatedAt}`);
  console.log(`  Total     : ${report.totalTests} tests`);
  console.log(`  Passed    : ${report.passed}`);
  console.log(`  Failed    : ${report.failed}`);
  console.log(`  Pass rate : ${(report.passRate * 100).toFixed(1)}%`);
  console.log('');
  console.log('  By device:');
  for (const [device, s] of Object.entries(report.byDevice)) {
    const rate = ((s.passed / s.total) * 100).toFixed(0);
    console.log(`    ${device.padEnd(16)} ${s.passed}/${s.total} (${rate}%)`);
  }
  if (report.failed > 0) {
    console.log('\n  FAILURES:');
    for (const r of report.tests.filter(t => !t.passed)) {
      console.log(`    [${r.id}] ${r.description}`);
      console.log(`           Expected : ${r.expected}`);
      console.log(`           Actual   : ${r.actual}`);
      console.log(`           DFU ref  : ${r.dfuRef}`);
    }
  }
  console.log('═══════════════════════════════════════════════════════\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const report = runAll();
printSummary(report);

const outDir = join(process.cwd(), 'data', 'validation');
mkdirSync(outDir, { recursive: true });

const outPath = join(outDir, 'report.json');
writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf-8');
console.log(`Report written to: ${outPath}\n`);

if (report.failed > 0) process.exit(1);
