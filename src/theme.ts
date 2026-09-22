import { StatusBar, Platform, TextStyle, ViewStyle } from 'react-native';

/**
 * Design tokens.
 *
 * Two ideas drive the palette:
 *  1. Surfaces are NEUTRAL near-black / near-white, not tinted. A tinted surface
 *     plus a coloured accent on top reads as "muddy" — the accent has nothing to
 *     pop against.
 *  2. An accent is not one colour but three: a *bright* variant for icons and
 *     text on dark, a *deep* variant that is guaranteed to pass contrast with
 *     white (used for filled buttons and the hero), and a *soft* highlight.
 *     Previously one hex did all three jobs, which is why white-on-teal failed.
 */

export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedMode = 'light' | 'dark';
export type AccentKey = 'teal' | 'indigo' | 'violet' | 'emerald' | 'amber' | 'rose';

interface Accent {
  label: string;
  /** Bright variant — accents on dark surfaces. */
  bright: string;
  /** Deep variant — safe with white text; fills and light-mode accents. */
  deep: string;
  /** Soft highlight. */
  soft: string;
}

export const ACCENTS: Record<AccentKey, Accent> = {
  teal:    { label: 'Teal',    bright: '#2DD4BF', deep: '#0F766E', soft: '#5EEAD4' },
  indigo:  { label: 'Indigo',  bright: '#818CF8', deep: '#4338CA', soft: '#A5B4FC' },
  violet:  { label: 'Violet',  bright: '#A78BFA', deep: '#6D28D9', soft: '#C4B5FD' },
  emerald: { label: 'Emerald', bright: '#34D399', deep: '#047857', soft: '#6EE7B7' },
  amber:   { label: 'Amber',   bright: '#FBBF24', deep: '#B45309', soft: '#FCD34D' },
  rose:    { label: 'Rose',    bright: '#FB7185', deep: '#BE123C', soft: '#FDA4AF' },
};

export const ACCENT_ORDER: AccentKey[] = ['teal', 'indigo', 'violet', 'emerald', 'amber', 'rose'];

/** `#RRGGBB` -> `rgba(r,g,b,a)`. */
export function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const typography: Record<
  'display' | 'h1' | 'h2' | 'title' | 'body' | 'label' | 'caption' | 'overline',
  TextStyle
> = {
  display: { fontSize: 40, fontWeight: '900', letterSpacing: -1.4 },
  h1: { fontSize: 26, fontWeight: '800', letterSpacing: -0.6 },
  h2: { fontSize: 19, fontWeight: '800', letterSpacing: -0.3 },
  title: { fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  body: { fontSize: 14, fontWeight: '500' },
  label: { fontSize: 12.5, fontWeight: '700' },
  caption: { fontSize: 11, fontWeight: '600' },
  overline: { fontSize: 10, fontWeight: '800', letterSpacing: 1.6 },
};

const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 };
const borderRadius = { xs: 8, sm: 12, md: 16, lg: 20, xl: 28, full: 999 };

const chart = ['#14B8A6', '#6366F1', '#F59E0B', '#F43F5E', '#22C55E', '#8B5CF6'];

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceSecondary: string;
  surfaceElevated: string;

  primary: string;
  primaryDeep: string;
  primaryLight: string;
  primaryGlow: string;
  primarySubtle: string;
  /** Text/icon colour that sits on `primaryDeep`. */
  onPrimary: string;

  success: string;
  /** Safe fill behind white text (the `success` tint is too light for that). */
  successDeep: string;
  successGlow: string;
  successSubtle: string;
  danger: string;
  dangerDeep: string;
  dangerGlow: string;
  dangerSubtle: string;
  amber: string;
  amberGlow: string;
  amberSubtle: string;

  text: string;
  textSecondary: string;
  textMuted: string;
  textDim: string;

  border: string;
  borderStrong: string;

  chart: string[];
  bankCbe: string;
  bankCbeBirr: string;
  bankTelebirr: string;
}

export interface Theme {
  mode: ResolvedMode;
  isDark: boolean;
  accentKey: AccentKey;
  colors: ThemeColors;
  spacing: typeof spacing;
  borderRadius: typeof borderRadius;
  typography: typeof typography;
  shadow: {
    sm: ViewStyle;
    md: ViewStyle;
    lg: ViewStyle;
    accent: ViewStyle;
  };
  statusBarHeight: number;
}

