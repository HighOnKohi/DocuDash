import { Image, Text, View } from 'react-native';

import logoSource from '@/assets/images/logo.png';

export interface BrandMarkProps {
  /** Show the "Barangay Document Services" tagline under the wordmark. */
  showTagline?: boolean;
  /** Compact size for dense mobile headers. */
  size?: 'sm' | 'md';
}

/** DocuDash logo lockup: official brand icon plus wordmark. */
export function BrandMark({ showTagline = true, size = 'md' }: BrandMarkProps) {
  const iconSize = size === 'sm' ? 36 : 48;
  const borderRadius = size === 'sm' ? 8 : 12;
  const titleClass =
    size === 'sm' ? 'text-lg font-bold tracking-tight text-ink' : 'text-2xl font-bold tracking-tight text-ink';

  return (
    <View className="flex-row items-center gap-3" accessibilityRole="header" accessibilityLabel="DocuDash">
      <Image
        source={logoSource}
        resizeMode="contain"
        style={{ width: iconSize, height: iconSize, borderRadius }}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <View>
        <Text className={titleClass}>DocuDash</Text>
        {showTagline ? (
          <Text className="text-xs font-medium uppercase tracking-widest text-ink-subtle">
            Barangay Document Services
          </Text>
        ) : null}
      </View>
    </View>
  );
}
