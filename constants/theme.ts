/**
 * DocuDash design tokens for places where a raw color value is required
 * (e.g. icon `color` props, StatusBar, navigation theme). Tailwind classes in
 * `tailwind.config.js` mirror these values; keep both in sync.
 */
export const colors = {
  primary: '#991B1B',
  primaryHover: '#B91C1C',
  primarySoft: '#FEF2F2',
  surface: '#FFFFFF',
  surfaceMuted: '#F8FAFC',
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',
  ink: '#0F172A',
  inkMuted: '#475569',
  inkSubtle: '#64748B',
  success: '#15803D',
  warning: '#B45309',
  danger: '#B91C1C',
} as const;

export type ColorToken = keyof typeof colors;

/** Viewport width (px) at which layouts switch from mobile to desktop. */
export const DESKTOP_BREAKPOINT = 1024;
