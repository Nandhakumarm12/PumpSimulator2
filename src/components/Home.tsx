import { useTheme } from '../contexts/ThemeContext';
import { T } from '../styles/tokens';

interface DeviceCard {
  id: string;
  name: string;
  manufacturer: string;
  type: string;
  icon: string;
  rateRange: string;
  drugLib: string;
  network: string;
  guardrails: string;
  tab: string;
  color: string;
}

const DEVICES: DeviceCard[] = [
  {
    id: 'alaris',
    name: 'Alaris GP',
    manufacturer: 'BD / CareFusion',
    type: 'Volumetric infusion pump',
    icon: '💉',
    rateRange: '0.1 – 1200 ml/h',
    drugLib: '10 drugs + MANUAL mode',
    network: 'WiFi Gateway + drug library sync',
    guardrails: 'Soft & hard Guardrail limits',
    tab: 'PUMP',
    color: '#58A6FF',
  },
  {
    id: 'braun',
    name: 'B. Braun Infusomat',
    manufacturer: 'B. Braun',
    type: 'Large-volume infusion pump',
    icon: '🩺',
    rateRange: '0.1 – 999 ml/h',
    drugLib: 'SpaceLibrary drug database',
    network: 'SpaceCom 2 hospital integration',
    guardrails: 'Dose error reduction software',
    tab: 'BRAUN',
    color: '#0969DA',
  },
  {
    id: 'graseby',
    name: 'Graseby 3100',
    manufacturer: 'Smiths Medical',
    type: 'Syringe pump',
    icon: '⚗️',
    rateRange: '0.1 – 200 ml/h',
    drugLib: 'Manual rate entry only',
    network: 'Standalone (no network)',
    guardrails: 'Rate bounds only',
    tab: 'GRASEBY',
    color: '#1A7F37',
  },
];

