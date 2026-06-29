import { PumpProvider } from './contexts/PumpContext';
import { BraunPumpProvider } from './contexts/BraunPumpContext';
import { NetworkProvider } from './contexts/NetworkContext';
import { ThemeProvider, useTheme, useThemeToggle } from './contexts/ThemeContext';
import { useLocalStorage } from './hooks/useLocalStorage';
import AlarisGP from './components/AlarisGP';
import BraunInfusomat from './components/BraunInfusomat';
import Docs from './components/Docs';

type Tab = 'PUMP' | 'BRAUN' | 'DOCS';

const TAB_LABELS: Record<Tab, string> = {
  PUMP:  '⊕ ALARIS GP',
  BRAUN: '⊞ B. BRAUN',
  DOCS:  '⬇ MANUALS',
};

function AppShell() {
  const [activeTab, setActiveTab] = useLocalStorage<Tab>('pump_sim_tab', 'PUMP');
  const C = useTheme();
  const { isDark, toggleTheme } = useThemeToggle();

  return (
    <div style={{
      minHeight: '100vh',
      background: C.bg.page,
      fontFamily: "'Share Tech Mono', monospace",
      backgroundImage: `radial-gradient(ellipse at 20% 50%, ${C.bg.inset} 0%, ${C.bg.page} 70%)`,
    }}>
      {/* Tab bar */}
      <div style={{
        display: 'flex',
        alignItems: 'stretch',
        borderBottom: `1px solid ${C.border.default}`,
        background: C.bg.panel,
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        {/* Tabs — centred */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          {(Object.keys(TAB_LABELS) as Tab[]).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              style={{
                background: activeTab === tab ? C.bg.hover : 'transparent',
                border: 'none',
                borderBottom: activeTab === tab ? `2px solid ${C.accent.blue}` : '2px solid transparent',
                color: activeTab === tab ? C.accent.blue : C.text.secondary,
                padding: '12px 28px',
                cursor: 'pointer',
                fontSize: 11,
                letterSpacing: 2,
                fontFamily: "'Share Tech Mono', monospace",
                transition: 'all 0.15s',
              }}>
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>

        {/* Theme toggle — pinned right */}
        <button
          onClick={toggleTheme}
          title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          style={{
            background: 'transparent',
            border: 'none',
            borderLeft: `1px solid ${C.border.default}`,
            color: C.text.secondary,
            padding: '0 16px',
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: 1,
            transition: 'color 0.15s',
            flexShrink: 0,
          }}
          onMouseEnter={e => (e.currentTarget.style.color = C.accent.blue)}
          onMouseLeave={e => (e.currentTarget.style.color = C.text.secondary)}
        >
          {isDark ? '☀' : '🌙'}
        </button>
      </div>

      {/* Tab content */}
      <div style={{ display: activeTab === 'PUMP'  ? 'block' : 'none' }}><AlarisGP /></div>
      <div style={{ display: activeTab === 'BRAUN' ? 'block' : 'none' }}><BraunInfusomat /></div>
      <div style={{ display: activeTab === 'DOCS'  ? 'block' : 'none' }}><Docs /></div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <NetworkProvider>
      <PumpProvider>
      <BraunPumpProvider>
        <AppShell />
      </BraunPumpProvider>
      </PumpProvider>
      </NetworkProvider>
    </ThemeProvider>
  );
}
