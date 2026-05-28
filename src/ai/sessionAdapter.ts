/**
 * sessionAdapter — normalises B. Braun and Alaris GP session data into the
 * common format expected by extractFeatures(), then assembles a full TrainingRecord.
 *
 * ARCHITECTURE ROLE:
 *   Bridge between the two device state machines and the shared AI pipeline.
 *   Allows Task Mode (and future simulators) to save real human sessions as
 *   TrainingRecords without duplicating feature extraction logic.
 *
 * KEY DESIGN:
 *   - BraunSessionLogEntry has the same event name strings as SessionLogEntry for
 *     all events that extractFeatures() counts (rate_adjust, correction, boundary_hit,
 *     guardrail_warning, guardrail_override, guardrail_blocked, infusion_started,
 *     bolus_ended). The index signature on SessionLogEntry ([key: string]: unknown)
 *     makes the cast safe.
 *   - BraunPumpState is mapped to a PumpState-shaped object covering only the
 *     fields that extractFeatures() actually reads.
 *
 * NO React imports allowed in this file.
 */

/** Generate a RFC-4122 v4 UUID using the Web Crypto API. */
function uuidv4(): string { return crypto.randomUUID(); }
import type { PumpState, SessionLogEntry } from '../pump/types';
import type { BraunPumpState, BraunSessionLogEntry } from '../pump/braun/braunTypes';
import { BRAUN_DRUG_LIBRARY } from '../pump/braun/braunDrugLibrary';
import { BRAUN_DEFAULTS } from '../pump/braun/braunConstants';
import { BRAUN_CVE_FIRMWARE_VERSIONS } from '../pump/braun/braunConstants';
import { CVE_FIRMWARE_VERSIONS } from '../ai/scenarioGenerator';
import type { GrasebyPumpState, GrasebySessionLogEntry } from '../pump/graseby/grasebyTypes';
import { GRASEBY_DEFAULTS } from '../pump/graseby/grasebyConstants';
import { DRUG_LIBRARY } from '../pump/drugLibrary';
import { extractFeatures } from './featureExtractor';
import { applyLabellingRules } from './labellingRules';
import { computeDesignScore } from './deviceDesign';
import type { TrainingRecord } from './featureExtractor';
import type { DeviceContext } from './scenarioGenerator';

// ─── UI Device Context ────────────────────────────────────────────────────────

/**
 * The subset of DeviceContext that a researcher configures manually in the UI.
 * All Layer 3 (system) fields. Firmware risk is auto-derived from pump_model.
 */
export interface UIDeviceContext {
  days_since_maintenance:  number;   // default 30
  battery_level_pct:       number;   // default 100
  network_connected:       0 | 1;    // default 1
  drug_library_age_days:   number;   // default 14
  config_drift_score:      number;   // default 0.05 (0.0–1.0)
  recent_occlusion_alarms: number;   // default 0
}

/** Default UIDeviceContext for a "well-maintained, connected" device. */
export const DEFAULT_UI_DEVICE_CONTEXT: UIDeviceContext = {
  days_since_maintenance:  30,
  battery_level_pct:       100,
  network_connected:       1,
  drug_library_age_days:   14,
  config_drift_score:      0.05,
  recent_occlusion_alarms: 0,
};

// ─── Build DeviceContext from UI inputs ───────────────────────────────────────

/**
 * Construct a full DeviceContext (as expected by extractFeatures) from UI inputs.
 *
 * @param device   - 'alaris_gp' | 'braun_infusomat'
 * @param uiCtx    - Values entered by the researcher in the Task Mode device panel
 * @returns        A DeviceContext with record_id, session_id, timestamps filled in
 */
export function buildDeviceContext(
  device: 'alaris_gp' | 'braun_infusomat' | 'graseby_3100',
  uiCtx: UIDeviceContext
): DeviceContext {
  const firmwareVersion =
    device === 'braun_infusomat' ? BRAUN_DEFAULTS.FIRMWARE_VERSION :
    device === 'graseby_3100'    ? GRASEBY_DEFAULTS.FIRMWARE_VERSION :
    '9.12';

  const firmwareRisk: 0 | 1 =
    device === 'braun_infusomat' ? (BRAUN_CVE_FIRMWARE_VERSIONS.includes(firmwareVersion) ? 1 : 0) :
    device === 'graseby_3100'    ? 0 :   // no CVEs documented for Graseby 3100
    (CVE_FIRMWARE_VERSIONS.includes(firmwareVersion) ? 1 : 0);

  return {
    record_id:               `human_${device}_${Date.now()}`,
    session_id:              uuidv4(),
    timestamp_iso:           new Date().toISOString(),
    pump_model:              device,
    firmware_version:        firmwareVersion,
    firmware_version_risk:   firmwareRisk,
    days_since_maintenance:  uiCtx.days_since_maintenance,
    battery_level_pct:       uiCtx.battery_level_pct,
    network_connected:       uiCtx.network_connected,
    drug_library_age_days:   uiCtx.drug_library_age_days,
    config_drift_score:      uiCtx.config_drift_score,
    recent_occlusion_alarms: uiCtx.recent_occlusion_alarms,
  };
}

