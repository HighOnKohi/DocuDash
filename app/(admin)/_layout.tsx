import { Stack } from 'expo-router';

import { colors } from '@/constants/theme';

/**
 * Staff/admin group layout placeholder. Full desktop sidebar portal is built in
 * Phase 5; this ensures staff/admin users land safely when role-redirected in
 * Phase 4.
 */
export default function AdminLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.surfaceMuted },
      }}
    />
  );
}
