import { useTheme } from '../contexts/ThemeContext';
import { T } from '../styles/tokens';

interface FeatureRow {
  feature: string;
  alaris: string;
  braun: string;
  graseby: string;
  category: string;
}

const FEATURES: FeatureRow[] = [
  // Hardware
  { category: 'Hardware', feature: 'Type',              alaris: 'Volumetric infusion',  braun: 'Large-volume infusion', graseby: 'Syringe pump' },
  { category: 'Hardware', feature: 'Manufacturer',      alaris: 'BD / CareFusion',       braun: 'B. Braun',              graseby: 'Smiths Medical' },
  { category: 'Hardware', feature: 'Rate range',        alaris: '0.1 – 1200 ml/h',       braun: '0.1 – 999 ml/h',        graseby: '0.1 – 200 ml/h' },
  { category: 'Hardware', feature: 'VTBI',              alaris: 'Yes (0.1 – 9999 ml)',    braun: 'Yes',                   graseby: 'Yes' },
  { category: 'Hardware', feature: 'KVO rate',          alaris: '1.0 ml/h',               braun: 'Configurable',          graseby: 'Not supported' },
  // Drug library
  { category: 'Drug library', feature: 'Drug library',  alaris: 'Yes (10 drugs)',          braun: 'Yes (SpaceLibrary)',     graseby: 'No (manual only)' },
  { category: 'Drug library', feature: 'Drugs',         alaris: 'Adrenaline, Morphine, Heparin, Dopamine, Noradrenaline, Propofol, Insulin, Amiodarone, KCl + MANUAL', braun: 'Adrenaline, Propofol, Dopamine, Dobutamine, Noradrenaline, Heparin, Insulin, Morphine, Midazolam, KCl, Saline', graseby: 'MANUAL ml/h only' },
  { category: 'Drug library', feature: 'Dose units',    alaris: '14 units (DFU standard)', braun: 'ml/h, µg/kg/min, U/h…', graseby: 'ml/h only' },
  { category: 'Drug library', feature: 'Weight-based',  alaris: 'Yes (µg/kg/min etc.)',    braun: 'Yes',                   graseby: 'No' },
  // Safety / Guardrails
  { category: 'Safety', feature: 'Guardrails',          alaris: 'Soft + Hard limits',      braun: 'DERS soft + hard',      graseby: 'Rate bounds only' },
  { category: 'Safety', feature: 'Soft limit warning',  alaris: 'Yes — can override',      braun: 'Yes — can override',    graseby: 'No' },
  { category: 'Safety', feature: 'Hard limit block',    alaris: 'Yes — must re-enter',     braun: 'Yes — must re-enter',   graseby: 'No' },
  { category: 'Safety', feature: 'Guardrail override log', alaris: 'Yes — logged',         braun: 'Yes — logged',          graseby: 'N/A' },
  // Bolus
  { category: 'Bolus', feature: 'Bolus mode',           alaris: 'Yes (hold to deliver)',   braun: 'Yes',                   graseby: 'No' },
  { category: 'Bolus', feature: 'Bolus rate',           alaris: '500 ml/h default (max 1200)', braun: 'Configurable',      graseby: 'N/A' },
  { category: 'Bolus', feature: 'Max bolus volume',     alaris: '5 ml',                    braun: 'Configurable',          graseby: 'N/A' },
  // Network
  { category: 'Network', feature: 'Connectivity',       alaris: 'WiFi 802.11',             braun: 'SpaceCom 2 module',     graseby: 'None (standalone)' },
  { category: 'Network', feature: 'Drug library sync',  alaris: 'Yes — over WiFi',         braun: 'Yes — via SpaceCom',    graseby: 'No' },
  { category: 'Network', feature: 'Remote monitoring',  alaris: 'Yes — Gateway server',    braun: 'Yes — InfoTherapy',     graseby: 'No' },
  // Alarms
  { category: 'Alarms', feature: 'Occlusion alarm',     alaris: 'Yes (L7–L8)',             braun: 'Yes',                   graseby: 'Yes' },
  { category: 'Alarms', feature: 'Air-in-line',         alaris: 'Yes (100 µl limit)',       braun: 'Yes',                   graseby: 'No' },
  { category: 'Alarms', feature: 'Battery warning',     alaris: 'Yes (<30 min)',            braun: 'Yes',                   graseby: 'Yes' },
  { category: 'Alarms', feature: 'Infusion complete',   alaris: 'Yes → KVO mode',          braun: 'Yes → KVO',             graseby: 'Yes — alarm only' },
  // Pressure
  { category: 'Pressure', feature: 'Pressure display',  alaris: 'Yes (L0–L8, 8 levels)',   braun: 'Yes',                   graseby: 'No' },
  { category: 'Pressure', feature: 'Occlusion limit',   alaris: 'Adjustable L1–L8',        braun: 'Adjustable mmHg',       graseby: 'Fixed' },
  // AI / Research
  { category: 'AI Research', feature: 'Training record',       alaris: 'Yes — 40+ features', braun: 'Yes — 40+ features', graseby: 'Yes — 40+ features' },
  { category: 'AI Research', feature: 'Risk labelling',        alaris: 'R01–R21 rules',      braun: 'R01–R21 rules',       graseby: 'R01–R21 rules' },
  { category: 'AI Research', feature: 'Scenario generation',   alaris: 'Yes',                braun: 'Yes',                  graseby: 'Yes' },
  { category: 'AI Research', feature: 'Session export',        alaris: 'CSV + JSON',         braun: 'CSV + JSON',           graseby: 'CSV + JSON' },
];

