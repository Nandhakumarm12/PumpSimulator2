/**
 * Alarm sound engine using Web Audio API — no external files required.
 * Each alarm type has a distinct sound pattern matching clinical conventions.
 */

import { useRef, useCallback, useEffect } from 'react';

export type AlarmSoundType =
  | 'critical'       // OCCLUSION, AIR_IN_LINE, UPSTREAM_OCCLUSION, SET_NOT_PRIMED
  | 'warning'        // BATTERY_LOW, AC_FAIL
  | 'advisory'       // INFUSION_COMPLETE, KVO, RATE_TOO_HIGH, RATE_TOO_LOW
  | 'soft_limit'     // Guardrail soft warning
  | 'hard_limit'     // Guardrail hard block
  | 'none';

interface SoundPattern {
  frequencies: number[];
  duration: number;     // ms per beep
  gap: number;          // ms between beeps
  repeatDelay: number;  // ms before pattern repeats (0 = no repeat)
  waveform: OscillatorType;
  volume: number;
}

const PATTERNS: Record<Exclude<AlarmSoundType, 'none'>, SoundPattern> = {
  // Critical: rapid triple beep, high pitch — matches ISO 60601-1-8 high priority
  critical: {
    frequencies: [880, 880, 880],
    duration: 150,
    gap: 100,
    repeatDelay: 600,
    waveform: 'square',
    volume: 0.15,
  },
  // Warning: double beep, medium pitch
  warning: {
    frequencies: [660, 440],
    duration: 200,
    gap: 150,
    repeatDelay: 2000,
    waveform: 'sine',
    volume: 0.12,
  },
  // Advisory: single soft beep
  advisory: {
    frequencies: [523],
    duration: 300,
    gap: 0,
    repeatDelay: 3000,
    waveform: 'sine',
    volume: 0.1,
  },
  // Soft limit: ascending two-tone
  soft_limit: {
    frequencies: [440, 550],
    duration: 120,
    gap: 80,
    repeatDelay: 0,
    waveform: 'sine',
    volume: 0.1,
  },
  // Hard limit: harsh descending buzz — blocked entry
  hard_limit: {
    frequencies: [300, 200],
    duration: 180,
    gap: 60,
    repeatDelay: 0,
    waveform: 'sawtooth',
    volume: 0.12,
  },
};

export function useAlarmSound() {
  const ctxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef<AlarmSoundType>('none');
  const stoppedRef = useRef(false);

  function getCtx(): AudioContext {
    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      ctxRef.current = new AudioContext();
    }
    if (ctxRef.current.state === 'suspended') {
      ctxRef.current.resume();
    }
    return ctxRef.current;
  }

  function playPattern(pattern: SoundPattern, onDone?: () => void) {
    const ctx = getCtx();
    let offset = ctx.currentTime;

    pattern.frequencies.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = pattern.waveform;
      osc.frequency.setValueAtTime(freq, offset);
      gain.gain.setValueAtTime(0, offset);
      gain.gain.linearRampToValueAtTime(pattern.volume, offset + 0.01);
      gain.gain.setValueAtTime(pattern.volume, offset + pattern.duration / 1000 - 0.02);
      gain.gain.linearRampToValueAtTime(0, offset + pattern.duration / 1000);
      osc.start(offset);
      osc.stop(offset + pattern.duration / 1000);
      offset += (pattern.duration + pattern.gap) / 1000;
      if (i === pattern.frequencies.length - 1) {
        osc.onended = () => { onDone?.(); };
      }
    });
  }

  const stopSound = useCallback(() => {
    stoppedRef.current = true;
    activeRef.current = 'none';
    if (intervalRef.current) {
      clearTimeout(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const playAlarm = useCallback((type: AlarmSoundType) => {
    if (type === 'none') { stopSound(); return; }
    const pattern = PATTERNS[type];

    stopSound();
    stoppedRef.current = false;
    activeRef.current = type;

    function loop() {
      if (stoppedRef.current || activeRef.current !== type) return;
      playPattern(pattern, () => {
        if (stoppedRef.current || activeRef.current !== type) return;
        if (pattern.repeatDelay > 0) {
          intervalRef.current = setTimeout(loop, pattern.repeatDelay);
        }
      });
      // one-shot sounds (repeatDelay === 0) don't loop
    }
    loop();
  }, [stopSound]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSound();
      ctxRef.current?.close();
    };
  }, [stopSound]);

  return { playAlarm, stopSound };
}