// ─── B. Braun → Alaris GP adapter ────────────────────────────────────────────

/**
 * Cast a BraunSessionLogEntry array to SessionLogEntry[] for use with extractFeatures.
 *
 * Safe because:
 * - All event names used by extractFeatures exist identically in BraunEventType
 * - SessionLogEntry has an index signature ([key: string]: unknown) that accepts extras
 * - We never mutate the entries — they remain frozen and immutable
 */
export function adaptBraunLog(
  log: readonly BraunSessionLogEntry[]
): readonly SessionLogEntry[] {
  return log as unknown as readonly SessionLogEntry[];
}

/**
 * Build a PumpState-shaped object from BraunPumpState for use with extractFeatures.
 *
 * Only the fields actually read by extractFeatures are mapped accurately.
 * All other PumpState fields are filled with neutral defaults — they are never
 * accessed by extractFeatures and exist only to satisfy the TypeScript type.
 *
 * Fields mapped:
 *   rate, rateBuffer  ← braunState.rate (no separate buffer in B. Braun)
 *   selectedDrug      ← looked up from BRAUN_DRUG_LIBRARY by selectedDrugId
 *   vtbi              ← braunState.vtbiSet ? braunState.vtbi : null
 *   patientWeight     ← braunState.patientWeightKg
 *   pressureLevel     ← braunState.pressureLevel
 *   bolusVolume       ← braunState.bolusVolumeDelivered
 *   batteryLevel      ← braunState.batteryLevel
 */
export function adaptBraunState(state: BraunPumpState): PumpState {
  const drug = BRAUN_DRUG_LIBRARY.find(d => d.id === state.selectedDrugId)
    ?? BRAUN_DRUG_LIBRARY[0];

  return {
    screen:           'RUNNING' as PumpState['screen'],
    selectedDrug:     drug,
    rate:             state.rate,
    rateBuffer:       state.rate,
    vtbi:             state.vtbiSet ? state.vtbi : null,
    vtbiBuffer:       state.vtbiBuffer,
    volumeInfused:    state.volumeInfused,
    patientWeight:    state.patientWeightKg,
    pressureLevel:    state.pressureLevel,
    alarmMessage:     state.alarmMessage,
    alarmType:        null,
    guardrailOverride: state.guardrailAdvisoryAcknowledged,
    bolusActive:      state.bolusActive,
    bolusVolume:      state.bolusVolumeDelivered,
    previousScreen:   'RUNNING' as PumpState['screen'],
    kvoActive:        state.kvoActive,
    mutedUntil:       null,
    drugCursorIndex:  state.drugCursorIndex,
    weightBuffer:     state.patientWeightKg,
    batteryLevel:     state.batteryLevel,
    ailTriggered:     state.ailTriggered,
  };
}

// ─── Graseby 3100 → Alaris GP adapter ────────────────────────────────────────

/**
 * Cast a GrasebySessionLogEntry array to SessionLogEntry[] for use with extractFeatures.
 *
 * Safe because GrasebySessionLogEntry shares the same event name strings for all
 * events extractFeatures counts (rate_adjust, correction, boundary_hit,
 * infusion_started) and has [key: string]: unknown index signature.
 */
export function adaptGrasebyLog(
  log: readonly GrasebySessionLogEntry[]
): readonly SessionLogEntry[] {
  return log as unknown as readonly SessionLogEntry[];
}

/**
 * Build a PumpState-shaped object from GrasebyPumpState for use with extractFeatures.
 *
 * The Graseby 3100 has no drug library — selectedDrug is always the 'manual'
 * drug (id='manual'), which sets drug_library_used=0 and guardrail limits to
 * the full rate range (no soft/hard limits). This is intentional: the absence
 * of a drug library is the defining clinical safety risk of the Graseby 3100.
 *
 * Fields mapped:
 *   rate, rateBuffer   ← grasebyState.rate (no separate buffer)
 *   selectedDrug       ← DRUG_LIBRARY[0] ('manual' drug — always)
 *   vtbi               ← null (no VTBI on Graseby 3100)
 *   patientWeight      ← GRASEBY_DEFAULTS.WEIGHT_DEFAULT (not displayed on device)
 *   pressureLevel      ← 5 (neutral default — no DPS on Graseby 3100)
 *   bolusVolume        ← 0 (no bolus mode)
 *   batteryLevel       ← grasebyState.batteryLevel
 *   ailTriggered       ← grasebyState.ailTriggered
 */
