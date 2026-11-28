import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import logoSource from '@/assets/images/logo.png';
import { Button } from '@/components/Button';
import { SettingsButton } from '@/components/SettingsModal';
import { Banner } from '@/components/StateView';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { sendPasswordReset } from '@/services/authService';
import { toServiceError } from '@/services/supabase';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { signIn, configError } = useAuth();
  const { colors, themeVars } = useTheme();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordHidden, setPasswordHidden] = useState(true);
  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [resetVisible, setResetVisible] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSending, setResetSending] = useState(false);
  const [resetFeedback, setResetFeedback] = useState<{
    tone: 'success' | 'error';
    message: string;
  } | null>(null);

  const canSubmit = Boolean(email.trim() && password && !configError && !submitting);

  async function handleSubmit() {
    setErrorMessage(null);

    if (!email.trim() || !password) {
      setErrorMessage('Please enter both your email address and password.');
      return;
    }

    setSubmitting(true);
    try {
      await signIn({ email, password });
      // Root layout's Stack.Protected redirects automatically based on profile.role.
    } catch (error) {
      setErrorMessage(
        toServiceError(error, 'Unable to sign in. Please check your credentials.').message
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenResetModal() {
    setResetEmail(email.trim());
    setResetFeedback(null);
    setResetVisible(true);
  }

  async function handleSendReset() {
    setResetFeedback(null);
    if (!resetEmail.trim()) {
      setResetFeedback({ tone: 'error', message: 'Please enter your account email address.' });
      return;
    }

    setResetSending(true);
    try {
      await sendPasswordReset(resetEmail);
      setResetFeedback({
        tone: 'success',
        message: `If an account exists for ${resetEmail.trim().toLowerCase()}, a password reset link has been sent.`,
      });
    } catch (error) {
      setResetFeedback({
        tone: 'error',
        message: toServiceError(error, 'Unable to send password reset email.').message,
      });
    } finally {
      setResetSending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-surface"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + 14,
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 24,
        }}
      >
        <View className="mx-auto w-full max-w-md flex-1 justify-between">
          {/* Minimal top bar */}
          <View className="flex-row items-center justify-between">
            <Pressable
              onPress={() => router.replace('/(auth)')}
              accessibilityRole="button"
              accessibilityLabel="Back to home"
              hitSlop={8}
              className="flex-row items-center gap-1.5 rounded-full py-1.5 pr-2"
            >
              <MaterialIcons name="arrow-back" size={20} color={colors.inkMuted} />
              <Text className="text-sm font-medium text-ink-muted">Back</Text>
            </Pressable>

            <SettingsButton compact />
          </View>

          {/* Main centered content */}
          <View className="my-auto gap-7 py-8">
            {/* Centered Brand Identity */}
            <View className="items-center gap-3">
              <Image
                source={logoSource}
                resizeMode="contain"
                style={{ width: 64, height: 64, borderRadius: 16 }}
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
              <View className="items-center gap-0.5">
                <Text className="text-3xl font-extrabold tracking-tight text-ink">DocuDash</Text>
                <Text className="text-xs font-medium uppercase tracking-widest text-ink-subtle">
                  Barangay Document Services
                </Text>
              </View>
            </View>

            {configError ? <Banner tone="warning" message={configError} /> : null}
            {errorMessage ? <Banner tone="error" message={errorMessage} /> : null}

            {/* Cardless soft-filled banking inputs */}
            <View className="gap-3.5">
              <View
                className={`rounded-2xl border bg-surface-input px-4 py-3 ${
                  focusedField === 'email' ? 'border-primary' : 'border-transparent'
                } ${submitting ? 'opacity-70' : ''}`}
              >
                <Text className="text-xs font-semibold text-primary">Email address</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Enter email address"
                  placeholderTextColor={colors.inkSubtle}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  editable={!submitting}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  returnKeyType="next"
                  className="mt-1 min-h-[28px] p-0 text-base font-medium text-ink"
                  accessibilityLabel="Email address"
                />
              </View>

              <View
                className={`flex-row items-center rounded-2xl border bg-surface-input px-4 py-3 ${
                  focusedField === 'password' ? 'border-primary' : 'border-transparent'
                } ${submitting ? 'opacity-70' : ''}`}
              >
                <View className="flex-1">
                  <Text className="text-xs font-semibold text-primary">Password</Text>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Enter password"
                    placeholderTextColor={colors.inkSubtle}
                    secureTextEntry={passwordHidden}
                    autoCapitalize="none"
                    autoComplete="current-password"
                    editable={!submitting}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField(null)}
                    onSubmitEditing={() => {
                      if (canSubmit) void handleSubmit();
                    }}
                    returnKeyType="go"
                    className="mt-1 min-h-[28px] p-0 text-base font-medium text-ink"
                    accessibilityLabel="Password"
                  />
                </View>

                <Pressable
                  onPress={() => setPasswordHidden((prev) => !prev)}
                  accessibilityRole="button"
                  accessibilityLabel={passwordHidden ? 'Show password' : 'Hide password'}
                  hitSlop={10}
                  className="ml-2 p-1"
                >
                  <MaterialIcons
                    name={passwordHidden ? 'visibility-off' : 'visibility'}
                    size={22}
                    color={colors.inkMuted}
                  />
                </Pressable>
              </View>

              <Pressable
                onPress={handleOpenResetModal}
                accessibilityRole="button"
                accessibilityLabel="Forgot your password"
                hitSlop={8}
                className="self-center py-1"
              >
                <Text className="text-sm font-semibold text-primary">Forgot your password?</Text>
              </Pressable>
            </View>
          </View>

          {/* Bottom-anchored CTA */}
          <View className="gap-4 pt-4">
            <View className="flex-row items-center justify-center gap-1.5">
              <Text className="text-sm text-ink-muted">New resident?</Text>
              <Link href="/(auth)/register" asChild>
                <Pressable hitSlop={8}>
                  <Text className="text-sm font-semibold text-primary">Create an account</Text>
                </Pressable>
              </Link>
            </View>

            <Pressable
              onPress={() => void handleSubmit()}
              disabled={!canSubmit}
              accessibilityRole="button"
              accessibilityLabel="Sign In"
              accessibilityState={{ disabled: !canSubmit, busy: submitting }}
              className={`min-h-[54px] w-full flex-row items-center justify-center gap-2 rounded-full bg-primary px-6 ${
                !canSubmit && !submitting ? 'opacity-45' : ''
              }`}
              style={({ pressed }) => (pressed && canSubmit ? { opacity: 0.9 } : undefined)}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text className="text-base font-bold text-white">Sign In</Text>
              )}
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {/* Forgot Password Modal */}
      <Modal
        visible={resetVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setResetVisible(false)}
      >
        <View
          style={themeVars}
          className="flex-1 items-center justify-center bg-black/60 px-4 py-6"
        >
          <View className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-xl">
            <View className="mb-4 flex-row items-center justify-between">
              <View className="gap-0.5">
                <Text className="text-lg font-bold text-ink">Reset your password</Text>
                <Text className="text-xs text-ink-muted">
                  We&apos;ll send a reset link to your registered email.
                </Text>
              </View>
              <Pressable
                onPress={() => setResetVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Close password reset"
                hitSlop={8}
                className="rounded-full p-1"
              >
                <MaterialIcons name="close" size={20} color={colors.inkMuted} />
              </Pressable>
            </View>

            <View className="gap-4">
              {resetFeedback ? (
                <Banner tone={resetFeedback.tone} message={resetFeedback.message} />
              ) : null}

              <View className="rounded-2xl border border-border-strong bg-surface-input px-4 py-3">
                <Text className="text-xs font-semibold text-primary">Email address</Text>
                <TextInput
                  value={resetEmail}
                  onChangeText={setResetEmail}
                  placeholder="Enter your email address"
                  placeholderTextColor={colors.inkSubtle}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  editable={!resetSending}
                  className="mt-1 min-h-[28px] p-0 text-base font-medium text-ink"
                  accessibilityLabel="Reset email address"
                />
              </View>

              <View className="flex-row items-center justify-end gap-2.5">
                <Button
                  label="Cancel"
                  variant="outline"
                  size="sm"
                  disabled={resetSending}
                  onPress={() => setResetVisible(false)}
                />
                <Button
                  label="Send Reset Link"
                  variant="primary"
                  size="sm"
                  loading={resetSending}
                  onPress={() => void handleSendReset()}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
