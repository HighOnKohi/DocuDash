import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';

import { colors } from '@/constants/theme';

type MaterialIconName = ComponentProps<typeof MaterialIcons>['name'];

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'sm';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: MaterialIconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  accessibilityLabel?: string;
}

const VARIANT_CLASSES: Record<ButtonVariant, { container: string; pressed: string; text: string; iconColor: string }> = {
  primary: {
    container: 'bg-primary border border-primary',
    pressed: 'bg-primary-hover border-primary-hover',
    text: 'text-surface',
    iconColor: colors.surface,
  },
  secondary: {
    container: 'bg-primary-50 border border-primary-200',
    pressed: 'bg-primary-100 border-primary-200',
    text: 'text-primary',
    iconColor: colors.primary,
  },
  outline: {
    container: 'bg-surface border border-border-strong',
    pressed: 'bg-surface-muted border-border-strong',
    text: 'text-ink',
    iconColor: colors.ink,
  },
  ghost: {
    container: 'bg-transparent border border-transparent',
    pressed: 'bg-surface-muted border-transparent',
    text: 'text-primary',
    iconColor: colors.primary,
  },
  danger: {
    container: 'bg-surface border border-red-200',
    pressed: 'bg-red-50 border-red-600',
    text: 'text-red-700',
    iconColor: colors.danger,
  },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  disabled = false,
  fullWidth = false,
  accessibilityLabel,
}: ButtonProps) {
  const styles = VARIANT_CLASSES[variant];
  const isDisabled = disabled || loading;
  const sizeClass = size === 'sm' ? 'min-h-[38px] px-3.5 py-2' : 'min-h-[46px] px-5 py-3';
  const textSizeClass = size === 'sm' ? 'text-sm' : 'text-base';

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      className={`flex-row items-center justify-center gap-2 rounded-lg ${sizeClass} ${
        fullWidth ? 'w-full' : 'self-start'
      } ${styles.container} ${isDisabled ? 'opacity-50' : ''}`}
      style={({ pressed }) => (pressed && !isDisabled ? { opacity: 0.9 } : undefined)}
    >
      {loading ? (
        <ActivityIndicator size="small" color={styles.iconColor} />
      ) : icon ? (
        <MaterialIcons
          name={icon}
          size={size === 'sm' ? 18 : 20}
          color={styles.iconColor}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      ) : null}
      <Text className={`font-semibold ${textSizeClass} ${styles.text}`}>{label}</Text>
    </Pressable>
  );
}
