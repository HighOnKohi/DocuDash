import '../global.css';

import { DefaultTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { colors } from '@/constants/theme';

const docuDashTheme: Theme = {
  ...DefaultTheme,
  dark: false,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.surfaceMuted,
    card: colors.surface,
    text: colors.ink,
    border: colors.border,
    notification: colors.primaryHover,
  },
};

/**
 * Root layout. Phase 1 provides the global stylesheet, light theme and a
 * headerless stack. The authentication / role guard is layered on in Phase 4.
 */
export default function RootLayout() {
  return (
    <ThemeProvider value={docuDashTheme}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surfaceMuted } }} />
    </ThemeProvider>
  );
}
