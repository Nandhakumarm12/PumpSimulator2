/**
 * Persists session state in localStorage so refresh does not reset the timer.
 * Each device gets its own key — Alaris and Braun are fully independent.
 * States: idle → active → ended → idle (start new)
 */
import { useState, useEffect, useRef, useCallback } from 'react';

export interface SessionSummary {
  durationMs: number;
  drug?: string;
  rate?: number;
  volumeDelivered?: number;
  batteryEnd?: number;
  endedAt: number;
}

interface StoredSession {
  startedAt: number;
  endedAt?: number;
  summary?: SessionSummary;
}

type SessionState = 'idle' | 'active' | 'ended';

function load(key: string): StoredSession | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch { return null; }
}

function save(key: string, data: StoredSession) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* ignore */ }
}

function clear(key: string) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

export function useSessionTime(storageKey: string) {
  const stored = load(storageKey);

  const [state, setState] = useState<SessionState>(() => {
    if (!stored) return 'idle';
    return stored.endedAt ? 'ended' : 'active';
  });

  const [sessionStart, setSessionStart] = useState<number | null>(
    stored && !stored.endedAt ? stored.startedAt : null
  );

  const [elapsed, setElapsed] = useState<number>(() => {
    if (!stored) return 0;
    if (stored.endedAt) return stored.summary?.durationMs ?? 0;
    return Date.now() - stored.startedAt;
  });

  const [summary, setSummary] = useState<SessionSummary | null>(
    stored?.summary ?? null
  );

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (state !== 'active' || !sessionStart) return;
    intervalRef.current = setInterval(() => {
      setElapsed(Date.now() - sessionStart);
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [state, sessionStart]);

  const startSession = useCallback(() => {
    const now = Date.now();
    save(storageKey, { startedAt: now });
    setSessionStart(now);
    setElapsed(0);
    setSummary(null);
    setState('active');
  }, [storageKey]);

  const endSession = useCallback((snap: Omit<SessionSummary, 'durationMs' | 'endedAt'>) => {
    const now = Date.now();
    const durationMs = sessionStart ? now - sessionStart : 0;
    const s: SessionSummary = { ...snap, durationMs, endedAt: now };
    const stored2 = load(storageKey);
    if (stored2) save(storageKey, { ...stored2, endedAt: now, summary: s });
    if (intervalRef.current) clearInterval(intervalRef.current);
    setElapsed(durationMs);
    setSummary(s);
    setState('ended');
  }, [storageKey, sessionStart]);

  const resetSession = useCallback(() => {
    clear(storageKey);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setSessionStart(null);
    setElapsed(0);
    setSummary(null);
    setState('idle');
  }, [storageKey]);

  return {
    state,
    isStarted: state === 'active',
    isEnded: state === 'ended',
    elapsed,
    summary,
    startSession,
    endSession,
    resetSession,
  };
}
