import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ComponentProps } from 'react';
import { Text, View } from 'react-native';

import { getStatusLabel } from '@/constants/format';
import { colors } from '@/constants/theme';
import type { RequestStatus } from '@/types/database';

type MaterialIconName = ComponentProps<typeof MaterialIcons>['name'];

interface StatusStyle {
  bg: string;
  border: string;
  text: string;
  icon: MaterialIconName;
  iconColor: string;
}

const STATUS_STYLES: Record<RequestStatus, StatusStyle> = {
  pending: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-800',
    icon: 'schedule',
    iconColor: colors.warning,
  },
  reviewing: {
    bg: 'bg-sky-50',
    border: 'border-sky-200',
    text: 'text-sky-800',
    icon: 'rate-review',
    iconColor: '#0369A1',
  },
  ready: {
    bg: 'bg-primary-50',
    border: 'border-primary-200',
    text: 'text-primary',
    icon: 'qr-code-2',
    iconColor: colors.primary,
  },
  completed: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-800',
    icon: 'check-circle',
    iconColor: colors.success,
  },
  rejected: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-800',
    icon: 'cancel',
    iconColor: colors.danger,
  },
};

export interface StatusBadgeProps {
  status: RequestStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const style = STATUS_STYLES[status];

  return (
    <View
      className={`flex-row items-center gap-1.5 self-start rounded-full border px-2.5 py-1 ${style.bg} ${style.border}`}
      accessibilityLabel={`Status: ${getStatusLabel(status)}`}
    >
      <MaterialIcons
        name={style.icon}
        size={14}
        color={style.iconColor}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <Text className={`text-xs font-semibold ${style.text}`}>{getStatusLabel(status)}</Text>
    </View>
  );
}
