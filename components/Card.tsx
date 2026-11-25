import type { PropsWithChildren, ReactNode } from 'react';
import { Text, View } from 'react-native';

export interface CardProps extends PropsWithChildren {
  title?: string;
  subtitle?: string;
  rightSlot?: ReactNode;
  className?: string;
}

export function Card({ title, subtitle, rightSlot, className = '', children }: CardProps) {
  return (
    <View className={`rounded-card border border-border bg-surface p-5 ${className}`}>
      {title || subtitle || rightSlot ? (
        <View className="mb-4 flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-0.5">
            {title ? <Text className="text-base font-bold text-ink">{title}</Text> : null}
            {subtitle ? <Text className="text-sm text-ink-muted">{subtitle}</Text> : null}
          </View>
          {rightSlot ? <View>{rightSlot}</View> : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}
