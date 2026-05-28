import { useState, useCallback } from 'react';
import { PumpProvider } from './contexts/PumpContext';
import { BraunPumpProvider } from './contexts/BraunPumpContext';
import { GrasebyPumpProvider } from './contexts/GrasebyPumpContext';
import { NetworkProvider } from './contexts/NetworkContext';
import { ThemeProvider, useTheme, useThemeToggle } from './contexts/ThemeContext';
import { useLocalStorage } from './hooks/useLocalStorage';
import AlarisGP from './components/AlarisGP';
import BraunInfusomat from './components/BraunInfusomat';
import Graseby3100 from './components/Graseby3100';
import NetworkSimulator from './components/NetworkSimulator';
import ResearchPanel from './components/Research/ResearchPanel';
import Home from './components/Home';
import Compare from './components/Compare';

type Tab = 'HOME' | 'PUMP' | 'BRAUN' | 'GRASEBY' | 'COMPARE' | 'RESEARCH';

const TAB_LABELS: Record<Tab, string> = {
  HOME:     '⌂ HOME',
  PUMP:     '⊕ ALARIS GP',
  BRAUN:    '⊞ B. BRAUN',
  GRASEBY:  '⊟ GRASEBY',
  COMPARE:  '⊜ COMPARE',
  RESEARCH: '◈ RESEARCH',
};

const SIMULATOR_LS_KEYS = [
  'alaris_pump_state', 'alaris_session_log', 'alaris_session_start',
  'braun_pump_state',  'braun_session_log',  'braun_session_start',
  'graseby_pump_state','graseby_session_log','graseby_session_start',
  'pump_sim_tab',
];

function AppShell() {
  const [activeTab, setActiveTab] = useLocalStorage<Tab>('pump_sim_tab', 'HOME');
  const [confirmReset, setConfirmReset] = useState(false);
  const C = useTheme();
  const { isDark, toggleTheme } = useThemeToggle();

  const handleMasterReset = useCallback(() => {
    if (!confirmReset) { setConfirmReset(true); return; }
    SIMULATOR_LS_KEYS.forEach(k => { try { localStorage.removeItem(k); } catch { /* ignore */ } });
    window.location.reload();
  }, [confirmReset]);

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

        {/* Master reset — clears all simulator localStorage and reloads */}
        <button
          onClick={handleMasterReset}
          onMouseLeave={() => setConfirmReset(false)}
          title="Clear all simulator state and reload"
          style={{
            background: confirmReset ? '#4a0a0a' : 'transparent',
            border: 'none',
            borderLeft: `1px solid ${C.border.default}`,
            color: confirmReset ? '#ff6666' : C.text.secondary,
            padding: '0 14px',
            cursor: 'pointer',
            fontSize: 11,
            letterSpacing: 1,
            fontFamily: "'Share Tech Mono', monospace",
            transition: 'all 0.15s',
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          {confirmReset ? 'CONFIRM RESET?' : '⟳ RESET ALL'}
        </button>

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
      <div style={{ display: activeTab === 'HOME'     ? 'block' : 'none' }}><Home onNavigate={(tab) => setActiveTab(tab as Tab)} /></div>
      <div style={{ display: activeTab === 'PUMP'     ? 'block' : 'none' }}>
        <AlarisGP />
        <NetworkSimulator />
      </div>
      <div style={{ display: activeTab === 'BRAUN'    ? 'block' : 'none' }}><BraunInfusomat /></div>
      <div style={{ display: activeTab === 'GRASEBY'  ? 'block' : 'none' }}><Graseby3100 /></div>
      <div style={{ display: activeTab === 'COMPARE'  ? 'block' : 'none' }}><Compare /></div>
      <div style={{ display: activeTab === 'RESEARCH' ? 'block' : 'none' }}><ResearchPanel /></div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <NetworkProvider>
      <PumpProvider>
      <BraunPumpProvider>
      <GrasebyPumpProvider>
        <AppShell />
      </GrasebyPumpProvider>
      </BraunPumpProvider>
      </PumpProvider>
      </NetworkProvider>
    </ThemeProvider>
  );
}
