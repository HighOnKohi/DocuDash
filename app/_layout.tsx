import '../global.css';

import {
  DarkTheme,
  DefaultTheme,
  SplashScreen,
  Stack,
  ThemeProvider,
  type Theme,
} from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { BrandMark } from '@/components/BrandMark';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { AppThemeProvider, useTheme } from '@/contexts/ThemeContext';

void SplashScreen.preventAutoHideAsync().catch(() => {});

export const unstable_settings = {
  anchor: '(auth)',
};

function SplashScreenController() {
  const { isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      void SplashScreen.hideAsync().catch(() => {});
    }
  }, [isLoading]);

  return null;
}

function RootNavigator() {
  const { isAuthenticated, isStaff, isLoading } = useAuth();
  const { colors } = useTheme();

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center gap-5 bg-surface-muted px-6">
        <BrandMark />
        <ActivityIndicator size="large" color={colors.primary} />
        <Text className="text-sm text-ink-muted">Checking your session...</Text>
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.surfaceMuted },
      }}
    >
      <Stack.Protected
        guard={!isAuthenticated}
        redirectTo={isStaff ? '/(admin)' : '/(resident)'}
      >
        <Stack.Screen name="(auth)" />
      </Stack.Protected>

      <Stack.Protected
        guard={isAuthenticated && !isStaff}
        redirectTo={isAuthenticated ? '/(admin)' : '/(auth)'}
      >
        <Stack.Screen name="(resident)" />
      </Stack.Protected>

      <Stack.Protected
        guard={isAuthenticated && isStaff}
        redirectTo={isAuthenticated ? '/(resident)' : '/(auth)'}
      >
        <Stack.Screen name="(admin)" />
      </Stack.Protected>
    </Stack>
  );
}

function RootThemedShell() {
  const { isDark, colors, themeVars } = useTheme();

  const navigationTheme = useMemo<Theme>(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      dark: isDark,
      colors: {
        ...base.colors,
        primary: colors.primary,
        background: colors.surfaceMuted,
        card: colors.surface,
        text: colors.ink,
        border: colors.border,
        notification: colors.primaryHover,
      },
    };
  }, [isDark, colors]);

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View className="flex-1 bg-surface-muted" style={themeVars}>
        <AuthProvider>
          <SplashScreenController />
          <RootNavigator />
        </AuthProvider>
      </View>
    </ThemeProvider>
  );
}

/**
 * Root layout with adaptive light/dark theme, global Tailwind stylesheet,
 * AuthProvider, and Expo Router `Stack.Protected` role guards separating
 * public/auth, resident, and staff/admin routes.
 */
export default function RootLayout() {
  return (
    <AppThemeProvider>
      <RootThemedShell />
    </AppThemeProvider>
  );
}