type Neutral = Pick<
  ThemeColors,
  | 'background' | 'surface' | 'surfaceSecondary' | 'surfaceElevated'
  | 'text' | 'textSecondary' | 'textMuted' | 'textDim'
  | 'border' | 'borderStrong'
  | 'success' | 'danger' | 'amber'
>;

const darkNeutral: Neutral = {
  background: '#0B0D11',
  surface: '#14171D',
  surfaceSecondary: '#1B1F27',
  surfaceElevated: '#242A35',

  text: '#F6F8FB',
  textSecondary: '#C3CBD8',
  textMuted: '#8B95A5',
  textDim: '#5A6474',

  border: 'rgba(255, 255, 255, 0.07)',
  borderStrong: 'rgba(255, 255, 255, 0.12)',

  success: '#22C55E',
  danger: '#F87171',
  amber: '#FBBF24',
};

const lightNeutral: Neutral = {
  background: '#F6F7F9',
  surface: '#FFFFFF',
  surfaceSecondary: '#FFFFFF',
  surfaceElevated: '#EAEEF3',

  text: '#0F172A',
  textSecondary: '#3F4A5A',
  textMuted: '#5F6A7C',
  textDim: '#A3ACBA',

  border: 'rgba(15, 23, 42, 0.08)',
  borderStrong: 'rgba(15, 23, 42, 0.16)',

  success: '#15803D',
  danger: '#DC2626',
  amber: '#B45309',
};

const statusBarHeight = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 0;

export function buildTheme(mode: ResolvedMode, accentKey: AccentKey = 'teal'): Theme {
  const accent = ACCENTS[accentKey];
  const isDark = mode === 'dark';
  const neutral = isDark ? darkNeutral : lightNeutral;

  // On dark surfaces the bright variant reads; on light it has to be deep.
  const primary = isDark ? accent.bright : accent.deep;

  return {
    mode,
    isDark,
    accentKey,
    colors: {
      ...neutral,
      primary,
      primaryDeep: accent.deep,
      primaryLight: accent.soft,
      primaryGlow: withAlpha(accent.deep, isDark ? 0.28 : 0.14),
      primarySubtle: withAlpha(accent.deep, isDark ? 0.16 : 0.09),
      onPrimary: '#FFFFFF',
      successDeep: '#15803D',
      dangerDeep: '#B91C1C',
      successGlow: withAlpha(neutral.success, 0.18),
      successSubtle: withAlpha(neutral.success, 0.12),
      dangerGlow: withAlpha(neutral.danger, 0.16),
      dangerSubtle: withAlpha(neutral.danger, 0.12),
      amberGlow: withAlpha(neutral.amber, 0.16),
      amberSubtle: withAlpha(neutral.amber, 0.12),
      chart,
      bankCbe: isDark ? '#60A5FA' : '#1A6FC4',
      bankCbeBirr: isDark ? '#34D399' : '#047857',
      bankTelebirr: isDark ? '#A78BFA' : '#6D28D9',
    },
    spacing,
    borderRadius,
    typography,
    shadow: isDark
      ? {
          sm: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.45, shadowRadius: 8, elevation: 4 },
          md: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.55, shadowRadius: 16, elevation: 10 },
          lg: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.65, shadowRadius: 28, elevation: 18 },
          accent: { shadowColor: accent.deep, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.38, shadowRadius: 20, elevation: 12 },
        }
      : {
          sm: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
          md: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.09, shadowRadius: 14, elevation: 6 },
          lg: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.12, shadowRadius: 26, elevation: 12 },
          accent: { shadowColor: accent.deep, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 18, elevation: 10 },
        },
    statusBarHeight,
  };
}

export const DEFAULT_MODE: ThemeMode = 'dark';
export const DEFAULT_ACCENT: AccentKey = 'teal';

/** Category metadata is theme-independent — the hues read on both surfaces. */
export const CATEGORY_META: Record<string, { emoji: string; color: string }> = {
  'Food & Dining':   { emoji: '🍔', color: '#F97316' },
  'Shopping':        { emoji: '🛍️', color: '#A855F7' },
  'Transportation':  { emoji: '🚗', color: '#3B82F6' },
  'Salary':          { emoji: '💰', color: '#22C55E' },
  'UPI Transfers':   { emoji: '📲', color: '#14B8A6' },
  'Other':           { emoji: '🏷️', color: '#64748B' },
};
