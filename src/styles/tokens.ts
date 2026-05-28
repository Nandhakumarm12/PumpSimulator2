/**
 * Design tokens — typography scale only.
 *
 * For COLOURS, edit src/styles/themes.ts — that is the single file
 * that controls the entire app palette.
 */

/**
 * Typography scale (px).
 * Nothing in the app UI should use a font size smaller than T.nano (11px).
 * Sizes below 11px fail WCAG 1.4.4 (minimum text size).
 *
 * Device LCD sizes are an exception — they are hardware-faithful.
 */
export const T = {
  /** Smallest permitted UI text — timestamps, de-emphasised metadata */
  nano:  13,
  /** Labels, badges, table headers */
  xs:    14,
  /** Table body, descriptions, helper text */
  sm:    15,
  /** Default body text, button labels */
  md:    16,
  /** Card titles, panel headings */
  lg:    18,
  /** Metric values, status numbers */
  xl:    22,
  /** Large display / topology labels */
  xxl:   28,
  /** LCD rate display — hardware-faithful, do not change */
  lcd:   36,
} as const;

export type TSize = typeof T[keyof typeof T];

// ─── Re-exports for backward compatibility ────────────────────────────────────
// Components that import C from tokens still work.
// New code should import from themes.ts directly.

export type { ColorTheme } from './themes';
export { DARK_THEME as C, DARK_THEME, LIGHT_THEME, THEMES } from './themes';
export type { ThemeKey } from './themes';
