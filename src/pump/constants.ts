/**
 * All factory-default parameters for the Alaris GP pump.
 * Source: DFU Manual "Factory Default Data Set" table (BD 1000DF00152 Issue 1).
 * NO magic numbers anywhere else — always reference this object.
 * NO React imports allowed in this file.
 */

export const FACTORY_DEFAULTS = {
  // Rate limits
  RATE_MIN:              0.1,
  RATE_MAX:              1200,
  RATE_DEFAULT:          0.0,

  // VTBI
  VTBI_MAX:              9999,
  VTBI_MIN:              0.1,
  VTBI_DEFAULT:          null as null,

  // KVO
  KVO_RATE:              1.0,

  // Bolus
  BOLUS_RATE_DEFAULT:    500,
  BOLUS_RATE_MAX:        1200,
  BOLUS_VOLUME_MAX:      5,
  BOLUS_MODE:            true,

  // Pressure alarm
  PRESSURE_DEFAULT:      5,
  PRESSURE_MAX:          8,
  PRESSURE_LEVELS:       8,

  // Air-in-line
  AIL_LIMIT_MAX:         100,

  // Weight
  WEIGHT_DEFAULT:        70,
  WEIGHT_MIN:            1,
  WEIGHT_MAX:            300,

  // Alarm
  ALARM_VOLUME:          "medium" as const,
  AC_FAIL_WARNING:       true,

  // Secondary infusion
  SECONDARY_INFUSION:    false,

  // Rate titration
  RATE_TITRATION:        false,

  // Chevron steps (DFU manual Section 3 "faster/slower")
  STEP_LARGE:            1,
  STEP_SMALL:            0.1,

  // Hold-to-accelerate timing (ms)
  HOLD_DELAY_MS:         500,
  HOLD_REPEAT_MS:        80,

  // Simulated device context defaults (shown in status bar)
  BATTERY_LEVEL:         87,
  FIRMWARE_VERSION:      "9.12",
  DAYS_SINCE_MAINTENANCE: 47,
  LIBRARY_AGE_DAYS:      23,
  NETWORK_CONNECTED:     true,

  // Bolus tick interval (ms) — how often bolus volume increments
  BOLUS_TICK_MS:         100,
  BOLUS_TICK_VOLUME:     0.1,

  // Infusion tick interval (ms)
  INFUSION_TICK_MS:      500,

  // MUTE duration — DFU spec: silences alarm for ~2 minutes
  MUTE_DURATION_MS:      120_000,

  // ON/OFF hold-to-power-off — DFU spec: hold 3 seconds to switch off
  POWER_OFF_HOLD_MS:     3_000,

  // DFU Alarms — auto-trigger thresholds
  // "OCCLUSION: pressureLevel >= 7 during running" — DFU Alarms section
  OCCLUSION_PRESSURE_THRESHOLD: 7,
  // "AIR_IN_LINE: auto after 500ml" — DFU Alarms section (simulator approximation)
  AIL_VOLUME_TRIGGER_ML: 500,

  // Battery simulation: 1-hour session. 87% start → BATTERY_LOW at 15% after ~50 min.
  // 72% drain / 6000 ticks (50 min at 500ms) = 0.012 per tick
  BATTERY_LOW_PCT:       15,
  BATTERY_DRAIN_PER_TICK: 0.012,
} as const;
