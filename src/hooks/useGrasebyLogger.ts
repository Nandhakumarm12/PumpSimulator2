/**
 * useGrasebyLogger — session logging hook for the Graseby 3100 Syringe Driver.
 * Session log and start time are persisted to localStorage.
 */

import { useState, useEffect, useRef } from 'react';
import type { GrasebySessionLogEntry } from '../pump/graseby/grasebyTypes';

const LS_LOG   = 'graseby_session_log';
const LS_START = 'graseby_session_start';
const MAX_STORED_ENTRIES = 500;

interface GrasebyLoggerState {
  readonly sessionLog:       readonly GrasebySessionLogEntry[];
  readonly keypressCount:    number;
  readonly correctionCount:  number;
  readonly boundaryHitCount: number;
  readonly sessionStart:     number;
  appendEntries: (entries: readonly GrasebySessionLogEntry[]) => void;
}

function loadLog(): readonly GrasebySessionLogEntry[] {
  try {
    const raw = localStorage.getItem(LS_LOG);
    if (raw) return JSON.parse(raw) as GrasebySessionLogEntry[];
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

export function useGrasebyLogger(): GrasebyLoggerState {
  const [sessionLog,       setSessionLog]       = useState<readonly GrasebySessionLogEntry[]>(loadLog);
  const [keypressCount,    setKeypressCount]    = useState(0);
  const [correctionCount,  setCorrectionCount]  = useState(0);
  const [boundaryHitCount, setBoundaryHitCount] = useState(0);
  const sessionStart = useRef<number>(loadStart());

  // Persist log whenever it changes
  useEffect(() => {
    try {
      const toStore = sessionLog.length > MAX_STORED_ENTRIES
        ? sessionLog.slice(-MAX_STORED_ENTRIES)
        : sessionLog;
      localStorage.setItem(LS_LOG,   JSON.stringify(toStore));
      localStorage.setItem(LS_START, String(sessionStart.current));
    } catch { /* quota exceeded */ }
  }, [sessionLog]);

  useEffect(() => {
    const entries = sessionLog;
    if (entries.length === 0) return;
    const latest = entries[entries.length - 1];
    if (latest.event === 'rate_adjust')   setKeypressCount(c => c + 1);
    if (latest.event === 'correction')    setCorrectionCount(c => c + 1);
    if (latest.event === 'boundary_hit')  setBoundaryHitCount(c => c + 1);
  }, [sessionLog.length]); // eslint-disable-line react-hooks/exhaustive-deps

  function appendEntries(entries: readonly GrasebySessionLogEntry[]) {
    if (entries.length === 0) return;
    setSessionLog(prev => [...prev, ...entries]);
  }

  return {
    sessionLog,
    keypressCount,
    correctionCount,
    boundaryHitCount,
    sessionStart: sessionStart.current,
    appendEntries,
  };
}
