import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/BrandMark';
import { FeatureCard, type FeatureCardProps } from '@/components/FeatureCard';

const FEATURES: FeatureCardProps[] = [
  {
    icon: 'post-add',
    title: 'Request online',
    description: 'Choose a barangay document, state your purpose, and upload valid requirements from your phone.',
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
 * Public landing screen. In Phase 4 the root layout's auth guard redirects
 * signed-in users to their role-specific area before this screen is shown.
 */
export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      className="flex-1 bg-surface-muted"
      contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 }}
    >
      <View className="mx-auto w-full max-w-5xl gap-10 px-5 lg:px-10">
        <BrandMark />

        <View className="gap-3">
          <Text className="text-3xl font-bold leading-tight text-ink lg:text-5xl">
            Barangay documents, without the long queue.
          </Text>
          <Text className="max-w-2xl text-base leading-6 text-ink-muted lg:text-lg">
            DocuDash lets residents submit document requests ahead of time and pick them up on a scheduled slot, while
            barangay staff review requirements and verify releases from one secure portal.
          </Text>
        </View>

        <View className="gap-4 lg:flex-row lg:flex-wrap">
          {FEATURES.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </View>

        <View className="rounded-card border border-border bg-surface p-5">
          <Text className="text-sm leading-5 text-ink-muted">
            Personal information collected by DocuDash is processed in accordance with the Data Privacy Act of 2012
            (Republic Act No. 10173).
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}
