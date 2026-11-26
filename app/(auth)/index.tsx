import { router } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/BrandMark';
import { Button } from '@/components/Button';
import { FeatureCard, type FeatureCardProps } from '@/components/FeatureCard';
import { Banner } from '@/components/StateView';
import { useAuth } from '@/contexts/AuthContext';

const FEATURES: FeatureCardProps[] = [
  {
    icon: 'post-add',
    title: 'Request online',
    description:
      'Choose a barangay document, state your purpose, and upload valid requirements from your phone.',
  },
  {
    icon: 'track-changes',
    title: 'Track in real time',
    description: 'Follow your request from pending to ready for pickup with live status updates.',
  },
  {
    icon: 'event-available',
    title: 'Book a pickup slot',
    description: 'Reserve a date and time window so you skip the line at the barangay hall.',
  },
  {
    icon: 'qr-code-2',
    title: 'Claim with a QR pass',
    description: 'Present your secure pickup pass at the counter for fast, verified release.',
  },
];

/**
 * Public landing screen shown to unauthenticated visitors at `/` (inside the
 * `(auth)` group so redirects between `(auth)`, `(resident)`, and `(admin)`
 * never collide on `/`). Signed-in residents and barangay staff are routed
 * straight to `(resident)` or `(admin)` by the root layout's `Stack.Protected`
 * guards.
 */
export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { configError } = useAuth();

  return (
    <ScrollView
      className="flex-1 bg-surface-muted"
      contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: insets.bottom + 36 }}
    >
      <View className="mx-auto w-full max-w-5xl gap-10 px-5 lg:px-10">
        <View className="flex-row flex-wrap items-center justify-between gap-4">
          <BrandMark />
          <View className="flex-row items-center gap-2.5">
            <Button
              label="Sign In"
              variant="outline"
              size="sm"
              onPress={() => router.push('/(auth)/login')}
            />
            <Button
              label="Register"
              variant="primary"
              size="sm"
              onPress={() => router.push('/(auth)/register')}
            />
          </View>
        </View>

        {configError ? <Banner tone="warning" title="Configuration needed" message={configError} /> : null}

        <View className="gap-5">
          <View className="gap-3">
            <Text className="text-3xl font-bold leading-tight text-ink lg:text-5xl">
              Barangay documents, without the long queue.
            </Text>
            <Text className="max-w-2xl text-base leading-6 text-ink-muted lg:text-lg">
              DocuDash lets residents submit document requests ahead of time and pick them up on a
              scheduled slot, while barangay staff review requirements and verify releases from one
              secure portal.
            </Text>
          </View>

          <View className="flex-row flex-wrap gap-3">
            <Button
              label="Create Resident Account"
              icon="person-add"
              onPress={() => router.push('/(auth)/register')}
            />
            <Button
              label="Sign In to Your Account"
              variant="outline"
              icon="login"
              onPress={() => router.push('/(auth)/login')}
            />
          </View>
        </View>

        <View className="gap-4 lg:flex-row lg:flex-wrap">
          {FEATURES.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </View>

        <View className="rounded-card border border-border bg-surface p-5">
          <Text className="text-sm leading-5 text-ink-muted">
            Personal information collected by DocuDash is processed in accordance with the Data
            Privacy Act of 2012 (Republic Act No. 10173). Uploaded IDs are stored privately and
            purged 30 days after request completion.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}
