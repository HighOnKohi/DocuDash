import { Stack } from 'expo-router';

import { colors } from '@/constants/theme';

export const unstable_settings = {
  anchor: '(tabs)',
};

/**
 * Resident stack navigator wrapping the bottom tab bar (`(tabs)`) and pushed
 * detail screens (`request/[id]`). Keeping `request/[id]` on the Stack instead
 * of as a hidden tab avoids Expo Router SDK 58's automatic redirect for hidden
 * tab routes (`href: null`) and provides proper back-stack navigation.
 */
export default function ResidentStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.surfaceMuted },
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="request/[id]" />
    </Stack>
  );
}
