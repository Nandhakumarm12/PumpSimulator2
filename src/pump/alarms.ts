/**
 * Alarm conditions and trigger logic for the Alaris GP pump simulator.
 * Source: DFU Manual "Alarms" section (pages 24–26 original, pages 33–38 new edition).
 * NO React imports allowed in this file.
 */

import type { AlarmType } from './types';

export interface AlarmCondition {
  type: AlarmType;
  message: string;
  stopInfusion: boolean;
  priority: "critical" | "warning" | "advisory";
}

/** Canonical alarm definitions — message text matches real device display */
export const ALARM_DEFINITIONS: Record<AlarmType, AlarmCondition> = {
  OCCLUSION: {
    type: "OCCLUSION",
    message: "OCCLUSION",
    stopInfusion: true,
    priority: "critical",
  },
  AIR_IN_LINE: {
    type: "AIR_IN_LINE",
    message: "AIR IN LINE",
    stopInfusion: true,
    priority: "critical",
  },
  INFUSION_COMPLETE: {
    type: "INFUSION_COMPLETE",
    message: "INFUSION COMPLETE",
    stopInfusion: false,
    priority: "advisory",
  },
  BATTERY_LOW: {
    type: "BATTERY_LOW",
    message: "BATTERY LOW",
    stopInfusion: false,
    priority: "warning",
  },
  AC_FAIL: {
    type: "AC_FAIL",
    message: "AC FAIL",
    stopInfusion: false,
    priority: "warning",
  },
  RATE_TOO_HIGH: {
    type: "RATE_TOO_HIGH",
    message: "RATE TOO HIGH",
    stopInfusion: false,
    priority: "advisory",
  },
  RATE_TOO_LOW: {
    type: "RATE_TOO_LOW",
    message: "RATE TOO LOW",
    stopInfusion: false,
    priority: "advisory",
  },
  KVO: {
    type: "KVO",
    message: "KVO RUNNING",
    stopInfusion: false,
    priority: "advisory",
  },
  UPSTREAM_OCCLUSION: {
    type: "UPSTREAM_OCCLUSION",
    message: "UPSTREAM OCC",
    stopInfusion: true,
    priority: "critical",
  },
  SET_NOT_PRIMED: {
    type: "SET_NOT_PRIMED",
    message: "SET NOT PRIMED",
    stopInfusion: true,
    priority: "critical",
  },
};
