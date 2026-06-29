import { useTheme } from '../contexts/ThemeContext';

const MANUALS = [
  {
    device: 'Alaris GP (BD / CareFusion)',
    color: '#4fc3f7',
    files: [
      { label: 'Alaris GP 8015 PC User Manual (2020)', file: 'BD_Alaris_8015_PC_User_Manual_2020-01.pdf' },
      { label: 'Alaris Infusion Central User Manual', file: 'alaris-infusion-central-user-manual---eng.pdf' },
    ],
  },
  {
    device: 'B. Braun Infusomat Space',
    color: '#81c784',
    files: [
      { label: 'Infusomat Space IFU — US Edition', file: 'braun_infusomat_space_ifu_586U_US.pdf' },
      { label: 'Infusomat Space IFU — GB Edition', file: 'braun_infusomat_space_ifu_686N_GB.pdf' },
      { label: 'Infusomat Service Manual', file: 'braun_infusomat_service_manual.pdf' },
    ],
  },
];

export default function Docs() {
  const C = useTheme();

  return (
    <div style={{
      maxWidth: 720,
      margin: '60px auto',
      padding: '0 24px',
      fontFamily: "'Share Tech Mono', monospace",
    }}>
      <div style={{ color: C.text.secondary, fontSize: 11, letterSpacing: 3, marginBottom: 8 }}>
        REFERENCE DOCUMENTS
      </div>
      <h2 style={{ color: C.text.primary, fontSize: 22, margin: '0 0 8px' }}>
        Device Manuals
      </h2>
      <p style={{ color: C.text.secondary, fontSize: 12, margin: '0 0 40px', lineHeight: 1.6 }}>
        Official manufacturer documentation for each simulated device.
        Click any manual to download the PDF.
      </p>

      {MANUALS.map(group => (
        <div key={group.device} style={{ marginBottom: 36 }}>
          <div style={{
            color: group.color,
            fontSize: 11,
            letterSpacing: 2,
            marginBottom: 12,
            borderBottom: `1px solid ${C.border.default}`,
            paddingBottom: 8,
          }}>
            {group.device.toUpperCase()}
          </div>
          {group.files.map(f => (
            <a
              key={f.file}
              href={`/docs/${f.file}`}
              download
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 18px',
                marginBottom: 8,
                background: C.bg.panel,
                border: `1px solid ${C.border.default}`,
                borderRadius: 4,
                color: C.text.primary,
                textDecoration: 'none',
                fontSize: 12,
                letterSpacing: 0.5,
                transition: 'border-color 0.15s, background 0.15s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLAnchorElement).style.borderColor = group.color;
                (e.currentTarget as HTMLAnchorElement).style.background = C.bg.hover;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLAnchorElement).style.borderColor = C.border.default;
                (e.currentTarget as HTMLAnchorElement).style.background = C.bg.panel;
              }}
            >
              <span>⬇ {f.label}</span>
              <span style={{ color: C.text.secondary, fontSize: 10, letterSpacing: 1 }}>PDF</span>
            </a>
          ))}
        </div>
      ))}
    </div>
  );
}
