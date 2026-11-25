import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Text, View } from 'react-native';

import { colors } from '@/constants/theme';

export interface BrandMarkProps {
  /** Show the "Barangay Document Services" tagline under the wordmark. */
  showTagline?: boolean;
}

/** DocuDash logo lockup: icon tile plus wordmark. */
export function BrandMark({ showTagline = true }: BrandMarkProps) {
  return (
    <View className="flex-row items-center gap-3" accessibilityRole="header" accessibilityLabel="DocuDash">
      <View className="h-12 w-12 items-center justify-center rounded-xl bg-primary">
        <MaterialIcons name="description" size={28} color={colors.surface} accessibilityElementsHidden importantForAccessibility="no" />
      </View>
      <View>
        <Text className="text-2xl font-bold tracking-tight text-ink">DocuDash</Text>
        {showTagline ? (
          <Text className="text-xs font-medium uppercase tracking-widest text-ink-subtle">Barangay Document Services</Text>
        ) : null}
      </View>
    </View>
  );
}