export default function Home({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const C = useTheme();

  return (
    <div style={{ fontFamily: "'Share Tech Mono', monospace", color: C.text.primary }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Rajdhani:wght@300;500;700&display=swap');
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .home-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.15) !important; }
        .home-card { transition: transform 0.2s, box-shadow 0.2s; }
      `}</style>

      {/* Hero */}
      <div style={{
        background: `linear-gradient(135deg, ${C.bg.panel} 0%, ${C.bg.inset} 100%)`,
        borderBottom: `1px solid ${C.border.default}`,
        padding: '64px 40px 48px',
        textAlign: 'center',
        animation: 'fadeIn 0.4s ease',
      }}>
        <div style={{
          display: 'inline-block',
          background: C.accent.blue + '18',
          border: `1px solid ${C.accent.blue}44`,
          borderRadius: 20,
          padding: '4px 14px',
          fontSize: T.xs,
          color: C.accent.blue,
          letterSpacing: 2,
          marginBottom: 20,
        }}>
          RESEARCH GRADE · UNIVERSITY PILOT
        </div>
        <h1 style={{
          fontSize: T.xxl,
          fontFamily: "'Rajdhani', sans-serif",
          fontWeight: 700,
          color: C.text.primary,
          letterSpacing: 2,
          margin: '0 0 12px',
        }}>
          Infusion Pump Safety Simulator
        </h1>
        <p style={{
          fontSize: T.md,
          color: C.text.secondary,
          maxWidth: 580,
          margin: '0 auto 28px',
          lineHeight: 1.7,
        }}>
          Research-grade simulator of clinical infusion pumps, built to generate
          AI training data for a safety and security ranking system for medical devices.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => onNavigate('PUMP')}
            style={{
              background: C.accent.blue,
              border: 'none',
              color: C.text.inverse,
              padding: '12px 28px',
              borderRadius: 8,
              fontSize: T.sm,
              cursor: 'pointer',
              letterSpacing: 1,
              fontFamily: "'Share Tech Mono', monospace",
            }}>
            Open Alaris GP
          </button>
          <button onClick={() => onNavigate('RESEARCH')}
            style={{
              background: 'transparent',
              border: `1px solid ${C.border.default}`,
              color: C.text.primary,
              padding: '12px 28px',
              borderRadius: 8,
              fontSize: T.sm,
              cursor: 'pointer',
              letterSpacing: 1,
              fontFamily: "'Share Tech Mono', monospace",
            }}>
            Research Panel
          </button>
        </div>
      </div>

      {/* Device cards */}
      <div style={{ padding: '48px 40px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ color: C.text.secondary, fontSize: T.xs, letterSpacing: 3, marginBottom: 8 }}>SIMULATED DEVICES</div>
          <div style={{ fontSize: T.xl, fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, color: C.text.primary }}>
            Three clinical pumps, one platform
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
          {DEVICES.map(device => (
            <div key={device.id} className="home-card" style={{
              background: C.bg.panel,
              border: `1px solid ${C.border.default}`,
              borderRadius: 12,
              padding: 24,
              cursor: 'pointer',
            }} onClick={() => onNavigate(device.tab)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 10,
                  background: device.color + '18',
                  border: `1px solid ${device.color}44`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 24,
                }}>
                  {device.icon}
                </div>
                <div>
                  <div style={{ color: C.text.primary, fontSize: T.md, fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>{device.name}</div>
                  <div style={{ color: C.text.secondary, fontSize: T.nano }}>{device.manufacturer}</div>
                </div>
              </div>

              <div style={{ color: device.color, fontSize: T.nano, letterSpacing: 1, marginBottom: 12 }}>{device.type.toUpperCase()}</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { label: 'Rate range', value: device.rateRange },
                  { label: 'Drug library', value: device.drugLib },
                  { label: 'Network', value: device.network },
                  { label: 'Safety', value: device.guardrails },
                ].map(row => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ color: C.text.secondary, fontSize: T.nano }}>{row.label}</span>
                    <span style={{ color: C.text.primary, fontSize: T.nano, textAlign: 'right' }}>{row.value}</span>
                  </div>
                ))}
              </div>

              <div style={{
                marginTop: 16,
                padding: '8px 12px',
                background: device.color + '12',
                border: `1px solid ${device.color}33`,
                borderRadius: 6,
                color: device.color,
                fontSize: T.nano,
                textAlign: 'center',
                letterSpacing: 1,
              }}>
                Open Simulator →
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Research context */}
      <div style={{
        background: C.bg.panel,
        borderTop: `1px solid ${C.border.default}`,
        borderBottom: `1px solid ${C.border.default}`,
        padding: '48px 40px',
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <div style={{ color: C.text.secondary, fontSize: T.xs, letterSpacing: 3, marginBottom: 8 }}>RESEARCH CONTEXT</div>
            <div style={{ fontSize: T.xl, fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, color: C.text.primary }}>
              AI-driven safety ranking for medical devices
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
            {[
              {
                icon: '🎯',
                title: 'Behavioural fidelity',
                desc: 'Simulators match the real devices exactly as documented in official Directions For Use manuals.',
              },
              {
                icon: '📊',
                title: 'AI training data',
                desc: 'Every session generates a structured TrainingRecord with 40+ features feeding directly into an AI risk model.',
              },
              {
                icon: '🔒',
                title: 'Safety research',
                desc: 'Guardrail overrides, dose errors, and alarm events are logged for analysis using 21 validated risk rules.',
              },
              {
                icon: '🏥',
                title: 'Clinical validation',
                desc: 'Drug limits sourced from clinical literature. Guardrail values match hospital formulary standards.',
              },
            ].map(item => (
              <div key={item.title} style={{
                background: C.bg.inset,
                border: `1px solid ${C.border.subtle}`,
                borderRadius: 10,
                padding: 20,
              }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>{item.icon}</div>
                <div style={{ color: C.text.primary, fontSize: T.sm, fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, marginBottom: 6 }}>{item.title}</div>
                <div style={{ color: C.text.secondary, fontSize: T.nano, lineHeight: 1.6 }}>{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '24px 40px', textAlign: 'center' }}>
        <div style={{ color: C.text.dim, fontSize: T.nano, lineHeight: 1.8 }}>
          QR Seed Pilot Study · University Research · Based on BD/CareFusion Alaris GP DFU (BD document 1000DF00152)
        </div>
        <div style={{ color: C.text.dim, fontSize: T.nano, marginTop: 4 }}>
          Cauchi et al. (2011) EICS4Med · CHI-MED Project · PVSio-web formal model
        </div>
      </div>
    </div>
  );
}
