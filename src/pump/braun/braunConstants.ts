/**
 * Factory defaults and device constants for the B. Braun Infusomat Space LVP simulator.
 *
 * ARCHITECTURE ROLE:
 *   Mirrors src/pump/constants.ts (Alaris GP FACTORY_DEFAULTS) but for the
 *   B. Braun Infusomat Space. All values derive from the IFU unless explicitly noted.
 *
 * KEY DIFFERENCES FROM ALARIS GP (FACTORY_DEFAULTS):
 *   - BOLUS_MAX_ML: 2.0 ml (Infusomat Space) vs 5.0 ml (Alaris GP).
 *     Source: B. Braun IFU bolus section — "Bolus Volume Max 2 ml".
 *   - DPS pressure uses mmHg (not dimensionless L0–L8 levels).
 *     Source: IFU — Dynamic Pressure System (DPS) section.
 *   - SPACECOM2_CONNECTED: default true (factory ships with SpaceCom2 fitted).
 *   - FIRMWARE_SIGNED: false — represents CVE-2021-33885 risk status.
 *     The Infusomat Space firmware update protocol does NOT verify cryptographic
 *     signatures. This is a design-level property, not a configurable setting.
 *     Source: CISA ICSMA-21-294-01.
 *   - DRUG_LIBRARY_SIZE: 1500 entries (Vigilant MasterMed library).
 *     Source: B. Braun IFU — drug library section.
 *   - FIRMWARE_VERSION: '686N' — current IFU document revision identifier.
 *
 * SOURCE:
 *   B. Braun Infusomat Space IFU — bbraunusa.com (2024)
 *   CISA ICSMA-21-294-01 (CVE-2021-33885, CVE-2021-33882)
 *
 * NO React imports allowed in this file.
 */

/**
 * Factory defaults for the B. Braun Infusomat Space LVP.
 *
 * All values are from the B. Braun Infusomat Space IFU (bbraunusa.com, 2024)
 * unless noted otherwise.
 *
 * Usage: reference this object exclusively — never hardcode device parameters.
 * This mirrors the Alaris GP pattern of FACTORY_DEFAULTS in constants.ts.
 */
