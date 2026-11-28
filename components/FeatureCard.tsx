import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ComponentProps } from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '@/contexts/ThemeContext';

export type MaterialIconName = ComponentProps<typeof MaterialIcons>['name'];

export interface FeatureCardProps {
  icon: MaterialIconName;
  title: string;
  description: string;
}

/** Stateless card used to describe a capability with an icon, title and copy. */
export function FeatureCard({ icon, title, description }: FeatureCardProps) {
  const { colors } = useTheme();

  return (
    <View className="flex-1 flex-row gap-4 rounded-card border border-border bg-surface p-5 lg:min-w-[260px] lg:flex-col">
      <View className="h-11 w-11 items-center justify-center rounded-lg bg-primary-50">
        <MaterialIcons
          name={icon}
          size={24}
          color={colors.primary}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      </View>
      <View className="flex-1 gap-1">
        <Text className="text-base font-semibold text-ink">{title}</Text>
        <Text className="text-sm leading-5 text-ink-muted">{description}</Text>
      </View>
    </View>
  );
}
