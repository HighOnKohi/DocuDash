import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { useTheme } from '@/contexts/ThemeContext';

import { Button } from './Button';

type MaterialIconName = ComponentProps<typeof MaterialIcons>['name'];

export function LoadingState({ message = 'Loading...' }: { message?: string }) {
  const { colors } = useTheme();

  return (
    <View className="items-center justify-center gap-3 rounded-card border border-border bg-surface px-6 py-12">
      <ActivityIndicator size="large" color={colors.primary} />
      <Text className="text-sm font-medium text-ink-muted">{message}</Text>
    </View>
  );
}

export interface EmptyStateProps {
  icon: MaterialIconName;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  const { colors } = useTheme();

  return (
    <View className="items-center gap-3 rounded-card border border-border bg-surface px-6 py-10">
      <View className="h-14 w-14 items-center justify-center rounded-full bg-primary-50">
        <MaterialIcons
          name={icon}
          size={28}
          color={colors.primary}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      </View>
      <Text className="text-center text-base font-bold text-ink">{title}</Text>
      <Text className="max-w-sm text-center text-sm leading-5 text-ink-muted">{description}</Text>
      {actionLabel && onAction ? (
        <View className="mt-2">
          <Button label={actionLabel} onPress={onAction} size="sm" />
        </View>
      ) : null}
    </View>
  );
}

export interface BannerProps {
  message: string;
  title?: string;
  tone?: 'error' | 'info' | 'success' | 'warning';
  actionLabel?: string;
  onAction?: () => void;
}

export function Banner({
  message,
  title,
  tone = 'error',
  actionLabel,
  onAction,
}: BannerProps) {
  const { colors } = useTheme();

  const bannerTones: Record<
    NonNullable<BannerProps['tone']>,
    { container: string; title: string; text: string; icon: MaterialIconName; iconColor: string }
  > = {
    error: {
      container: 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800',
      title: 'text-red-900 dark:text-red-200',
      text: 'text-red-800 dark:text-red-300',
      icon: 'error-outline',
      iconColor: colors.danger,
    },
    warning: {
      container: 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800',
      title: 'text-amber-900 dark:text-amber-200',
      text: 'text-amber-800 dark:text-amber-300',
      icon: 'warning-amber',
      iconColor: colors.warning,
    },
    success: {
      container: 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800',
      title: 'text-emerald-900 dark:text-emerald-200',
      text: 'text-emerald-800 dark:text-emerald-300',
      icon: 'check-circle-outline',
      iconColor: colors.success,
    },
    info: {
      container: 'bg-sky-50 dark:bg-sky-950/50 border-sky-200 dark:border-sky-800',
      title: 'text-sky-900 dark:text-sky-200',
      text: 'text-sky-800 dark:text-sky-300',
      icon: 'info-outline',
      iconColor: colors.info,
    },
  };

  const styles = bannerTones[tone];

  return (
    <View
      className={`gap-2 rounded-card border p-4 ${styles.container}`}
      accessibilityRole="alert"
    >
      <View className="flex-row items-start gap-2.5">
        <MaterialIcons
          name={styles.icon}
          size={20}
          color={styles.iconColor}
          style={{ marginTop: 1 }}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <View className="flex-1 gap-0.5">
          {title ? <Text className={`text-sm font-bold ${styles.title}`}>{title}</Text> : null}
          <Text className={`text-sm leading-5 ${styles.text}`}>{message}</Text>
        </View>
      </View>
      {actionLabel && onAction ? (
        <View className="pl-7">
          <Button label={actionLabel} onPress={onAction} variant="outline" size="sm" />
        </View>
      ) : null}
    </View>
  );
}
