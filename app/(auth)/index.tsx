import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import logoSource from '@/assets/images/logo.png';
import { PrivacyPolicyModal } from '@/components/PrivacyPolicyModal';
import { SettingsButton } from '@/components/SettingsModal';
import { Banner } from '@/components/StateView';
import { TermsModal } from '@/components/TermsModal';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';

type MaterialIconName = ComponentProps<typeof MaterialIcons>['name'];

const HIGHLIGHTS: { icon: MaterialIconName; label: string }[] = [
  { icon: 'post-add', label: 'Request Online' },
  { icon: 'event-available', label: 'Book a Slot' },
  { icon: 'qr-code-2', label: 'QR Pickup' },
];

/**
 * Clean, banking-app style public entry screen shown to unauthenticated
 * visitors at `/` (inside `(auth)` so redirects between `(auth)`, `(resident)`,
 * and `(admin)` never collide on `/`).
 */
export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { configError } = useAuth();
  const { colors } = useTheme();
  const [privacyVisible, setPrivacyVisible] = useState(false);
  const [termsVisible, setTermsVisible] = useState(false);

  return (
    <ScrollView
      className="flex-1 bg-surface"
      contentContainerStyle={{
        flexGrow: 1,
        paddingTop: insets.top + 14,
        paddingBottom: insets.bottom + 24,
        paddingHorizontal: 24,
      }}
    >
      <View className="mx-auto w-full max-w-md flex-1 justify-between">
        {/* Minimal top bar */}
        <View className="flex-row items-center justify-end">
          <SettingsButton compact />
        </View>

        {/* Centered hero */}
        <View className="my-auto items-center gap-6 py-8">
          <Image
            source={logoSource}
            resizeMode="contain"
            style={{ width: 80, height: 80, borderRadius: 20 }}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />

          <View className="items-center gap-2">
            <Text className="text-center text-3xl font-extrabold tracking-tight text-ink">
              DocuDash
            </Text>
            <Text className="max-w-xs text-center text-base leading-6 text-ink-muted">
              Barangay documents, without the long queue.
            </Text>
          </View>

          <View className="flex-row flex-wrap items-center justify-center gap-2">
            {HIGHLIGHTS.map((item) => (
              <View
                key={item.label}
                className="flex-row items-center gap-1.5 rounded-full bg-surface-input px-3.5 py-2"
              >
                <MaterialIcons
                  name={item.icon}
                  size={16}
                  color={colors.primary}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
                <Text className="text-xs font-semibold text-ink">{item.label}</Text>
              </View>
            ))}
          </View>

          {configError ? (
            <View className="w-full">
              <Banner tone="warning" title="Configuration needed" message={configError} />
            </View>
          ) : null}
        </View>

        {/* Bottom-anchored CTA zone */}
        <View className="gap-3 pt-4">
          <Pressable
            onPress={() => router.push('/(auth)/login')}
            accessibilityRole="button"
            accessibilityLabel="Sign In"
            className="min-h-[54px] w-full flex-row items-center justify-center rounded-full bg-primary px-6"
            style={({ pressed }) => (pressed ? { opacity: 0.9 } : undefined)}
          >
            <Text className="text-base font-bold text-white">Sign In</Text>
          </Pressable>

          <Pressable
            onPress={() => router.push('/(auth)/register')}
            accessibilityRole="button"
            accessibilityLabel="Create Resident Account"
            className="min-h-[54px] w-full flex-row items-center justify-center rounded-full border border-border-strong bg-surface-input px-6"
            style={({ pressed }) => (pressed ? { opacity: 0.85 } : undefined)}
          >
            <Text className="text-base font-semibold text-ink">Create Resident Account</Text>
          </Pressable>

          <Text className="pt-2 text-center text-[11px] leading-4 text-ink-subtle">
            Protected under RA 10173 · Uploaded IDs are purged after 30 days.
          </Text>
          <View className="flex-row items-center justify-center gap-2 pb-1">
            <Pressable
              onPress={() => setPrivacyVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="View Privacy Policy"
              hitSlop={6}
            >
              <Text className="text-xs font-semibold text-primary underline">Privacy Policy</Text>
            </Pressable>
            <Text className="text-xs text-ink-subtle">·</Text>
            <Pressable
              onPress={() => setTermsVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="View Terms and Conditions"
              hitSlop={6}
            >
              <Text className="text-xs font-semibold text-primary underline">
                Terms &amp; Conditions
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      <PrivacyPolicyModal visible={privacyVisible} onClose={() => setPrivacyVisible(false)} />
      <TermsModal visible={termsVisible} onClose={() => setTermsVisible(false)} />
    </ScrollView>
  );
}
