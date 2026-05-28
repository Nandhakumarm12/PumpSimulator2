/**
 * Hold-to-accelerate hook for chevron buttons.
 * First press: immediate single step.
 * After 500ms hold: repeat at 80ms intervals.
 * Source: DFU Manual Section 3 "faster/slower" chevron behaviour.
 */

import { useRef, useCallback } from 'react';
import { FACTORY_DEFAULTS } from '../pump/constants';

export function useHoldRepeat() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimers = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startHold = useCallback((action: () => void) => {
    clearTimers();
    action(); // immediate first press
    timerRef.current = setTimeout(() => {
      intervalRef.current = setInterval(action, FACTORY_DEFAULTS.HOLD_REPEAT_MS);
    }, FACTORY_DEFAULTS.HOLD_DELAY_MS);
  }, [clearTimers]);

  const endHold = useCallback(() => {
    clearTimers();
  }, [clearTimers]);

  return { startHold, endHold };
}
