/**
 * Types for the Behavioural Fidelity Validation (BFV) suite.
 * Each test maps a simulator behaviour to a specific DFU section or formal model reference.
 * Used by both the Vitest runner and the standalone report generator.
 * NO React imports allowed in this file.
 */

/** The device under test for a given BFV test case. */
export type BFVDevice = 'ALARIS_GP' | 'B_BRAUN' | 'GRASEBY' | 'CROSS_DEVICE';

/**
 * A single behavioural fidelity test case.
 * The evaluate() function executes the assertion and returns the result.
 * This design lets both Vitest and the report generator share the same logic.
 */
export interface BFVTestCase {
  /** Unique test identifier, e.g. "BFV-AG-001". Prefix indicates device. */
  id: string;
  /** Device this test validates. */
  device: BFVDevice;
  /** Human-readable description of the behaviour being tested. */
  description: string;
  /** DFU section / document / CVE that specifies this behaviour. */
  dfuRef: string;
  /** true if this behaviour is also validated against the PVSio-web formal model (Alaris GP only). */
  pvsioweb: boolean;
  /** Human-readable string describing the expected outcome. */
  expected: string;
  /**
   * Execute the test.
   * @returns { passed, actual } — passed is true if behaviour matches spec,
   *          actual is a human-readable string describing the observed outcome.
   */
  evaluate: () => { passed: boolean; actual: string };
}

/** Result of running a BFVTestCase — evaluate() output merged with metadata. */
export interface BFVTestResult {
  id: string;
  device: BFVDevice;
  description: string;
  dfuRef: string;
  pvsioweb: boolean;
  expected: string;
  actual: string;
  passed: boolean;
}

/** Aggregated pass/fail counts for a single device group. */
export interface DeviceSummary {
  total: number;
  passed: number;
  failed: number;
}

/** Full validation report output — written to data/validation/report.json. */
export interface ValidationReport {
  generatedAt: string;
  totalTests: number;
  passed: number;
  failed: number;
  passRate: number;
  byDevice: Record<string, DeviceSummary>;
  tests: BFVTestResult[];
}
