/**
 * Session logging hook for the Alaris GP simulator.
 * Manages the immutable session log array and derived counters.
 * Session log and start time are persisted to localStorage.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { SessionLogEntry } from '../pump/types';

const LS_LOG   = 'alaris_session_log';
const LS_START = 'alaris_session_start';
const MAX_STORED_ENTRIES = 500; // cap to avoid exceeding localStorage quota

export interface LoggerState {
  readonly sessionLog:        readonly SessionLogEntry[];
  readonly sessionStart:      number;
  readonly keypressCount:     number;
  readonly correctionCount:   number;
  readonly boundaryHitCount:  number;
  readonly overrideCount:     number;
}

export interface LoggerActions {
  appendEntries: (entries: SessionLogEntry[]) => void;
  resetSession:  () => void;
}

function loadLog(): readonly SessionLogEntry[] {
  try {
    const raw = localStorage.getItem(LS_LOG);
    if (raw) return JSON.parse(raw) as SessionLogEntry[];
  } catch { /* ignore */ }
  return [];
}

function loadStart(): number {
  try {
    const raw = localStorage.getItem(LS_START);
    if (raw) return parseInt(raw, 10);
  } catch { /* ignore */ }
  return Date.now();
}

function deriveCounters(log: readonly SessionLogEntry[]) {
  let keypressCount = 0, correctionCount = 0, boundaryHitCount = 0, overrideCount = 0;
  for (const e of log) {
    if (e.event === 'rate_adjust')        keypressCount++;
    if (e.event === 'correction')         correctionCount++;
    if (e.event === 'boundary_hit')       boundaryHitCount++;
    if (e.event === 'guardrail_override') overrideCount++;
  }
  return { keypressCount, correctionCount, boundaryHitCount, overrideCount };
}

export function useLogger(): LoggerState & LoggerActions {
  const sessionStartRef = useRef<number>(loadStart());

  const [sessionLog, setSessionLog] = useState<readonly SessionLogEntry[]>(loadLog);
  const counters = deriveCounters(sessionLog);

  // Persist log to localStorage whenever it changes
  useEffect(() => {
    try {
      const toStore = sessionLog.length > MAX_STORED_ENTRIES
        ? sessionLog.slice(-MAX_STORED_ENTRIES)
        : sessionLog;
      localStorage.setItem(LS_LOG,   JSON.stringify(toStore));
      localStorage.setItem(LS_START, String(sessionStartRef.current));
    } catch { /* quota exceeded */ }
  }, [sessionLog]);

  const appendEntries = useCallback((entries: SessionLogEntry[]) => {
    if (entries.length === 0) return;
    setSessionLog(prev => [...prev, ...entries]);
  }, []);

  const resetSession = useCallback(() => {
    sessionStartRef.current = Date.now();
    setSessionLog([]);
    try {
      localStorage.removeItem(LS_LOG);
      localStorage.setItem(LS_START, String(sessionStartRef.current));
    } catch { /* ignore */ }
  }, []);

  return {
    sessionLog,
    sessionStart: sessionStartRef.current,
    ...counters,
    appendEntries,
    resetSession,
  };
}