export const BRAUN_DEFAULTS = {
  // ── Rate ────────────────────────────────────────────────────────────────────
  /** Minimum programmable infusion rate in ml/h. Source: IFU specifications table. */
  RATE_MIN:               0.1,
  /** Maximum programmable infusion rate in ml/h. Source: IFU specifications table. */
  RATE_MAX:               1200,
  /** Default rate on startup (not programmed). */
  RATE_DEFAULT:           0.0,

  // ── VTBI ────────────────────────────────────────────────────────────────────
  /** Maximum VTBI in ml. Source: IFU specifications table. */
  VTBI_MAX:               9999,
  /** Minimum VTBI in ml. Source: IFU specifications table. */
  VTBI_MIN:               0.1,
  /** Default VTBI state: 0 means not programmed. */
  VTBI_DEFAULT:           0,

  // ── KVO ─────────────────────────────────────────────────────────────────────
  /** Keep Vein Open rate in ml/h. Source: IFU — "KVO rate 1 ml/h". */
  KVO_RATE:               1.0,

  // ── Bolus ────────────────────────────────────────────────────────────────────
  /**
   * Maximum bolus volume in ml.
   * KEY DIFFERENCE: 2.0 ml vs Alaris GP 5.0 ml.
   * Source: B. Braun IFU bolus section — "Bolus Volume Max 2 ml".
   */
  BOLUS_MAX_ML:           2.0,
  /**
   * Maximum bolus delivery time in seconds.
   * Source: B. Braun IFU bolus section — "Bolus Time Max 10 s".
   */
  BOLUS_MAX_TIME_S:       10,
  /**
   * Approximate bolus delivery rate in ml/h (used for simulator volume calculation).
   * The actual Infusomat Space delivers bolus at up to 300 ml/h.
   * Source: B. Braun IFU — bolus delivery rate specification.
   */
  BOLUS_RATE_ML_H:        300,
  /** Bolus volume increment per simulation tick in ml. */
  BOLUS_TICK_VOLUME:      0.05,
  /** Interval between bolus simulation ticks in ms. */
  BOLUS_TICK_MS:          100,

  // ── DPS Pressure (Dynamic Pressure System) ───────────────────────────────────
  /**
   * Minimum occlusion alarm threshold in mmHg.
   * Source: B. Braun IFU — DPS section, "Alarm threshold min 50 mmHg".
   */
  PRESSURE_MIN_MMHG:      50,
  /**
   * Maximum occlusion alarm threshold in mmHg.
   * Source: B. Braun IFU — DPS section, "Alarm threshold max 750 mmHg".
   */
  PRESSURE_MAX_MMHG:      750,
  /**
   * Factory default occlusion alarm threshold in mmHg.
   * Source: B. Braun IFU — DPS section, "Factory default 300 mmHg".
   */
  PRESSURE_DEFAULT_MMHG:  300,
  /**
   * Pressure level adjustment step in mmHg (for values up to 250 mmHg).
   * Source: B. Braun IFU — DPS adjustment increments.
   */
  PRESSURE_STEP_MMHG:     25,
  /**
   * Pressure level adjustment step in mmHg (for values above 250 mmHg).
   * Source: B. Braun IFU — DPS adjustment increments (coarser at higher levels).
   */
  PRESSURE_STEP_HIGH_MMHG: 50,
  /** Number of discrete DPS pressure levels (maps to 1–8 for display). */
  PRESSURE_LEVELS:        8,
  /** Default DPS pressure level index (maps to 300 mmHg default). */
  PRESSURE_DEFAULT_LEVEL: 5,
  /** Pressure level at which OCCLUSION alarm triggers. */
  OCCLUSION_PRESSURE_LVL: 7,

  // ── Drug library ─────────────────────────────────────────────────────────────
  /**
   * Full Vigilant MasterMed drug library size.
   * In the simulator we use the same 10-drug subset as the Alaris GP for
   * cross-device comparability. The real device supports up to 1500 entries.
   * Source: B. Braun IFU — drug library section.
   */
  DRUG_LIBRARY_SIZE:      1500,
  /** Days since drug library was last updated (factory default = just updated). */
  LIBRARY_AGE_DAYS:       0,

  // ── Chevron steps ────────────────────────────────────────────────────────────
  /** Double chevron step size (same as Alaris GP). */
  STEP_LARGE:             1,
  /** Single chevron step size (same as Alaris GP). */
  STEP_SMALL:             0.1,

  // ── Timing ───────────────────────────────────────────────────────────────────
  /** Hold delay before repeat starts in ms. Source: IFU — hold-to-repeat. */
  HOLD_DELAY_MS:          500,
  /** Repeat interval during hold in ms. Source: IFU — hold-to-repeat. */
  HOLD_REPEAT_MS:         80,
  /** Infusion simulation tick interval in ms. */
  INFUSION_TICK_MS:       500,
  /** Alarm mute duration in ms (2 minutes). Source: IFU — alarm mute section. */
  MUTE_DURATION_MS:       120_000,
  /** Power-off hold duration in ms (3 seconds). Source: IFU — power controls. */
  POWER_OFF_HOLD_MS:      3_000,

  // ── Battery ──────────────────────────────────────────────────────────────────
  /** Initial battery level percentage. */
  BATTERY_LEVEL:          100,
  /** Battery level percentage below which BATTERY_LOW alarm fires. */
  BATTERY_LOW_PCT:        15,
  /** Battery drain per infusion tick — 100% → 15% (BATTERY_LOW) in ~50 min at 500ms ticks. */
  BATTERY_DRAIN_PER_TICK: 0.012,

  // ── SpaceCom2 module (B. Braun specific) ─────────────────────────────────────
  /**
   * Whether the SpaceCom2 WiFi/data module is connected by default.
   * The SpaceCom2 module enables the Infusomat Space to connect to the B. Braun
   * SpaceStation for drug library updates and remote monitoring.
   * Factory default: connected (module is shipped pre-installed).
   * Source: B. Braun SpaceCom2 module documentation.
   */
  SPACECOM2_CONNECTED:    true,

  // ── Firmware security ─────────────────────────────────────────────────────────
  /**
   * Whether firmware is cryptographically signed.
   * FALSE for all B. Braun Infusomat Space devices — this is a design property,
   * not a configurable setting. The firmware update protocol used by SpaceStation
   * does not require authentication or integrity verification.
   * CVE-2021-33885 (CVSS 9.0): unauthenticated remote firmware replacement.
   * Source: CISA ICSMA-21-294-01.
   */
  FIRMWARE_SIGNED:        false,

  // ── Alarm thresholds ─────────────────────────────────────────────────────────
  /**
   * Volume at which AIR_IN_LINE auto-trigger fires (simulator approximation).
   * Source: Alaris GP DFU — "auto after 500ml" (same threshold used for comparability).
   */
  AIL_VOLUME_TRIGGER_ML:  500,

  // ── Device identity ───────────────────────────────────────────────────────────
  /** Internal pump_model identifier (matches deviceDesign.ts registry key). */
  PUMP_MODEL:             'braun_infusomat',
  /**
   * Current firmware version identifier.
   * '686N' is the current IFU document revision identifier.
   * Source: B. Braun Infusomat Space IFU header.
   */
  FIRMWARE_VERSION:       '686N',
  /** Manufacturer name. */
  MANUFACTURER:           'B. Braun',

  // ── Patient weight ────────────────────────────────────────────────────────────
  /** Default patient weight in kg for weight-based dose calculations. */
  WEIGHT_DEFAULT:         70,
  /** Minimum accepted patient weight in kg. */
  WEIGHT_MIN:             1,
  /** Maximum accepted patient weight in kg. */
  WEIGHT_MAX:             300,

  // ── Advisory zone threshold ───────────────────────────────────────────────────
  /**
   * Advisory zone boundary as a fraction of the distance to the soft limit.
   * Rate is in the advisory zone when it is within ADVISORY_ZONE_FRACTION of
   * the soft limit boundary (e.g., 0.20 = within 20% of softMax or above softMin).
   * This governs when the tier-1 advisory screen is shown.
   * Source: B. Braun IFU — "Clinical Advisories" tier description.
   */
  ADVISORY_ZONE_FRACTION: 0.20,
} as const;

/**
 * Known vulnerable firmware versions for B. Braun Infusomat Space.
 * These versions are affected by CVE-2021-33885 (CVSS 9.0) and related CVEs.
 * In the real device, all firmware versions lack cryptographic signing,
 * so all versions are considered at risk. These specific versions are cited
 * in the CISA advisory as the confirmed affected set.
 *
 * Source: CISA ICSMA-21-294-01 — "Affected Products" section.
 */
export const BRAUN_CVE_FIRMWARE_VERSIONS: readonly string[] = [
  '686D',
  '686E',
  '686F',
  '686G',
  '686N',  // Current version — still affected (signing not added in any update)
] as const;