const CATEGORIES = Array.from(new Set(FEATURES.map(f => f.category)));

const DEVICE_COLORS = {
  alaris:  '#58A6FF',
  braun:   '#0969DA',
  graseby: '#1A7F37',
};

export default function Compare() {
  const C = useTheme();

  return (
    <div style={{ fontFamily: "'Share Tech Mono', monospace", color: C.text.primary }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Rajdhani:wght@300;500;700&display=swap');
        .cmp-row:hover td { background: ${C.bg.hover} !important; }
      `}</style>

      {/* Header */}
      <div style={{
        background: C.bg.panel,
        borderBottom: `1px solid ${C.border.default}`,
        padding: '36px 40px 28px',
      }}>
        <div style={{ color: C.text.secondary, fontSize: T.xs, letterSpacing: 3, marginBottom: 6 }}>FEATURE COMPARISON</div>
        <div style={{ fontSize: T.xl, fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, color: C.text.primary, marginBottom: 4 }}>
          Device Capability Matrix
        </div>
        <div style={{ color: C.text.secondary, fontSize: T.nano }}>
          Comparing three simulated clinical infusion pumps across all modelled features.
        </div>
      </div>

      {/* Table */}
      <div style={{ padding: '32px 40px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: T.nano,
            fontFamily: "'Share Tech Mono', monospace",
          }}>
            <thead>
              <tr style={{ background: C.bg.panel, position: 'sticky', top: 0, zIndex: 1 }}>
                <th style={{ padding: '12px 16px', color: C.text.secondary, textAlign: 'left', borderBottom: `2px solid ${C.border.default}`, width: '22%', letterSpacing: 1 }}>
                  FEATURE
                </th>
                {(['alaris', 'braun', 'graseby'] as const).map(d => (
                  <th key={d} style={{
                    padding: '12px 16px',
                    textAlign: 'left',
                    borderBottom: `2px solid ${DEVICE_COLORS[d]}`,
                    color: DEVICE_COLORS[d],
                    letterSpacing: 1,
                  }}>
                    {d === 'alaris' ? 'ALARIS GP' : d === 'braun' ? 'B. BRAUN' : 'GRASEBY 3100'}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.map(cat => {
                const rows = FEATURES.filter(f => f.category === cat);
                return [
                  // Category header row
                  <tr key={`cat-${cat}`}>
                    <td colSpan={4} style={{
                      padding: '14px 16px 6px',
                      color: C.text.secondary,
                      fontSize: T.nano,
                      letterSpacing: 2,
                      borderTop: `1px solid ${C.border.default}`,
                      background: C.bg.inset,
                    }}>
                      {cat.toUpperCase()}
                    </td>
                  </tr>,
                  // Feature rows
                  ...rows.map(row => (
                    <tr key={row.feature} className="cmp-row">
                      <td style={{ padding: '8px 16px', color: C.text.secondary, borderBottom: `1px solid ${C.border.subtle}` }}>
                        {row.feature}
                      </td>
                      <td style={{ padding: '8px 16px', color: C.text.primary, borderBottom: `1px solid ${C.border.subtle}` }}>
                        {row.alaris}
                      </td>
                      <td style={{ padding: '8px 16px', color: C.text.primary, borderBottom: `1px solid ${C.border.subtle}` }}>
                        {row.braun}
                      </td>
                      <td style={{ padding: '8px 16px', color: C.text.primary, borderBottom: `1px solid ${C.border.subtle}` }}>
                        {row.graseby}
                      </td>
                    </tr>
                  )),
                ];
              })}
            </tbody>
          </table>
        </div>

        {/* Summary badges */}
        <div style={{ marginTop: 32, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {[
            {
              device: 'Alaris GP',
              color: DEVICE_COLORS.alaris,
              desc: 'Full-featured volumetric pump with Guardrail drug library, WiFi connectivity, and the highest research fidelity. Recommended for primary studies.',
              badge: 'PRIMARY REFERENCE',
            },
            {
              device: 'B. Braun Infusomat',
              color: DEVICE_COLORS.braun,
              desc: 'European standard large-volume pump with SpaceCom integration. Dose error reduction software aligned with DERS clinical guidelines.',
              badge: 'SECONDARY DEVICE',
            },
            {
              device: 'Graseby 3100',
              color: DEVICE_COLORS.graseby,
              desc: 'Standalone syringe pump — no network, no drug library. Highest inherent risk profile due to absence of safety systems. Key dataset contrast case.',
              badge: 'CONTRAST CASE',
            },
          ].map(item => (
            <div key={item.device} style={{
              background: C.bg.panel,
              border: `1px solid ${item.color}44`,
              borderRadius: 10,
              padding: 20,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ color: item.color, fontSize: T.sm, fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>{item.device}</span>
                <span style={{
                  background: item.color + '18',
                  border: `1px solid ${item.color}44`,
                  color: item.color,
                  fontSize: T.nano,
                  padding: '2px 8px',
                  borderRadius: 10,
                  letterSpacing: 1,
                }}>{item.badge}</span>
              </div>
              <p style={{ color: C.text.secondary, fontSize: T.nano, lineHeight: 1.7, margin: 0 }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
