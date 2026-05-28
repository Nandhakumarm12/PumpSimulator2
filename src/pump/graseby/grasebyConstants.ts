/**
 * Factory defaults and device constants for the Graseby 3100 Syringe Driver simulator.
 *
 * ARCHITECTURE ROLE:
 *   Mirrors src/pump/constants.ts (Alaris GP FACTORY_DEFAULTS) but for the
 *   Graseby 3100 syringe driver.
 *
 * KEY DIFFERENCES FROM ALARIS GP:
 *   - RATE_MAX: 99.9 ml/h (syringe driver max; LVPs go to 1200 ml/h)
 *   - No BOLUS_VOLUME_MAX (no bolus mode)
 *   - No KVO_RATE (no KVO — syringe empties and alarm fires)
 *   - No PRESSURE_DEFAULT (occlusion detection is passive/mechanical)
 *   - WEIGHT_DEFAULT not used clinically — rate entered directly in ml/h
 *
 * SOURCE:
 *   Graseby 3100 Syringe Driver Operators Manual — ardusmedical.com (2002)
 *   NPSA Patient Safety Alert — "Safer use of syringe drivers" (2010, UK)
 *
 * NO React imports allowed in this file.
 */

/**
 * Factory defaults for the Graseby 3100 Syringe Driver.
 *
 * All values are from the Graseby 3100 Operators Manual unless noted.
 * Usage: reference this object exclusively — never hardcode parameters.
 */
export const GRASEBY_DEFAULTS = {
  // ── Rate ────────────────────────────────────────────────────────────────────
  /** Minimum programmable infusion rate in ml/h. Source: Operators Manual spec table. */
  RATE_MIN:               0.1,
  /** Maximum programmable infusion rate in ml/h. Source: Operators Manual spec table. */
  RATE_MAX:               199.9,
  /** Default rate on startup (not programmed). */
  RATE_DEFAULT:           0.0,

  // ── Chevron steps ────────────────────────────────────────────────────────────
  /** Double chevron step size. */
  STEP_LARGE:             10,
  /** Single chevron step size. */
  STEP_SMALL:             1,

  // ── Syringe ─────────────────────────────────────────────────────────────────
  /** Default syringe capacity in ml. Clinical default for opioid infusions. */
  SYRINGE_DEFAULT_ML:     50 as const,

  // ── Timing ───────────────────────────────────────────────────────────────────
  /** Hold delay before repeat starts in ms. */
  HOLD_DELAY_MS:          500,
  /** Repeat interval during hold in ms. */
  HOLD_REPEAT_MS:         80,
  /** Infusion simulation tick interval in ms. */
  INFUSION_TICK_MS:       500,
  /** Alarm mute duration in ms (~2 minutes). */
  MUTE_DURATION_MS:       120_000,
  /** Power-off hold duration in ms. */
  POWER_OFF_HOLD_MS:      3_000,

  // ── Battery ──────────────────────────────────────────────────────────────────
  /** Initial battery level percentage. */
  BATTERY_LEVEL:          100,
  /** Battery level percentage below which BATTERY_LOW alarm fires. */
  BATTERY_LOW_PCT:        15,
  /** Battery drain per infusion tick. */
  BATTERY_DRAIN_PER_TICK: 0.005,

  // ── Device identity ───────────────────────────────────────────────────────────
  /** Internal pump_model identifier (matches deviceDesign.ts registry key). */
  PUMP_MODEL:             'graseby_3100' as const,
  /**
   * Firmware version — the 3100 has minimal embedded firmware.
   * No CVEs documented; the device predates modern cybersecurity cataloguing.
   */
  FIRMWARE_VERSION:       '3100-v1.0',
  /** Manufacturer name. */
  MANUFACTURER:           'Graseby Medical Ltd',

  // ── Patient weight ────────────────────────────────────────────────────────────
  /** Default patient weight used for scoring only (not displayed on device). */
  WEIGHT_DEFAULT:         70,

  // ── Infusion tick volume ──────────────────────────────────────────────────────
  /** Volume delivered per tick at rate=1 ml/h with 500ms tick interval. */
  TICK_VOLUME_FACTOR:     1 / (3600 / 0.5),   // rate_ml_h / (seconds_per_hour / tick_s)
} as const;
