/**
 * Graseby3100 — simulator UI for the Graseby 3100 Syringe Driver.
 *
 * Visual style: retro 1990s medical device — dark grey housing, green-on-black
 * segmented LCD, amber/green LEDs. Deliberately minimal to reflect the device's
 * lack of features compared to the Alaris GP and B. Braun.
 *
 * Clinical context displayed: no guardrails, no drug library, no VTBI.
 * Every session note emphasises the absence of safety features — this is
 * intentional for the research context.
 */

import { useState, useCallback } from 'react';
import { useGrasebyPumpContext } from '../contexts/GrasebyPumpContext';
import type { SyringeCapacityMl } from '../pump/graseby/grasebyTypes';
import { GRASEBY_DEFAULTS } from '../pump/graseby/grasebyConstants';
import { useTheme } from '../contexts/ThemeContext';
import { T } from '../styles/tokens';

const GRASEBY_LS_KEYS = ['graseby_pump_state', 'graseby_session_log', 'graseby_session_start'];

function segLabel(dim: string, label: string, children: React.ReactNode) {
  return (
    <div>
      <div style={{ color: dim, fontSize: T.nano, letterSpacing: 2, marginBottom: 3 }}>{label}</div>
      {children}
    </div>
  );
}

export default function Graseby3100() {
  const C = useTheme();
  const [confirmReset, setConfirmReset] = useState(false);

  const handleReset = useCallback(() => {
    if (!confirmReset) { setConfirmReset(true); return; }
    GRASEBY_LS_KEYS.forEach(k => { try { localStorage.removeItem(k); } catch { /* ignore */ } });
    window.location.reload();
  }, [confirmReset]);

  // Device-faithful Graseby 3100 colours — from theme device palette (never change between themes)
  const ACCENT     = C.device.graseby.lcdText;
  const DIM        = C.device.graseby.lcdDim;
  const AMBER      = C.device.graseby.amber;
  const RED        = C.device.graseby.red;
  const HOUSING    = C.device.graseby.housing;
  const DISPLAY_BG = C.device.graseby.lcdBg;

  const pump = useGrasebyPumpContext();
  const { pumpState } = pump;

  const isRunning  = pumpState.screen === 'RUNNING';
  const isHold     = pumpState.screen === 'ON_HOLD';
  const isAlarm    = pumpState.screen === 'ALARM';
  const isEntry    = pumpState.screen === 'RATE_ENTRY';
  const canStart   = (isEntry && pumpState.rate > 0) || isHold;
  const canStop    = isRunning;
  const fillPct    = Math.min(100, (pumpState.volumeInfused / pumpState.syringeCapacityMl) * 100);

  const statusColor = isAlarm ? RED : isRunning ? ACCENT : isHold ? AMBER : DIM;
  const statusText  = isAlarm ? (pumpState.alarmMessage || 'ALARM')
    : isRunning ? 'INFUSING'
    : isHold    ? 'ON HOLD'
    : 'READY';

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-start',
      padding: '32px 20px',
      gap: 24,
      fontFamily: "'Share Tech Mono', monospace",
      minHeight: '100vh',
      background: C.bg.page,
      backgroundImage: `radial-gradient(ellipse at 50% 20%, ${C.bg.inset} 0%, ${C.bg.page} 70%)`,
    }}>

      {/* ── Left: Device info panel ─────────────────────────────────────── */}
      <div style={{ width: 220, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: C.bg.panel, border: `1px solid ${C.border.default}`, borderRadius: 10, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ color: C.text.secondary, fontSize: T.nano, letterSpacing: 2 }}>DEVICE INFO</div>
            <button
              onClick={handleReset}
              onMouseLeave={() => setConfirmReset(false)}
              title="Reset Graseby simulator to fresh state"
              style={{
                background: confirmReset ? '#4a0a0a' : 'transparent',
                border: `1px solid ${confirmReset ? '#ff4444' : C.border.default}`,
                borderRadius: 4, padding: '2px 7px', cursor: 'pointer',
                color: confirmReset ? '#ff6666' : C.text.secondary,
                fontSize: T.nano, letterSpacing: 1,
                fontFamily: "'Share Tech Mono', monospace",
                transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}>
              {confirmReset ? 'CONFIRM?' : '⟳ RESET'}
            </button>
          </div>
          {[
            ['Model',        'Graseby 3100'],
            ['Type',         'Syringe Driver'],
            ['Manufacturer', 'Graseby Medical'],
            ['Drug Library', 'NONE'],
            ['Guardrails',   'NONE'],
            ['Network',      'NONE'],
            ['VTBI',         'NONE'],
            ['Bolus',        'NONE'],
            ['Rate Range',   '0.1–199.9 ml/h'],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ color: C.text.secondary, fontSize: T.nano }}>{k}</span>
              <span style={{ color: v === 'NONE' ? '#ff4444' : ACCENT, fontSize: T.nano }}>{v}</span>
            </div>
          ))}
        </div>

        {/* Risk notice */}
        <div style={{
          background: '#1a0808', border: '1px solid #4a1a1a', borderRadius: 8,
          padding: '12px 14px',
        }}>
          <div style={{ color: '#ff6644', fontSize: T.nano, letterSpacing: 1, marginBottom: 6 }}>
            NPSA ALERT 2010 (UK)
          </div>
          <div style={{ color: '#aa4433', fontSize: T.nano, lineHeight: 1.6 }}>
            No guardrails. No drug library. No VTBI.
            All infusions are manual rate entry only.
            High design-risk device — every session
            triggers R12 (no library) + R13 (no VTBI).
          </div>
        </div>

        {/* Session counters */}
        <div style={{ background: C.bg.panel, border: `1px solid ${C.border.default}`, borderRadius: 10, padding: 14 }}>
          <div style={{ color: C.text.secondary, fontSize: T.nano, letterSpacing: 2, marginBottom: 8 }}>SESSION METRICS</div>
          {[
            ['Keypresses',  pump.keypressCount],
            ['Corrections', pump.correctionCount],
            ['Boundary hits', pump.boundaryHitCount],
            ['Vol. infused', `${pumpState.volumeInfused.toFixed(1)} ml`],
            ['Battery',     `${pumpState.batteryLevel.toFixed(0)}%`],
          ].map(([k, v]) => (
            <div key={String(k)} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: C.text.secondary, fontSize: T.nano }}>{k}</span>
              <span style={{ color: ACCENT, fontSize: T.nano }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Centre: The device ─────────────────────────────────────────────── */}
      <div style={{
        background: HOUSING,
        borderRadius: 16,
        padding: 24,
        width: 320,
        boxShadow: '0 8px 40px #000a, 0 0 0 1px #444',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>

        {/* Device header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: '#aaaaaa', fontSize: T.sm, fontWeight: 'bold', letterSpacing: 2 }}>
              GRASEBY 3100
            </div>
            <div style={{ color: '#666666', fontSize: T.nano, letterSpacing: 1 }}>
              SYRINGE DRIVER
            </div>
          </div>
          {/* LED indicators */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              background: isRunning ? ACCENT : '#1a3a1a',
              boxShadow: isRunning ? `0 0 8px ${ACCENT}` : 'none',
            }} title="RUN LED" />
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              background: isHold ? AMBER : '#3a2a00',
              boxShadow: isHold ? `0 0 8px ${AMBER}` : 'none',
            }} title="HOLD LED" />
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              background: isAlarm ? RED : '#3a0000',
              boxShadow: isAlarm ? `0 0 8px ${RED}` : 'none',
              animation: isAlarm ? 'ledPulse 0.5s ease-in-out infinite' : 'none',
            }} title="ALARM LED" />
          </div>
        </div>

        {/* ── LCD display ─────────────────────────────────────────────────── */}
        <div style={{
          background: DISPLAY_BG,
          border: `2px solid ${isAlarm ? RED : isRunning ? ACCENT : '#1a3a1a'}`,
          borderRadius: 8,
          padding: '16px 18px',
          boxShadow: isAlarm ? `0 0 12px ${RED}33` : isRunning ? `0 0 8px ${ACCENT}22` : 'none',
        }}>
          {/* Status row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ color: statusColor, fontSize: T.xs, letterSpacing: 2 }}>{statusText}</div>
            <div style={{ color: DIM, fontSize: T.nano }}>{pumpState.syringeCapacityMl}ml syringe</div>
          </div>

          {/* Rate display — big number */}
          {segLabel(DIM, 'RATE  ml/h',
            <div style={{
              color: ACCENT,
              fontSize: 48,
              fontWeight: 'bold',
              letterSpacing: 4,
              textShadow: `0 0 12px ${ACCENT}88`,
              lineHeight: 1,
              marginBottom: 8,
            }}>
              {pumpState.rate.toFixed(1)}
            </div>
          )}

          {/* Volume bar */}
          <div style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ color: DIM, fontSize: T.nano }}>VOLUME</span>
              <span style={{ color: ACCENT, fontSize: T.nano }}>
                {pumpState.volumeInfused.toFixed(1)} / {pumpState.syringeCapacityMl} ml
              </span>
            </div>
            <div style={{ height: 6, background: '#0d200d', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${fillPct}%`,
                background: fillPct > 90 ? RED : ACCENT,
                borderRadius: 3, transition: 'width 0.5s',
              }} />
            </div>
          </div>
        </div>

        {/* ── Syringe selector ──────────────────────────────────────────── */}
        <div>
          <div style={{ color: '#666', fontSize: T.nano, letterSpacing: 2, marginBottom: 6 }}>
            SYRINGE SIZE
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {([20, 30, 50] as SyringeCapacityMl[]).map(cap => (
              <button
                key={cap}
                onClick={() => pump.handleSelectSyringe(cap)}
                disabled={isRunning}
                style={{
                  flex: 1, padding: '7px 4px', borderRadius: 6,
                  fontSize: T.xs, letterSpacing: 1,
                  fontFamily: "'Share Tech Mono', monospace",
                  cursor: isRunning ? 'not-allowed' : 'pointer',
                  background: pumpState.syringeCapacityMl === cap ? '#1a3a1a' : '#1a1a1a',
                  border: `1px solid ${pumpState.syringeCapacityMl === cap ? ACCENT : '#333'}`,
                  color: pumpState.syringeCapacityMl === cap ? ACCENT : '#666',
                }}>
                {cap}ml
              </button>
            ))}
          </div>
        </div>

        {/* ── Chevron rate keys ─────────────────────────────────────────── */}
        <div>
          <div style={{ color: '#666', fontSize: T.nano, letterSpacing: 2, marginBottom: 6 }}>
            RATE ADJUST
          </div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
            {[
              { label: '««', handler: pump.largeDnChevron, title: '-10 ml/h' },
              { label: '«',  handler: pump.smallDnChevron, title: '-1 ml/h'  },
              { label: '»',  handler: pump.smallUpChevron, title: '+1 ml/h'  },
              { label: '»»', handler: pump.largeUpChevron, title: '+10 ml/h' },
            ].map(({ label, handler, title }) => (
              <button
                key={label}
                title={title}
                onMouseDown={handler.onStart}
                onMouseUp={handler.onStop}
                onMouseLeave={handler.onStop}
                onTouchStart={e => { e.preventDefault(); handler.onStart(); }}
                onTouchEnd={handler.onStop}
                disabled={!isEntry}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 6,
                  fontSize: T.xs, fontFamily: "'Share Tech Mono', monospace",
                  cursor: isEntry ? 'pointer' : 'not-allowed',
                  background: isEntry ? '#1a2a1a' : '#151515',
                  border: `1px solid ${isEntry ? DIM : '#222'}`,
                  color: isEntry ? ACCENT : '#333',
                  userSelect: 'none',
                }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Main control buttons ──────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button
            onClick={pump.handleStart}
            disabled={!canStart}
            style={{
              padding: '12px', borderRadius: 8, fontSize: T.nano, letterSpacing: 2,
              fontFamily: "'Share Tech Mono', monospace",
              cursor: canStart ? 'pointer' : 'not-allowed',
              background: canStart ? '#0d3a1a' : '#1a1a1a',
              border: `1px solid ${canStart ? ACCENT : '#333'}`,
              color: canStart ? ACCENT : '#333',
            }}>
            ▶ START
          </button>
          <button
            onClick={pump.handleStop}
            disabled={!canStop}
            style={{
              padding: '12px', borderRadius: 8, fontSize: T.nano, letterSpacing: 2,
              fontFamily: "'Share Tech Mono', monospace",
              cursor: canStop ? 'pointer' : 'not-allowed',
              background: canStop ? '#2a1a00' : '#1a1a1a',
              border: `1px solid ${canStop ? AMBER : '#333'}`,
              color: canStop ? AMBER : '#333',
            }}>
            ■ STOP
          </button>
          {isHold && (
            <button
              onClick={pump.handleReprogram}
              style={{
                gridColumn: 'span 2', padding: '8px', borderRadius: 6, fontSize: T.xs,
                fontFamily: "'Share Tech Mono', monospace", cursor: 'pointer',
                background: C.bg.panel, border: `1px solid ${C.border.default}`, color: C.accent.blue,
              }}>
              RE-PROGRAM RATE
            </button>
          )}
          {isAlarm && (
            <button
              onClick={pump.handleSilenceAlarm}
              style={{
                gridColumn: 'span 2', padding: '10px', borderRadius: 8, fontSize: T.nano,
                fontFamily: "'Share Tech Mono', monospace", cursor: 'pointer',
                background: '#1a0808', border: `1px solid ${RED}`, color: RED,
                animation: 'ledPulse 0.8s ease-in-out infinite',
              }}>
              ALARM SILENCE
            </button>
          )}
        </div>

        {/* ── Alarm simulation (research only) ──────────────────────────── */}
        <div style={{ borderTop: '1px solid #333', paddingTop: 12 }}>
          <div style={{ color: '#444', fontSize: T.nano, letterSpacing: 2, marginBottom: 6 }}>
            ALARM SIMULATION (RESEARCH)
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['OCCLUSION', 'BATTERY_LOW', 'SYRINGE_EMPTY'] as const).map(t => (
              <button
                key={t}
                onClick={() => pump.handleTriggerAlarm(t)}
                disabled={isAlarm}
                style={{
                  flex: 1, padding: '5px 2px', borderRadius: 4, fontSize: T.nano,
                  fontFamily: "'Share Tech Mono', monospace",
                  cursor: isAlarm ? 'not-allowed' : 'pointer',
                  background: '#1a0808', border: '1px solid #3a1a1a', color: '#ff6644',
                }}>
                {t.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right: Session log ─────────────────────────────────────────────── */}
      <div style={{ width: 260, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: C.bg.panel, border: `1px solid ${C.border.default}`, borderRadius: 10, padding: 14 }}>
          <div style={{ color: C.text.secondary, fontSize: T.nano, letterSpacing: 2, marginBottom: 8 }}>
            SESSION LOG ({pump.sessionLog.length} events)
          </div>
          <div style={{ maxHeight: 340, overflowY: 'auto' }}>
            {pump.sessionLog.length === 0 ? (
              <div style={{ color: '#1a3a2a', fontSize: T.nano }}>No events yet.</div>
            ) : (
              [...pump.sessionLog].reverse().map((e, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 3 }}>
                  <span style={{ color: '#1a4a3a', fontSize: T.nano, width: 42, flexShrink: 0 }}>
                    {e.timestamp.toFixed(0)}ms
                  </span>
                  <span style={{
                    fontSize: T.nano, color:
                      e.event === 'infusion_started' ? ACCENT :
                      e.event === 'alarm_triggered'  ? RED :
                      e.event === 'boundary_hit'     ? AMBER : DIM,
                  }}>
                    {e.event}
                  </span>
                  {e.newRate !== undefined && (
                    <span style={{ color: '#1a5a3a', fontSize: T.nano }}>→{Number(e.newRate).toFixed(1)}</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Firmware / security info */}
        <div style={{ background: '#081a08', border: '1px solid #1a3a1a', borderRadius: 8, padding: 12 }}>
          <div style={{ color: '#2a6a2a', fontSize: T.nano, letterSpacing: 2, marginBottom: 6 }}>SECURITY PROFILE</div>
          {[
            ['Firmware CVEs', '0 (pre-network era)'],
            ['Signed FW', 'N/A (no software)'],
            ['Network', 'None'],
            ['Risk from CVEs', 'Zero'],
            ['Design risk', 'HIGH (no guardrails)'],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: '#2a5a4a', fontSize: T.nano }}>{k}</span>
              <span style={{ color: v.startsWith('HIGH') ? RED : v === 'Zero' ? ACCENT : '#4a9eff', fontSize: T.nano }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap');
        @keyframes ledPulse { 0%,100%{opacity:1} 50%{opacity:0.25} }
      `}</style>
    </div>
  );
}