export function adaptGrasebyState(state: GrasebyPumpState): PumpState {
  const manualDrug = DRUG_LIBRARY.find(d => d.id === 'manual') ?? DRUG_LIBRARY[0];
  return {
    screen:           'RUNNING' as PumpState['screen'],
    selectedDrug:     manualDrug,
    rate:             state.rate,
    rateBuffer:       state.rate,
    vtbi:             null,         // no VTBI
    vtbiBuffer:       0,
    volumeInfused:    state.volumeInfused,
    patientWeight:    GRASEBY_DEFAULTS.WEIGHT_DEFAULT,
    pressureLevel:    5,
    alarmMessage:     state.alarmMessage,
    alarmType:        null,
    guardrailOverride: false,       // no guardrails
    bolusActive:      false,        // no bolus
    bolusVolume:      0,
    previousScreen:   'RUNNING' as PumpState['screen'],
    kvoActive:        false,        // no KVO
    mutedUntil:       null,
    drugCursorIndex:  0,
    weightBuffer:     GRASEBY_DEFAULTS.WEIGHT_DEFAULT,
    batteryLevel:     state.batteryLevel,
    ailTriggered:     state.ailTriggered,
  };
}

// ─── Unified TrainingRecord builder ──────────────────────────────────────────

/**
 * Build a complete TrainingRecord from a real human simulator session.
 *
 * Works for both Alaris GP and B. Braun sessions. For B. Braun, the log and
 * state are adapted to the common format before feature extraction.
 *
 * This is the function called by Task Mode when the researcher saves a session.
 *
 * @param device           - Which device was used
 * @param sessionLog       - The complete session log from usePump / useBraunPump
 * @param finalState       - Pump state at moment infusion was started
 * @param uiCtx            - Device context configured by researcher in Task Mode
 * @param intendedRateMlH  - Target rate in ml/h (set before task started)
 * @param alarmsDuring     - Number of alarms triggered during this session
 * @returns Complete TrainingRecord with all layers scored and grade assigned
 */
export function buildTrainingRecord(
  device: 'alaris_gp' | 'braun_infusomat' | 'graseby_3100',
  sessionLog: readonly SessionLogEntry[] | readonly BraunSessionLogEntry[] | readonly GrasebySessionLogEntry[],
  finalState: PumpState | BraunPumpState | GrasebyPumpState,
  uiCtx: UIDeviceContext,
  intendedRateMlH: number,
  alarmsDuring = 0
): TrainingRecord {
  // Normalise to Alaris GP types
  const normLog: readonly SessionLogEntry[] =
    device === 'braun_infusomat' ? adaptBraunLog(sessionLog as readonly BraunSessionLogEntry[]) :
    device === 'graseby_3100'    ? adaptGrasebyLog(sessionLog as readonly GrasebySessionLogEntry[]) :
    (sessionLog as readonly SessionLogEntry[]);

  const normState: PumpState =
    device === 'braun_infusomat' ? adaptBraunState(finalState as BraunPumpState) :
    device === 'graseby_3100'    ? adaptGrasebyState(finalState as GrasebyPumpState) :
    (finalState as PumpState);

  const deviceContext = buildDeviceContext(device, uiCtx);

  // Layer 1–3: extract interaction + config + system features
  const partial = extractFeatures(normLog, normState, deviceContext, intendedRateMlH, alarmsDuring);

  // Layer 1–3 risk scoring
  const labelled = applyLabellingRules(partial);

  // Layer 0: design score (device-specific, fixed)
  const designResult = computeDesignScore(device);
  const design_score = designResult.score;

  // Recompute composite with real design score
  const composite_score = +(
    0.20 * design_score +
    0.30 * labelled.interaction_score +
    0.25 * labelled.configuration_score +
    0.25 * labelled.system_score
  ).toFixed(4);

  // Re-derive grade from composite
  const grade = compositeToGrade(composite_score);
  const risk_label = grade <= 'B' ? 'low' : grade <= 'D' ? 'medium' : 'high';

  return {
    ...partial,
    ...labelled,
    design_score:    +design_score.toFixed(4),
    composite_score,
    grade,
    risk_label,
    risk_score:      composite_score,
    design_reasons:  designResult.reasons,
  };
}

/** Map composite score to A+–F energy grade. Mirrors labellingRules.ts scoreToGrade. */
function compositeToGrade(score: number): TrainingRecord['grade'] {
  if (score <= 0.10) return 'A+';
  if (score <= 0.20) return 'A';
  if (score <= 0.35) return 'B';
  if (score <= 0.50) return 'C';
  if (score <= 0.65) return 'D';
  if (score <= 0.80) return 'E';
  return 'F';
}
