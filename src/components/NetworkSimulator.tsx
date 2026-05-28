import { useState, useEffect, useRef } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { T } from '../styles/tokens';
import { usePumpContext } from '../contexts/PumpContext';
import { useNetworkContext } from '../contexts/NetworkContext';
import type { NetworkPacket } from '../network/networkTypes';
import {
  getInitialConnectionState,
  NEXT_STATE,
  STATE_DESCRIPTIONS,
  TRANSITION_DELAYS,
} from '../network/connectionMachine';
import type { ConnectionState } from '../network/connectionMachine';
import {
  makeHeartbeat, makeAlarmPacket, makeInfusionData,
  makeLibraryRequest, makeLibraryResponse, makeFirmwareCheck, makeAck,
} from '../network/packetGenerator';

const MAX_PACKETS = 80;

export default function NetworkSimulator() {
  const C = useTheme();
  const { pumpState } = usePumpContext();
  const { setIsConnected } = useNetworkContext();
  const [conn, setConn] = useState<ConnectionState>(getInitialConnectionState);

  useEffect(() => { setIsConnected(conn.connected); }, [conn.connected, setIsConnected]);
  const [packets, setPackets] = useState<NetworkPacket[]>([]);
  const sessionStartRef = useRef(Date.now());
  const connRef = useRef(conn);
  connRef.current = conn;
  const pumpRef = useRef(pumpState);
  pumpRef.current = pumpState;

  function ts() { return Date.now() - sessionStartRef.current; }

  function addPacket(pkt: NetworkPacket) {
    setPackets(prev => [pkt, ...prev].slice(0, MAX_PACKETS));
  }

  function startConnection() {
    setConn(s => ({ ...s, networkState: 'SCANNING', signalStrength: 0 }));
  }

  function disconnect() {
    setConn(getInitialConnectionState);
  }

  useEffect(() => {
    const state = conn.networkState;
    if (state === 'OFFLINE' || state === 'CONNECTED' || state === 'LIBRARY_CURRENT') return;

    const next = NEXT_STATE[state];
    if (!next) return;

    const delay = TRANSITION_DELAYS[state];
    const timer = setTimeout(() => {
      setConn(s => {
        const updates: Partial<ConnectionState> = { networkState: next };
        if (next === 'CONNECTED') {
          updates.ipAddress = '192.168.4.' + (100 + Math.floor(Math.random() * 50));
          updates.signalStrength = 72 + Math.floor(Math.random() * 25);
          updates.connected = true;
          setTimeout(() => {
            addPacket(makeLibraryRequest(ts(), s.libraryVersion));
            addPacket(makeFirmwareCheck(ts()));
          }, 200);
        }
        if (next === 'SYNCING_LIBRARY') {
          setTimeout(() => {
            const libResp = makeLibraryResponse(ts());
            addPacket(libResp);
            addPacket(makeAck(ts(), libResp.id));
          }, 400);
        }
        if (next === 'LIBRARY_CURRENT') {
          updates.libraryVersion = '4.2.1';
          updates.lastLibrarySyncMs = Date.now();
        }
        return { ...s, ...updates };
      });
    }, delay);

    return () => clearTimeout(timer);
  }, [conn.networkState]);

  useEffect(() => {
    if (!conn.connected) return;
    const interval = setInterval(() => {
      const hb = makeHeartbeat(ts(), pumpRef.current);
      addPacket(hb);
      setTimeout(() => addPacket(makeAck(ts(), hb.id)), 80 + Math.random() * 120);
      setConn(s => ({ ...s, lastHeartbeatMs: Date.now() }));
    }, 5000);
    return () => clearInterval(interval);
  }, [conn.connected]);

  useEffect(() => {
    if (!conn.connected || pumpState.screen !== 'RUNNING') return;
    const interval = setInterval(() => {
      addPacket(makeInfusionData(ts(), pumpState));
    }, 15000);
    return () => clearInterval(interval);
  }, [conn.connected, pumpState.screen]);

  const prevScreenRef = useRef(pumpState.screen);
  useEffect(() => {
    if (conn.connected && pumpState.screen === 'ALARM' && prevScreenRef.current !== 'ALARM') {
      const alarmPkt = makeAlarmPacket(ts(), pumpState);
      addPacket(alarmPkt);
      setTimeout(() => addPacket(makeAck(ts(), alarmPkt.id)), 150);
    }
    prevScreenRef.current = pumpState.screen;
  }, [pumpState.screen, conn.connected]);

  function stateColor(s: ConnectionState['networkState']): string {
    if (s === 'LIBRARY_CURRENT') return C.accent.green;
    if (s === 'CONNECTED' || s === 'SYNCING_LIBRARY') return C.accent.blue;
    if (s === 'OFFLINE') return C.text.dim;
    return C.accent.amber;
  }

  function packetColor(p: NetworkPacket): string {
    if (p.type === 'ALARM_EVENT') return C.accent.amber;
    if (p.type === 'ACK' || p.type === 'NACK') return C.accent.green;
    if (p.type === 'LIBRARY_RESPONSE' || p.type === 'LIBRARY_REQUEST') return C.accent.blue;
    return C.accent.cyan;
  }

  function TopoNode({ label, sublabel, active, color, icon }: {
    label: string; sublabel: string; active: boolean; color: string; icon: string;
  }) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 90 }}>
        <div style={{
          width: 64, height: 64, borderRadius: 12,
          background: active ? C.bg.hover : C.bg.inset,
          border: `2px solid ${active ? color : C.border.default}`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          boxShadow: active ? `0 0 16px ${color}33` : 'none',
          transition: 'all 0.4s',
        }}>
          <div style={{ fontSize: T.xxl }}>{icon}</div>
        </div>
        <div style={{ color: active ? color : C.text.dim, fontSize: T.xs, letterSpacing: 1, textAlign: 'center' }}>{label}</div>
        <div style={{ color: C.text.dim, fontSize: T.nano, textAlign: 'center' }}>{sublabel}</div>
        {active && (
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}`, animation: 'ledPulse 1.5s ease-in-out infinite' }} />
        )}
      </div>
    );
  }

  function ConnLine({ active, animated }: { active: boolean; animated: boolean }) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', position: 'relative', minWidth: 40, maxWidth: 80 }}>
        <div style={{ width: '100%', height: 2, background: active ? C.border.default : C.bg.inset, position: 'relative', overflow: 'hidden' }}>
          {animated && (
            <div style={{
              position: 'absolute', top: 0, left: '-100%', width: '40%', height: '100%',
              background: `linear-gradient(90deg, transparent, ${C.accent.blue}, transparent)`,
              animation: 'slideRight 1.5s linear infinite',
            }} />
          )}
        </div>
      </div>
    );
  }

  const isConnected = conn.connected;
  const isLive = conn.networkState === 'LIBRARY_CURRENT' || conn.networkState === 'CONNECTED' || conn.networkState === 'SYNCING_LIBRARY';

  return (
    <div style={{
      padding: '24px 20px',
      fontFamily: "'Share Tech Mono', monospace",
      color: C.text.primary,
      maxWidth: 900,
      margin: '0 auto',
    }}>
      <style>{`
        @keyframes ledPulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes slideRight { from{left:-40%} to{left:100%} }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ color: C.accent.blue, fontSize: T.lg, letterSpacing: 3, fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>
            ALARIS GP — NETWORK SIMULATOR
          </div>
          <div style={{ color: C.text.secondary, fontSize: T.xs, letterSpacing: 2, marginTop: 2 }}>
            {STATE_DESCRIPTIONS[conn.networkState]}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={startConnection} disabled={conn.networkState !== 'OFFLINE'}
            style={{
              background: conn.networkState === 'OFFLINE' ? C.bg.hover : C.bg.panel,
              border: `1px solid ${conn.networkState === 'OFFLINE' ? C.accent.green : C.border.default}`,
              color: conn.networkState === 'OFFLINE' ? C.accent.green : C.text.dim,
              padding: '8px 14px', cursor: conn.networkState === 'OFFLINE' ? 'pointer' : 'default',
              borderRadius: 6, fontSize: T.xs, letterSpacing: 1,
              fontFamily: "'Share Tech Mono', monospace",
            }}>
            CONNECT
          </button>
          <button onClick={disconnect} disabled={conn.networkState === 'OFFLINE'}
            style={{
              background: C.bg.panel,
              border: `1px solid ${conn.networkState !== 'OFFLINE' ? C.accent.red + '66' : C.border.default}`,
              color: conn.networkState !== 'OFFLINE' ? C.accent.red : C.text.dim,
              padding: '8px 14px', cursor: conn.networkState !== 'OFFLINE' ? 'pointer' : 'default',
              borderRadius: 6, fontSize: T.xs, letterSpacing: 1,
              fontFamily: "'Share Tech Mono', monospace",
            }}>
            DISCONNECT
          </button>
        </div>
      </div>

      {/* Topology */}
      <div style={{ background: C.bg.panel, border: `1px solid ${C.border.default}`, borderRadius: 10, padding: '24px 20px', marginBottom: 16 }}>
        <div style={{ color: C.text.secondary, fontSize: T.nano, letterSpacing: 2, marginBottom: 20 }}>NETWORK TOPOLOGY</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <TopoNode
            label="PUMP" sublabel={conn.ipAddress || 'no IP'}
            active={conn.networkState !== 'OFFLINE'} color={stateColor(conn.networkState)} icon="💉"
          />
          <ConnLine active={isConnected} animated={isConnected && pumpState.screen === 'RUNNING'} />
          <TopoNode
            label="WiFi AP" sublabel="WARD 4B"
            active={['ASSOCIATING','DHCP','AUTHENTICATING','CONNECTED','SYNCING_LIBRARY','LIBRARY_CURRENT'].includes(conn.networkState)}
            color={C.accent.blue} icon="📡"
          />
          <ConnLine active={isConnected} animated={isLive} />
          <TopoNode label="GATEWAY" sublabel={conn.gatewayIp} active={isConnected} color={C.accent.blue} icon="🖥️" />
          <ConnLine active={isLive} animated={conn.networkState === 'SYNCING_LIBRARY'} />
          <TopoNode
            label="DRUG SERVER" sublabel="LIB v4.2.1"
            active={conn.networkState === 'LIBRARY_CURRENT' || conn.networkState === 'SYNCING_LIBRARY'}
            color={C.accent.green} icon="🗄️"
          />
        </div>

        {isConnected && (
          <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {[
              { label: 'IP ADDRESS', value: conn.ipAddress },
              { label: 'SIGNAL',     value: `${conn.signalStrength}%` },
              { label: 'LIBRARY',    value: conn.libraryVersion },
              { label: 'FIRMWARE',   value: conn.firmwareVersion },
            ].map(item => (
              <div key={item.label} style={{ background: C.bg.inset, border: `1px solid ${C.border.subtle}`, borderRadius: 6, padding: '8px 10px' }}>
                <div style={{ color: C.text.secondary, fontSize: T.nano, letterSpacing: 1 }}>{item.label}</div>
                <div style={{ color: C.accent.blue, fontSize: T.nano, marginTop: 3 }}>{item.value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Packet log */}
      <div style={{ background: C.bg.panel, border: `1px solid ${C.border.default}`, borderRadius: 10, padding: 16 }}>
        <div style={{ color: C.text.secondary, fontSize: T.nano, letterSpacing: 2, marginBottom: 12 }}>
          PACKET LOG — {packets.length} packets
        </div>
        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: T.nano, fontFamily: "'Share Tech Mono', monospace" }}>
            <thead>
              <tr style={{ background: C.bg.hover }}>
                {['ms', 'direction', 'type', 'status'].map(h => (
                  <th key={h} style={{ padding: '4px 6px', color: C.text.secondary, textAlign: 'left', borderBottom: `1px solid ${C.border.default}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {packets.map(p => (
                <tr key={p.id} style={{ borderBottom: `1px solid ${C.border.subtle}` }}>
                  <td style={{ padding: '3px 6px', color: C.text.dim }}>{p.timestamp}</td>
                  <td style={{ padding: '3px 6px', color: packetColor(p) }}>{p.direction}</td>
                  <td style={{ padding: '3px 6px', color: packetColor(p) }}>{p.type}</td>
                  <td style={{ padding: '3px 6px', color: p.status === 'dropped' ? C.accent.red : C.accent.green }}>{p.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {packets.length === 0 && (
            <div style={{ color: C.text.dim, fontSize: T.xs, textAlign: 'center', padding: 24 }}>
              No packets — connect to begin
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
