import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import logoSource from '@/assets/images/logo.png';
import { SettingsButton } from '@/components/SettingsModal';
import { Banner } from '@/components/StateView';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
  establishPasswordRecoverySession,
  parseRecoveryUrlParams,
  updateAccountPassword,
} from '@/services/authService';
import { toServiceError } from '@/services/supabase';

type RecoveryStage = 'verifying' | 'ready' | 'invalid' | 'success';

/**
 * Password reset landing screen opened from Supabase recovery email links
 * (`/reset-password?token_hash=...&type=recovery` or `#access_token=...`).
 */
export default function ResetPasswordScreen() {
  const insets = useSafeAreaInsets();
  const routeParams = useLocalSearchParams<{
    token_hash?: string;
    code?: string;
    type?: string;
    error_description?: string;
  }>();
  const { markPasswordRecovery, clearPasswordRecovery, signOut } = useAuth();
  const { colors } = useTheme();

  const [stage, setStage] = useState<RecoveryStage>('verifying');
  const [stageError, setStageError] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newHidden, setNewHidden] = useState(true);
  const [confirmHidden, setConfirmHidden] = useState(true);
  const [focusedField, setFocusedField] = useState<'new' | 'confirm' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const urlParams = parseRecoveryUrlParams();
    const tokenHash =
      (typeof routeParams.token_hash === 'string' && routeParams.token_hash) ||
      urlParams.tokenHash;
    const code =
      (typeof routeParams.code === 'string' && routeParams.code) || urlParams.code;
    const errorDescription =
      (typeof routeParams.error_description === 'string' && routeParams.error_description) ||
      urlParams.errorDescription;

    void establishPasswordRecoverySession({
      tokenHash,
      code,
      errorDescription,
    })
      .then(() => {
        if (!active) return;
        markPasswordRecovery();
        if (Platform.OS === 'web' && typeof window !== 'undefined' && window.history?.replaceState) {
          window.history.replaceState({}, '', '/reset-password');
        }
        setStage('ready');
      })
      .catch((error) => {
        if (!active) return;
        setStageError(
          toServiceError(
            error,
            'This password reset link is invalid or has expired. Please request a new reset email.'
          ).message
        );
        setStage('invalid');
      });

    return () => {
      active = false;
    };
  }, [
    markPasswordRecovery,
    routeParams.code,
    routeParams.error_description,
    routeParams.token_hash,
  ]);

  const canSubmit = Boolean(newPassword && confirmPassword && !submitting);

  async function handleUpdatePassword() {
    setFormError(null);

    if (newPassword.length < 8) {
      setFormError('Password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setFormError('Passwords do not match. Please re-enter them.');
      return;
    }

    setSubmitting(true);
    try {
      await updateAccountPassword(newPassword);
      clearPasswordRecovery();
      await signOut().catch(() => {});
      setStage('success');
    } catch (error) {
      setFormError(toServiceError(error, 'Unable to update your password.').message);
    } finally {
      setSubmitting(false);
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
          {/* Top bar */}
          <View className="flex-row items-center justify-between">
            <Pressable
              onPress={() => {
                clearPasswordRecovery();
                router.replace('/(auth)/login');
              }}
              accessibilityRole="button"
              accessibilityLabel="Back to sign in"
              hitSlop={8}
              className="flex-row items-center gap-1 py-1"
            >
              <MaterialIcons name="arrow-back" size={22} color={colors.ink} />
              <Text className="text-sm font-semibold text-ink">Sign In</Text>
            </Pressable>
            <SettingsButton compact />
          </View>

          {stage === 'verifying' ? (
            <View className="my-auto items-center gap-4 py-12">
              <Image
                source={logoSource}
                resizeMode="contain"
                style={{ width: 64, height: 64, borderRadius: 16 }}
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
              <ActivityIndicator size="large" color={colors.primary} />
              <Text className="text-center text-base font-semibold text-ink">
                Verifying your reset link...
              </Text>
              <Text className="max-w-xs text-center text-xs leading-5 text-ink-muted">
                Please wait a moment while we confirm your password recovery request.
              </Text>
            </View>
          ) : stage === 'invalid' ? (
            <View className="my-auto gap-6 py-8">
              <View className="items-center gap-3">
                <View className="h-16 w-16 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/60">
                  <MaterialIcons name="link-off" size={32} color={colors.danger} />
                </View>
                <Text className="text-center text-2xl font-bold text-ink">
                  Reset link expired
                </Text>
                <Text className="max-w-xs text-center text-sm leading-5 text-ink-muted">
                  Password reset links can only be used once and expire after a short period for
                  your security.
                </Text>
              </View>

              {stageError ? <Banner tone="error" message={stageError} /> : null}

              <Pressable
                onPress={() => {
                  clearPasswordRecovery();
                  router.replace('/(auth)/login');
                }}
                accessibilityRole="button"
                accessibilityLabel="Return to Sign In"
                className="min-h-[54px] w-full flex-row items-center justify-center rounded-full bg-primary px-6"
                style={({ pressed }) => (pressed ? { opacity: 0.9 } : undefined)}
              >
                <Text className="text-base font-bold text-white">Request New Reset Link</Text>
              </Pressable>
            </View>
          ) : stage === 'success' ? (
            <View className="my-auto gap-6 py-8">
              <View className="items-center gap-3">
                <View className="h-16 w-16 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/60">
                  <MaterialIcons name="check-circle" size={34} color={colors.success} />
                </View>
                <Text className="text-center text-2xl font-bold text-ink">Password updated</Text>
                <Text className="max-w-xs text-center text-sm leading-5 text-ink-muted">
                  Your DocuDash password has been changed. Sign in with your new password to
                  continue.
                </Text>
              </View>

              <Pressable
                onPress={() => {
                  clearPasswordRecovery();
                  router.replace('/(auth)/login');
                }}
                accessibilityRole="button"
                accessibilityLabel="Continue to Sign In"
                className="min-h-[54px] w-full flex-row items-center justify-center rounded-full bg-primary px-6"
                style={({ pressed }) => (pressed ? { opacity: 0.9 } : undefined)}
              >
                <Text className="text-base font-bold text-white">Continue to Sign In</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View className="gap-7 pt-6">
                <View className="items-center gap-3">
                  <Image
                    source={logoSource}
                    resizeMode="contain"
                    style={{ width: 64, height: 64, borderRadius: 16 }}
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                  />
                  <View className="items-center gap-1">
                    <Text className="text-center text-2xl font-bold tracking-tight text-ink">
                      Set a new password
                    </Text>
                    <Text className="text-center text-sm text-ink-muted">
                      Choose a strong password of at least 8 characters.
                    </Text>
                  </View>
                </View>

                {formError ? <Banner tone="error" message={formError} /> : null}

                <View className="gap-3.5">
                  <View
                    className={`flex-row items-center rounded-2xl border bg-surface-input px-4 py-3 ${
                      focusedField === 'new' ? 'border-primary' : 'border-transparent'
                    } ${submitting ? 'opacity-70' : ''}`}
                  >
                    <View className="flex-1">
                      <Text className="text-xs font-semibold text-primary">New password</Text>
                      <TextInput
                        value={newPassword}
                        onChangeText={setNewPassword}
                        placeholder="At least 8 characters"
                        placeholderTextColor={colors.inkSubtle}
                        secureTextEntry={newHidden}
                        autoCapitalize="none"
                        autoComplete="new-password"
                        editable={!submitting}
                        onFocus={() => setFocusedField('new')}
                        onBlur={() => setFocusedField(null)}
                        className="mt-1 min-h-[28px] p-0 text-base font-medium text-ink"
                        accessibilityLabel="New password"
                      />
                    </View>
                    <Pressable
                      onPress={() => setNewHidden((prev) => !prev)}
                      accessibilityRole="button"
                      accessibilityLabel={newHidden ? 'Show password' : 'Hide password'}
                      hitSlop={10}
                      className="ml-2 p-1"
                    >
                      <MaterialIcons
                        name={newHidden ? 'visibility-off' : 'visibility'}
                        size={22}
                        color={colors.inkMuted}
                      />
                    </Pressable>
                  </View>

                  <View
                    className={`flex-row items-center rounded-2xl border bg-surface-input px-4 py-3 ${
                      focusedField === 'confirm' ? 'border-primary' : 'border-transparent'
                    } ${submitting ? 'opacity-70' : ''}`}
                  >
                    <View className="flex-1">
                      <Text className="text-xs font-semibold text-primary">
                        Confirm new password
                      </Text>
                      <TextInput
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        placeholder="Re-enter your new password"
                        placeholderTextColor={colors.inkSubtle}
                        secureTextEntry={confirmHidden}
                        autoCapitalize="none"
                        autoComplete="new-password"
                        editable={!submitting}
                        onFocus={() => setFocusedField('confirm')}
                        onBlur={() => setFocusedField(null)}
                        onSubmitEditing={() => void handleUpdatePassword()}
                        returnKeyType="done"
                        className="mt-1 min-h-[28px] p-0 text-base font-medium text-ink"
                        accessibilityLabel="Confirm new password"
                      />
                    </View>
                    <Pressable
                      onPress={() => setConfirmHidden((prev) => !prev)}
                      accessibilityRole="button"
                      accessibilityLabel={confirmHidden ? 'Show password' : 'Hide password'}
                      hitSlop={10}
                      className="ml-2 p-1"
                    >
                      <MaterialIcons
                        name={confirmHidden ? 'visibility-off' : 'visibility'}
                        size={22}
                        color={colors.inkMuted}
                      />
                    </Pressable>
                  </View>
                </View>
              </View>

              <View className="gap-3 pt-6">
                <Pressable
                  onPress={() => void handleUpdatePassword()}
                  disabled={!canSubmit}
                  accessibilityRole="button"
                  accessibilityLabel="Update Password"
                  accessibilityState={{ disabled: !canSubmit, busy: submitting }}
                  className={`min-h-[54px] w-full flex-row items-center justify-center gap-2 rounded-full bg-primary px-6 ${
                    !canSubmit && !submitting ? 'opacity-45' : ''
                  }`}
                  style={({ pressed }) => (pressed && canSubmit ? { opacity: 0.9 } : undefined)}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text className="text-base font-bold text-white">Update Password</Text>
                  )}
                </Pressable>
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
