export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedColorScheme = 'light' | 'dark';

export interface ThemeColors {
  primary: string;
  primaryHover: string;
  primarySoft: string;
  primary100: string;
  primary200: string;
  primary800: string;
  accent: string;
  accentDark: string;
  accentSoft: string;
  surface: string;
  surfaceMuted: string;
  surfaceInput: string;
  border: string;
  borderStrong: string;
  ink: string;
  inkMuted: string;
  inkSubtle: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
}

/**
 * DocuDash design tokens for light mode. Matches the DocuDash royal blue
 * (`#01227F`) & amber-gold (`#FBC128`) brand icon.
 */
export const lightColors: ThemeColors = {
  primary: '#01227F',
  primaryHover: '#1D3FA3',
  primarySoft: '#EEF2FF',
  primary100: '#DCE5FF',
  primary200: '#B8C9F8',
  primary800: '#00175A',
  accent: '#FBC128',
  accentDark: '#B45309',
  accentSoft: '#FFFBEB',
  surface: '#FFFFFF',
  surfaceMuted: '#F8FAFC',
  surfaceInput: '#F1F5F9',
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',
  ink: '#0F172A',
  inkMuted: '#475569',
  inkSubtle: '#64748B',
  success: '#15803D',
  warning: '#B45309',
  danger: '#B91C1C',
  info: '#0369A1',
};

/** DocuDash design tokens for dark mode. */
export const darkColors: ThemeColors = {
  primary: '#3B6AE6',
  primaryHover: '#527DF2',
  primarySoft: '#172554',
  primary100: '#1E3A8A',
  primary200: '#1E40AF',
  primary800: '#0B1B54',
  accent: '#FBC128',
  accentDark: '#FCD34D',
  accentSoft: '#2A2008',
  surface: '#111827',
  surfaceMuted: '#090E1A',
  surfaceInput: '#1A2338',
  border: '#1F2A44',
  borderStrong: '#334155',
  ink: '#F8FAFC',
  inkMuted: '#CBD5E1',
  inkSubtle: '#94A3B8',
  success: '#4ADE80',
  warning: '#FBBF24',
  danger: '#F87171',
  info: '#38BDF8',
};

/** Backward-compatible static light palette alias. */
export const colors = lightColors;

export type ColorToken = keyof ThemeColors;

export function getThemeColors(scheme: ResolvedColorScheme): ThemeColors {
  return scheme === 'dark' ? darkColors : lightColors;
}

export function getThemeCssVariables(scheme: ResolvedColorScheme): Record<string, string> {
  const palette = getThemeColors(scheme);
  return {
    '--color-primary': palette.primary,
    '--color-primary-hover': palette.primaryHover,
    '--color-primary-50': palette.primarySoft,
    '--color-primary-100': palette.primary100,
    '--color-primary-200': palette.primary200,
    '--color-primary-800': palette.primary800,
    '--color-surface': palette.surface,
    '--color-surface-muted': palette.surfaceMuted,
    '--color-surface-input': palette.surfaceInput,
    '--color-border': palette.border,
    '--color-border-strong': palette.borderStrong,
    '--color-ink': palette.ink,
    '--color-ink-muted': palette.inkMuted,
    '--color-ink-subtle': palette.inkSubtle,
  };
}

/** Viewport width (px) at which layouts switch from mobile to desktop. */
export const DESKTOP_BREAKPOINT = 1024;
