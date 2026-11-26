import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/BrandMark';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Banner } from '@/components/StateView';
import { TextField } from '@/components/TextField';
import { colors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { toServiceError } from '@/services/supabase';

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const { signUp, configError } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [privacyConsentAccepted, setPrivacyConsentAccepted] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);

  async function handleSubmit() {
    setErrorMessage(null);

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    if (!privacyConsentAccepted) {
      setErrorMessage(
        'You must agree to the Data Privacy Act (RA 10173) consent notice to register.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const result = await signUp({
        email,
        password,
        fullName,
        address,
        contactNumber,
        privacyConsentAccepted,
      });

      if (result.needsEmailConfirmation) {
        setConfirmationEmail(email.trim().toLowerCase());
      }
      // If email confirmation is disabled, AuthContext updates session/profile and
      // Stack.Protected routes directly to the resident dashboard.
    } catch (error) {
      setErrorMessage(toServiceError(error, 'Unable to complete registration.').message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-surface-muted"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + 20,
          paddingBottom: insets.bottom + 36,
          paddingHorizontal: 20,
        }}
      >
        <View className="mx-auto w-full max-w-lg gap-6">
          <Pressable
            onPress={() => router.replace('/(auth)')}
            accessibilityRole="button"
            accessibilityLabel="Back to home"
            className="flex-row items-center gap-1.5 self-start py-1"
          >
            <MaterialIcons name="arrow-back" size={18} color={colors.inkMuted} />
            <Text className="text-sm font-medium text-ink-muted">Back to overview</Text>
          </Pressable>

          <BrandMark />

          {configError ? <Banner tone="warning" message={configError} /> : null}

          {confirmationEmail ? (
            <Card
              title="Verify your email address"
              subtitle="One quick step before submitting document requests."
            >
              <View className="gap-4">
                <Banner
                  tone="success"
                  message={`We sent a verification link to ${confirmationEmail}. Confirm your email, then sign in to your resident account.`}
                />
                <Button
                  label="Go to Sign In"
                  icon="login"
                  onPress={() => router.replace('/(auth)/login')}
                  fullWidth
                />
              </View>
            </Card>
          ) : (
            <Card
              title="Create a Resident Account"
              subtitle="Register once to request barangay clearances and book pickup slots."
            >
              <View className="gap-4">
                {errorMessage ? <Banner tone="error" message={errorMessage} /> : null}

                <TextField
                  label="Full name"
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Juan Dela Cruz"
                  autoCapitalize="words"
                  autoComplete="name"
                  maxLength={120}
                  editable={!submitting}
                  required
                />

                <TextField
                  label="Email address"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="juan.delacruz@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  editable={!submitting}
                  required
                />

                <TextField
                  label="Contact number"
                  value={contactNumber}
                  onChangeText={setContactNumber}
                  placeholder="09171234567"
                  helperText="Philippine mobile or landline number (e.g. 09171234567 or +639171234567)."
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  editable={!submitting}
                  required
                />

                <TextField
                  label="Complete barangay address"
                  value={address}
                  onChangeText={setAddress}
                  placeholder="Block 4 Lot 12, Purok 3, Barangay..."
                  multiline
                  numberOfLines={3}
                  maxLength={300}
                  editable={!submitting}
                  required
                />

                <TextField
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="At least 8 characters"
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="new-password"
                  editable={!submitting}
                  required
                />

                <TextField
                  label="Confirm password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Re-enter your password"
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="new-password"
                  editable={!submitting}
                  required
                />

                {/* RA 10173 Explicit Consent Notice */}
                <View className="gap-3 rounded-lg border border-border bg-surface-muted p-4">
                  <View className="flex-row items-center gap-2">
                    <MaterialIcons name="verified-user" size={18} color={colors.primary} />
                    <Text className="text-sm font-bold text-ink">
                      Data Privacy Notice (RA 10173)
                    </Text>
                  </View>
                  <Text className="text-xs leading-5 text-ink-muted">
                    DocuDash collects your name, address, contact details, and uploaded
                    identification documents solely to process barangay document requests and
                    schedule counter pickups. Uploaded requirement files are stored privately and
                    automatically scheduled for deletion 30 days after request completion or
                    rejection.
                  </Text>

                  <Pressable
                    onPress={() => setPrivacyConsentAccepted((prev) => !prev)}
                    disabled={submitting}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: privacyConsentAccepted }}
                    accessibilityLabel="I consent to the processing of my personal data under RA 10173"
                    className="flex-row items-start gap-2.5 pt-1"
                  >
                    <MaterialIcons
                      name={privacyConsentAccepted ? 'check-box' : 'check-box-outline-blank'}
                      size={22}
                      color={privacyConsentAccepted ? colors.primary : colors.inkSubtle}
                    />
                    <Text className="flex-1 text-xs font-medium leading-5 text-ink">
                      I have read the notice above and give my explicit consent for the Barangay
                      Office to collect and process my personal data under the Data Privacy Act of
                      2012 (RA 10173).
                    </Text>
                  </Pressable>
                </View>

                <View className="pt-1">
                  <Button
                    label="Create Account"
                    icon="person-add"
                    onPress={handleSubmit}
                    loading={submitting}
                    disabled={Boolean(configError)}
                    fullWidth
                  />
                </View>
              </View>
            </Card>
          )}

          <View className="flex-row items-center justify-center gap-1.5">
            <Text className="text-sm text-ink-muted">Already have an account?</Text>
            <Link href="/(auth)/login" asChild>
              <Pressable hitSlop={8}>
                <Text className="text-sm font-semibold text-primary">Sign in</Text>
              </Pressable>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
