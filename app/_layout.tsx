import '../global.css';

import { DefaultTheme, SplashScreen, Stack, ThemeProvider, type Theme } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { BrandMark } from '@/components/BrandMark';
import { colors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';

void SplashScreen.preventAutoHideAsync().catch(() => {});

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
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
      </Stack.Protected>

      <Stack.Protected guard={isAuthenticated && !isStaff}>
        <Stack.Screen name="(resident)" />
      </Stack.Protected>

      <Stack.Protected guard={isAuthenticated && isStaff}>
        <Stack.Screen name="(admin)" />
      </Stack.Protected>
    </Stack>
  );
}

/**
 * Root layout with light theme, global Tailwind stylesheet, AuthProvider, and
 * Expo Router `Stack.Protected` role guards separating public/auth, resident,
 * and staff/admin routes.
 */
export default function RootLayout() {
  return (
    <ThemeProvider value={docuDashTheme}>
      <StatusBar style="dark" />
      <AuthProvider>
        <SplashScreenController />
        <RootNavigator />
      </AuthProvider>
    </ThemeProvider>
  );
}
