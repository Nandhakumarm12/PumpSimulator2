/**
 * useBraunLogger — Session logging hook for the B. Braun Infusomat Space simulator.
 * Session log and start time are persisted to localStorage.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { BraunSessionLogEntry } from '../pump/braun/braunTypes';

const LS_LOG   = 'braun_session_log';
const LS_START = 'braun_session_start';
const MAX_STORED_ENTRIES = 500;

export interface BraunLoggerState {
  readonly sessionLog:        readonly BraunSessionLogEntry[];
  readonly sessionStart:      number;
  readonly keypressCount:     number;
  readonly correctionCount:   number;
  readonly boundaryHitCount:  number;
  readonly overrideCount:     number;
  readonly advisoryCount:     number;
}

export interface BraunLoggerActions {
  appendEntries: (entries: BraunSessionLogEntry[]) => void;
  resetSession:  () => void;
}

function loadLog(): readonly BraunSessionLogEntry[] {
  try {
    const raw = localStorage.getItem(LS_LOG);
    if (raw) return JSON.parse(raw) as BraunSessionLogEntry[];
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

function deriveCounters(log: readonly BraunSessionLogEntry[]) {
  let keypressCount = 0, correctionCount = 0, boundaryHitCount = 0,
      overrideCount = 0, advisoryCount = 0;
  for (const e of log) {
    if (e.event === 'rate_adjust')           keypressCount++;
    if (e.event === 'correction')            correctionCount++;
    if (e.event === 'boundary_hit')          boundaryHitCount++;
    if (e.event === 'guardrail_override')    overrideCount++;
    if (e.event === 'guardrail_advisory')    advisoryCount++;
  }
  return { keypressCount, correctionCount, boundaryHitCount, overrideCount, advisoryCount };
}

export function useBraunLogger(): BraunLoggerState & BraunLoggerActions {
  const sessionStartRef = useRef<number>(loadStart());
  const [sessionLog, setSessionLog] = useState<readonly BraunSessionLogEntry[]>(loadLog);
  const counters = deriveCounters(sessionLog);

  useEffect(() => {
    try {
      const toStore = sessionLog.length > MAX_STORED_ENTRIES
        ? sessionLog.slice(-MAX_STORED_ENTRIES)
        : sessionLog;
      localStorage.setItem(LS_LOG,   JSON.stringify(toStore));
      localStorage.setItem(LS_START, String(sessionStartRef.current));
    } catch { /* quota exceeded */ }
  }, [sessionLog]);

  const appendEntries = useCallback((entries: BraunSessionLogEntry[]) => {
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
