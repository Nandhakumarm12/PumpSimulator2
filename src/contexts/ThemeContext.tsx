/**
 * ThemeContext — provides the active colour theme to the entire app.
 *
 * Theme preference is persisted to localStorage (key: 'pump_sim_theme').
 * Refreshing the page restores the last chosen theme.
 *
 * Usage in components:
 *   const C = useTheme();          // get colour tokens
 *   const { isDark, toggleTheme } = useThemeToggle();  // toggle button only
 */

import { createContext, useContext, useState, type ReactNode } from 'react';
import { DARK_THEME, LIGHT_THEME, type ColorTheme } from '../styles/themes';

const LS_KEY = 'pump_sim_theme';

interface ThemeContextValue {
  C:           ColorTheme;
  isDark:      boolean;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved !== null) return saved === 'dark';
    } catch { /* localStorage unavailable */ }
    return true; // default: dark
  });

  const C = isDark ? DARK_THEME : LIGHT_THEME;

  function toggleTheme() {
    setIsDark(prev => {
      const next = !prev;
      try { localStorage.setItem(LS_KEY, next ? 'dark' : 'light'); } catch { /* ignore */ }
      return next;
    });
  }

  return (
    <ThemeContext.Provider value={{ C, isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ColorTheme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx.C;
}

export function useThemeToggle(): { isDark: boolean; toggleTheme: () => void } {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemeToggle must be used inside ThemeProvider');
  return { isDark: ctx.isDark, toggleTheme: ctx.toggleTheme };
}
