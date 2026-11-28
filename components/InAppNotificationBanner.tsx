import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNotifications } from '@/contexts/NotificationContext';
import { useTheme } from '@/contexts/ThemeContext';
import type { InAppNotificationItem } from '@/services/notificationService';

type MaterialIconName = ComponentProps<typeof MaterialIcons>['name'];

function getBannerVisuals(
  status: InAppNotificationItem['status'],
  colors: ReturnType<typeof useTheme>['colors']
): { icon: MaterialIconName; iconColor: string; badgeBg: string; border: string } {
  switch (status) {
    case 'ready':
      return {
        icon: 'check-circle',
        iconColor: colors.success,
        badgeBg: 'bg-emerald-100 dark:bg-emerald-950',
        border: 'border-emerald-300 dark:border-emerald-800',
      };
    case 'completed':
      return {
        icon: 'verified',
        iconColor: colors.primary,
        badgeBg: 'bg-primary-50',
        border: 'border-primary-200',
      };
    case 'rejected':
      return {
        icon: 'error-outline',
        iconColor: colors.danger,
        badgeBg: 'bg-red-100 dark:bg-red-950',
        border: 'border-red-300 dark:border-red-800',
      };
    case 'reviewing':
      return {
        icon: 'rate-review',
        iconColor: colors.info,
        badgeBg: 'bg-sky-100 dark:bg-sky-950',
        border: 'border-sky-300 dark:border-sky-800',
      };
  }
}

/**
 * Floating top in-app notification banner shown whenever a resident's document
 * transitions (especially to `ready` for pickup), on both mobile and web.
 */
export function InAppNotificationBanner() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { activeBanner, dismissBanner, markAlertRead } = useNotifications();

  if (!activeBanner) {
    return null;
  }

  const visuals = getBannerVisuals(activeBanner.status, colors);
  const canOpenRequest = Boolean(activeBanner.requestId);

  function handleOpen() {
    if (!activeBanner) return;
    markAlertRead(activeBanner.id);
    const targetId = activeBanner.requestId;
    dismissBanner();
    if (targetId) {
      router.push({
        pathname: '/(resident)/request/[id]',
        params: { id: targetId },
      });
    }
  }

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: insets.top + 10,
        left: 16,
        right: 16,
        zIndex: 1000,
        alignItems: 'center',
      }}
    >
      <Pressable
        onPress={canOpenRequest ? handleOpen : dismissBanner}
        accessibilityRole="alert"
        accessibilityLabel={`${activeBanner.title}. ${activeBanner.body}`}
        className={`w-full max-w-xl flex-row items-start gap-3 rounded-2xl border bg-surface p-3.5 shadow-xl ${visuals.border}`}
      >
        <View
          className={`h-10 w-10 items-center justify-center rounded-xl ${visuals.badgeBg}`}
        >
          <MaterialIcons name={visuals.icon} size={22} color={visuals.iconColor} />
        </View>

        <View className="flex-1 gap-0.5">
          <Text className="text-sm font-bold text-ink">{activeBanner.title}</Text>
          <Text className="text-xs leading-4 text-ink-muted" numberOfLines={3}>
            {activeBanner.body}
          </Text>
          {canOpenRequest ? (
            <Text className="mt-1 text-xs font-bold text-primary">
              Tap to view request &amp; QR pass →
            </Text>
          ) : null}
        </View>

        <Pressable
          onPress={dismissBanner}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Dismiss notification banner"
          className="rounded-full p-1"
        >
          <MaterialIcons name="close" size={18} color={colors.inkSubtle} />
        </Pressable>
      </Pressable>
    </View>
  );
}
