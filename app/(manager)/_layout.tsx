import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, Slot, usePathname } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { Image, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import logoSource from '@/assets/images/logo.png';
import { BrandMark } from '@/components/BrandMark';
import { Button } from '@/components/Button';
import { SettingsButton } from '@/components/SettingsModal';
import { DESKTOP_BREAKPOINT } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { ManagerDataProvider } from '@/contexts/ManagerDataContext';
import { useTheme } from '@/contexts/ThemeContext';

type MaterialIconName = ComponentProps<typeof MaterialIcons>['name'];

interface NavItem {
  label: string;
  shortLabel: string;
  icon: MaterialIconName;
  href: '/(manager)' | '/(manager)/users' | '/(manager)/barangays' | '/(manager)/system';
  isActive: (pathname: string) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Overview',
    shortLabel: 'Overview',
    icon: 'admin-panel-settings',
    href: '/(manager)',
    isActive: (pathname) => pathname === '/' || pathname === '/(manager)',
  },
  {
    label: 'User Directory',
    shortLabel: 'Users',
    icon: 'manage-accounts',
    href: '/(manager)/users',
    isActive: (pathname) => pathname.startsWith('/users'),
  },
  {
    label: 'Barangays & Admin Requests',
    shortLabel: 'Barangays',
    icon: 'account-balance',
    href: '/(manager)/barangays',
    isActive: (pathname) => pathname.startsWith('/barangays'),
  },
  {
    label: 'Platform & RA 10173',
    shortLabel: 'Platform',
    icon: 'tune',
    href: '/(manager)/system',
    isActive: (pathname) => pathname.startsWith('/system'),
  },
];

/**
 * Exclusive App Manager Portal layout for `docudash.app@gmail.com`.
 * Enforces strict RA 10173 privacy isolation on top of root `Stack.Protected`.
 */
export default function ManagerLayout() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { isAuthenticated, isAppManager, isStaff, user, signOut } = useAuth();
  const { colors } = useTheme();
  const [signingOut, setSigningOut] = useState(false);

  if (!isAuthenticated || !isAppManager) {
    return (
      <Redirect
        href={
          isAuthenticated ? (isStaff ? '/(admin)' : '/(resident)/(tabs)') : '/(auth)'
        }
      />
    );
  }

  const isDesktop = width >= DESKTOP_BREAKPOINT;

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }

  const content = (
    <ManagerDataProvider>
      <Slot />
    </ManagerDataProvider>
  );

  if (isDesktop) {
    return (
      <View className="flex-1 flex-row bg-surface-muted">
        <View
          className="w-[272px] justify-between border-r border-border bg-surface px-4 py-6"
          style={{ paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20 }}
        >
          <View className="gap-6">
            <View className="gap-2 px-2">
              <BrandMark showTagline={false} />
              <View className="flex-row flex-wrap gap-1.5">
                <View className="self-start rounded-full border border-primary-200 bg-primary-50 px-2.5 py-0.5">
                  <Text className="text-[11px] font-bold uppercase tracking-wider text-primary">
                    App Manager
                  </Text>
                </View>
                <View className="self-start rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 dark:border-emerald-800 dark:bg-emerald-950/60">
                  <Text className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                    RA 10173 Safe
                  </Text>
                </View>
              </View>
            </View>

            <View className="gap-1.5">
              {NAV_ITEMS.map((item) => {
                const active = item.isActive(pathname);
                return (
                  <Pressable
                    key={item.href}
                    onPress={() => router.replace(item.href)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    className={`flex-row items-center gap-3 rounded-lg px-3.5 py-3 ${
                      active ? 'bg-primary-50' : 'bg-transparent'
                    }`}
                  >
                    <MaterialIcons
                      name={item.icon}
                      size={20}
                      color={active ? colors.primary : colors.inkMuted}
                    />
                    <Text
                      className={`text-sm font-semibold ${
                        active ? 'text-primary' : 'text-ink-muted'
                      }`}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View className="gap-3 border-t border-border pt-4">
            <View className="gap-0.5 px-2">
              <Text className="text-sm font-bold text-ink" numberOfLines={1}>
                Platform Administrator
              </Text>
              <Text className="text-xs text-ink-muted" numberOfLines={1}>
                {user?.email ?? 'docudash.app@gmail.com'}
              </Text>
              <Text className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                Privacy-Minimized Scope
              </Text>
            </View>
            <SettingsButton compact fullWidth />
            <Button
              label="Sign Out"
              variant="outline"
              size="sm"
              icon="logout"
              loading={signingOut}
              onPress={() => void handleSignOut()}
              fullWidth
            />
          </View>
        </View>

        <View className="flex-1 bg-surface-muted">{content}</View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface-muted">
      <View
        className="border-b border-border bg-surface px-4 pb-3"
        style={{ paddingTop: insets.top + 12 }}
      >
        <View className="flex-row items-center justify-between gap-2">
          <View className="flex-row items-center gap-2.5">
            <Image
              source={logoSource}
              resizeMode="contain"
              style={{ width: 36, height: 36, borderRadius: 8 }}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <View>
              <Text className="text-base font-bold text-ink">DocuDash App Manager</Text>
              <Text className="text-[11px] font-medium text-ink-subtle" numberOfLines={1}>
                {user?.email ?? 'docudash.app@gmail.com'}
              </Text>
            </View>
          </View>

          <View className="flex-row items-center gap-2">
            <SettingsButton compact />
            <Pressable
              onPress={() => void handleSignOut()}
              disabled={signingOut}
              accessibilityRole="button"
              accessibilityLabel="Sign out"
              className="flex-row items-center gap-1 rounded-lg border border-border px-3 py-1.5"
            >
              <MaterialIcons name="logout" size={16} color={colors.inkMuted} />
              <Text className="text-xs font-semibold text-ink-muted">Sign Out</Text>
            </Pressable>
          </View>
        </View>

        <View className="mt-3 flex-row gap-2">
          {NAV_ITEMS.map((item) => {
            const active = item.isActive(pathname);
            return (
              <Pressable
                key={item.href}
                onPress={() => router.replace(item.href)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                className={`flex-1 flex-row items-center justify-center gap-1 rounded-lg border py-2 ${
                  active
                    ? 'border-primary bg-primary-50'
                    : 'border-border bg-surface-muted'
                }`}
              >
                <MaterialIcons
                  name={item.icon}
                  size={15}
                  color={active ? colors.primary : colors.inkMuted}
                />
                <Text
                  className={`text-xs font-semibold ${
                    active ? 'text-primary' : 'text-ink-muted'
                  }`}
                >
                  {item.shortLabel}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View className="flex-1">{content}</View>
    </View>
  );
}
