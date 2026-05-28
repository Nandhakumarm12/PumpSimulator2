/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  PUMP SIMULATOR — THEME DEFINITIONS                             ║
 * ║  Edit this file to change the look of the entire application.   ║
 * ║                                                                  ║
 * ║  DARK_THEME  — GitHub dark palette (default)                    ║
 * ║  LIGHT_THEME — GitHub light palette                             ║
 * ║                                                                  ║
 * ║  To add a new theme:                                            ║
 * ║    1. Copy DARK_THEME, give it a new name                       ║
 * ║    2. Change only bg / border / text / accent values            ║
 * ║    3. Leave device.* unchanged (hardware-faithful colours)      ║
 * ║    4. Export it and add it to THEMES map below                  ║
 * ║    5. ThemeContext will pick it up automatically                ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * WHAT EACH SECTION CONTROLS
 * ─────────────────────────────────────────────────────────────────────
 *  bg.*       Page and panel backgrounds
 *  border.*   Borders, dividers, outlines
 *  text.*     Text colour hierarchy (primary → secondary → dim)
 *  accent.*   Status / interactive colours (blue, green, amber, red…)
 *  device.*   ⚠ DO NOT CHANGE — LCD/chassis colours match real hardware
 */

// ─── Theme shape ─────────────────────────────────────────────────────────────

export interface ColorTheme {
  bg: {
    /** Outermost page / app shell */
    page:    string;
    /** Primary card / panel surface */
    panel:   string;
    /** Secondary inset surface (nested rows, sub-panels) */
    inset:   string;
    /** Hover / active state highlight */
    hover:   string;
    /** Semi-transparent overlay / modal backdrop */
    overlay: string;
  };
  border: {
    /** Standard panel border */
    default: string;
    /** Subtle row divider */
    subtle:  string;
    /** Active / focused border */
    active:  string;
  };
  text: {
    /** Primary readable text */
    primary:   string;
    /** Secondary / muted text */
    secondary: string;
    /** Disabled / placeholder text */
    dim:       string;
    /** Inverted (on coloured bg) */
    inverse:   string;
  };
  accent: {
    /** Interactive blue — links, buttons, active tabs */
    blue:   string;
    /** Success / running / connected */
    green:  string;
    /** Warning / hold / caution */
    amber:  string;
    /** Danger / alarm / critical */
    red:    string;
    /** Research / analytics highlights */
    purple: string;
    /** Info / network / secondary indicator */
    cyan:   string;
  };
  /**
   * Hardware-faithful device colours.
   * These are NOT theme colours — they match the real physical devices
   * and must remain identical in every theme.
   */
  device: {
    alaris: {
      lcdBg:   string;   // phosphor green-tinted background
      lcdText: string;   // primary green text
      lcdDim:  string;   // secondary dim green
      chassis: string;   // pump body colour
      panel:   string;   // header / footer panel
      accent:  string;   // BD/CareFusion blue
    };
    braun: {
      lcdBg:   string;   // white/blue LCD background
      lcdText: string;   // dark navy text
      accent:  string;   // B. Braun corporate blue
      chassis: string;   // pump body
      panel:   string;   // panel border
    };
    graseby: {
      lcdBg:   string;   // near-black green-tinted display
      lcdText: string;   // bright green phosphor text
      lcdDim:  string;   // dim green secondary text
      amber:   string;   // warning / hold LED
      red:     string;   // alarm LED
      housing: string;   // dark grey housing
    };
  };
}

// ─── Device colours (shared — never changes between themes) ──────────────────

const DEVICE: ColorTheme['device'] = {
  alaris: {
    lcdBg:   '#0a1a0a',
    lcdText: '#3aff3a',
    lcdDim:  '#1a6b1a',
    chassis: '#1a1f2e',
    panel:   '#080e18',
    accent:  '#4a9eff',
  },
  braun: {
    lcdBg:   '#e8f0f8',
    lcdText: '#001f5c',
    accent:  '#0055a4',
    chassis: '#1a2535',
    panel:   '#0d1828',
  },
  graseby: {
    lcdBg:   '#0a1a0a',
    lcdText: '#22cc44',
    lcdDim:  '#115522',
    amber:   '#ffaa00',
    red:     '#ff3333',
    housing: '#2a2a2a',
  },
};

// ─── Dark theme ───────────────────────────────────────────────────────────────

export const DARK_THEME: ColorTheme = {
  bg: {
    page:    '#0F1117',
    panel:   '#161B22',
    inset:   '#1C2128',
    hover:   '#222831',
    overlay: '#0F111799',
  },
  border: {
    default: '#30363D',
    subtle:  '#21262D',
    active:  '#58A6FF',
  },
  text: {
    primary:   '#E6EDF3',
    secondary: '#8B949E',
    dim:       '#484F58',
    inverse:   '#0F1117',
  },
  accent: {
    blue:   '#58A6FF',
    green:  '#3FB950',
    amber:  '#E3B341',
    red:    '#F85149',
    purple: '#BC8CFF',
    cyan:   '#39C5CF',
  },
  device: DEVICE,
};

// ─── Light theme ──────────────────────────────────────────────────────────────

export const LIGHT_THEME: ColorTheme = {
  bg: {
    page:    '#F6F8FA',
    panel:   '#FFFFFF',
    inset:   '#EAEEF2',
    hover:   '#F3F4F6',
    overlay: '#F6F8FA99',
  },
  border: {
    default: '#D0D7DE',
    subtle:  '#D8DEE4',
    active:  '#0969DA',
  },
  text: {
    primary:   '#1F2328',
    secondary: '#656D76',
    dim:       '#9CA3AF',
    inverse:   '#F6F8FA',
  },
  accent: {
    blue:   '#0969DA',
    green:  '#1A7F37',
    amber:  '#9A6700',
    red:    '#CF222E',
    purple: '#8250DF',
    cyan:   '#0550AE',
  },
  device: DEVICE,
};

// ─── Theme registry ───────────────────────────────────────────────────────────
// Add new themes here — ThemeContext will cycle through this map.

export const THEMES: Record<string, ColorTheme> = {
  dark:  DARK_THEME,
  light: LIGHT_THEME,
};

export type ThemeKey = keyof typeof THEMES;
