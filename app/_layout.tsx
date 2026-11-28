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
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { BrandMark } from '@/components/BrandMark';
import { InAppNotificationBanner } from '@/components/InAppNotificationBanner';
import { PermissionsPromptModal } from '@/components/PermissionsPromptModal';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { AppThemeProvider, useTheme } from '@/contexts/ThemeContext';
import {
  getCameraPermissionDetails,
  getNotificationPermissionStatusDetails,
  getPermissionPromptDismissed,
  isNativePermissionsSupported,
  setPermissionPromptDismissed,
} from '@/services/permissionService';

void SplashScreen.preventAutoHideAsync().catch(() => { });

export const unstable_settings = {
  anchor: '(auth)',
};

function SplashScreenController() {
  const { isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      void SplashScreen.hideAsync().catch(() => { });
    }
  }, [isLoading]);

  return null;
}

/**
 * Prompts signed-in native mobile users once per session if essential device
 * permissions (Notifications, and Camera for staff) have not been granted yet.
 */
function PermissionsPromptController() {
  const { user, isAuthenticated, isPasswordRecovery, isAppManager, isStaff, isLoading } = useAuth();
  const [promptVisible, setPromptVisible] = useState(false);
  const promptedUserRef = useRef<string | null>(null);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!isNativePermissionsSupported() || isLoading || isPasswordRecovery || isAppManager) {
      return;
    }

    if (!isAuthenticated || !userId) {
      promptedUserRef.current = null;
      return;
    }

    if (promptedUserRef.current === userId) {
      return;
    }
    promptedUserRef.current = userId;

    let active = true;
    void (async () => {
      try {
        const dismissed = await getPermissionPromptDismissed();
        if (!active || dismissed) return;

        const [notif, camera] = await Promise.all([
          getNotificationPermissionStatusDetails(),
          isStaff
            ? getCameraPermissionDetails()
            : Promise.resolve({ status: 'granted' as const, canAskAgain: true }),
        ]);

        if (!active) return;
        const needsNotif = notif.status !== 'granted' && notif.status !== 'unsupported';
        const needsCamera =
          isStaff && camera.status !== 'granted' && camera.status !== 'unsupported';

        if (needsNotif || needsCamera) {
          setPromptVisible(true);
        }
      } catch {
        // Ignore transient startup permission query failures.
      }
    })();

    return () => {
      active = false;
    };
  }, [isAuthenticated, isLoading, isPasswordRecovery, isAppManager, isStaff, userId]);

  if (!isNativePermissionsSupported() || !isAuthenticated || isAppManager) {
    return null;
  }

  return (
    <PermissionsPromptModal
      visible={promptVisible}
      onClose={() => setPromptVisible(false)}
      includeCamera={isStaff}
      showDismissForever
      onDismissForever={() => {
        setPromptVisible(false);
        void setPermissionPromptDismissed(true).catch(() => { });
      }}
    />
  );
}

function RootNavigator() {
  const { isAuthenticated, isPasswordRecovery, isAppManager, isStaff, isLoading } = useAuth();
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

  const authenticatedHome = isAppManager
    ? '/(manager)'
    : isStaff
      ? '/(admin)'
      : '/(resident)/(tabs)';

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.surfaceMuted },
      }}
    >
      <Stack.Screen name="reset-password" />

      <Stack.Protected
        guard={!isAuthenticated && !isPasswordRecovery}
        redirectTo={isPasswordRecovery ? '/reset-password' : authenticatedHome}
      >
        <Stack.Screen name="(auth)" />
      </Stack.Protected>

      <Stack.Protected
        guard={isAuthenticated && isAppManager && !isPasswordRecovery}
        redirectTo={
          isPasswordRecovery ? '/reset-password' : isAuthenticated ? authenticatedHome : '/(auth)'
        }
      >
        <Stack.Screen name="(manager)" />
      </Stack.Protected>

      <Stack.Protected
        guard={isAuthenticated && !isAppManager && !isStaff && !isPasswordRecovery}
        redirectTo={
          isPasswordRecovery ? '/reset-password' : isAuthenticated ? authenticatedHome : '/(auth)'
        }
      >
        <Stack.Screen name="(resident)" />
      </Stack.Protected>

      <Stack.Protected
        guard={isAuthenticated && !isAppManager && isStaff && !isPasswordRecovery}
        redirectTo={
          isPasswordRecovery ? '/reset-password' : isAuthenticated ? authenticatedHome : '/(auth)'
        }
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
          <NotificationProvider>
            <SplashScreenController />
            <PermissionsPromptController />
            <RootNavigator />
            <InAppNotificationBanner />
          </NotificationProvider>
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
