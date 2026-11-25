import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/BrandMark';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Banner } from '@/components/StateView';
import { useAuth } from '@/contexts/AuthContext';
import { toServiceError } from '@/services/supabase';

/**
 * Phase 4 placeholder for authenticated `staff` / `admin` accounts. Replaced
 * with the full Barangay Staff Web Portal (queue overview, requirement viewer,
 * schedules, QR scanner) in Phase 5.
 */
export default function AdminPlaceholderScreen() {
  const insets = useSafeAreaInsets();
  const { profile, user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignOut() {
    setSigningOut(true);
    setError(null);
    try {
      await signOut();
    } catch (err) {
      setError(toServiceError(err, 'Unable to sign out.').message);
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <ScrollView
      className="flex-1 bg-surface-muted"
      contentContainerStyle={{
        flexGrow: 1,
        paddingTop: insets.top + 32,
        paddingBottom: insets.bottom + 32,
        paddingHorizontal: 20,
        justifyContent: 'center',
      }}
    >
      <View className="mx-auto w-full max-w-lg gap-6">
        <BrandMark />
        <Card
          title="Barangay Staff Portal"
          subtitle={`Signed in as ${profile?.full_name ?? user?.email ?? 'Staff'} (${profile?.role ?? 'staff'})`}
        >
          <View className="gap-4">
            {error ? <Banner tone="error" message={error} /> : null}
            <Banner
              tone="info"
              title="Staff portal ready for Phase 5"
              message="Role-based routing is active and verified. The staff review queue, 60-second signed ID viewer, schedule manager, and QR verification scanner will be added in Phase 5."
            />
            <Text className="text-sm text-ink-muted">
              To test the resident workflow, sign out and log in with a resident account.
            </Text>
            <Button
              label="Sign Out"
              variant="outline"
              icon="logout"
              onPress={handleSignOut}
              loading={signingOut}
              fullWidth
            />
          </View>
        </Card>
      </View>
    </ScrollView>
  );
}
