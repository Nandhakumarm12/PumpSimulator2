/**
 * useLocalStorage — persists React state to localStorage.
 *
 * Drop-in replacement for useState that automatically reads the initial
 * value from localStorage and writes back on every change.
 *
 * Usage:
 *   const [value, setValue] = useLocalStorage('my_key', defaultValue);
 *
 * Notes:
 *   - Values are JSON-serialised. Must be JSON-safe.
 *   - If localStorage is unavailable (private mode, quota exceeded) the
 *     hook silently falls back to plain in-memory state.
 *   - Pass a `reviver` function to transform values after JSON.parse
 *     (e.g. to reconstruct Date objects or validate schema).
 */

import { useState, useEffect } from 'react';

export function useLocalStorage<T>(
  key: string,
  defaultValue: T | (() => T),
  reviver?: (raw: unknown) => T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) {
        const parsed = JSON.parse(stored) as unknown;
        return reviver ? reviver(parsed) : (parsed as T);
      }
    } catch { /* parse error or no localStorage */ }
    return typeof defaultValue === 'function'
      ? (defaultValue as () => T)()
      : defaultValue;
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch { /* quota exceeded or unavailable */ }
  }, [key, value]);

  return [value, setValue];
}
