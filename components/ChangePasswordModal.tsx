import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { useTheme } from '@/contexts/ThemeContext';
import { changeAuthenticatedPassword } from '@/services/authService';
import { toServiceError } from '@/services/supabase';

import { Button } from './Button';
import { Banner } from './StateView';

export interface ChangePasswordModalProps {
  visible: boolean;
  onClose: () => void;
  isTemporaryPassword?: boolean;
  onSuccess?: () => void;
}

/**
 * Themed modal allowing signed-in Barangay Admins and residents to change
 * their password (verifying their current or temporary password first).
 */
export function ChangePasswordModal({
  visible,
  onClose,
  isTemporaryPassword = false,
  onSuccess,
}: ChangePasswordModalProps) {
  const { colors, themeVars } = useTheme();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [hideCurrent, setHideCurrent] = useState(true);
  const [hideNew, setHideNew] = useState(true);
  const [hideConfirm, setHideConfirm] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(
    null
  );

  function resetFields() {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setFeedback(null);
  }

  function handleClose() {
    if (saving) return;
    resetFields();
    onClose();
  }

  async function handleSubmit() {
    setFeedback(null);
    if (!currentPassword) {
      setFeedback({
        tone: 'error',
        message: 'Enter your current or temporary password.',
      });
      return;
    }
    if (newPassword.length < 8) {
      setFeedback({
        tone: 'error',
        message: 'New password must be at least 8 characters long.',
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setFeedback({
        tone: 'error',
        message: 'New password and confirmation do not match.',
      });
      return;
    }

    setSaving(true);
    try {
      await changeAuthenticatedPassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onSuccess?.();
      setFeedback({
        tone: 'success',
        message: 'Your password has been updated.',
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: toServiceError(error, 'Unable to change password.').message,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View
        style={themeVars}
        className="flex-1 items-center justify-center bg-black/60 px-4 py-6"
      >
        <View className="max-h-[90%] w-full max-w-md overflow-hidden rounded-2xl border border-border bg-surface shadow-xl">
          <View className="flex-row items-center justify-between border-b border-border px-5 py-4">
            <View className="flex-row items-center gap-2.5">
              <View className="h-9 w-9 items-center justify-center rounded-lg bg-primary-50">
                <MaterialIcons name="lock-reset" size={20} color={colors.primary} />
              </View>
              <View>
                <Text className="text-base font-bold text-ink">Change Password</Text>
                <Text className="text-xs text-ink-subtle">
                  {isTemporaryPassword
                    ? 'Replace your emailed temporary password'
                    : 'Update your account login password'}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={handleClose}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Close change password"
              hitSlop={8}
              className="rounded-full p-1.5"
            >
              <MaterialIcons name="close" size={20} color={colors.inkMuted} />
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
            <View className="gap-4 p-5">
              {isTemporaryPassword && feedback?.tone !== 'success' ? (
                <Banner
                  tone="warning"
                  message="Enter the temporary password sent to your email, then set a new private password."
                />
              ) : null}

              {feedback ? <Banner tone={feedback.tone} message={feedback.message} /> : null}

              <View className="flex-row items-center rounded-xl border border-border-strong bg-surface-input px-3.5 py-2.5">
                <View className="flex-1">
                  <Text className="text-xs font-semibold text-primary">
                    {isTemporaryPassword ? 'Temporary Password' : 'Current Password'}
                  </Text>
                  <TextInput
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                    placeholder="Enter current password"
                    placeholderTextColor={colors.inkSubtle}
                    secureTextEntry={hideCurrent}
                    autoCapitalize="none"
                    editable={!saving}
                    className="mt-1 min-h-[26px] p-0 text-sm font-medium text-ink"
                  />
                </View>
                <Pressable onPress={() => setHideCurrent((p) => !p)} hitSlop={8} className="p-1">
                  <MaterialIcons
                    name={hideCurrent ? 'visibility-off' : 'visibility'}
                    size={20}
                    color={colors.inkMuted}
                  />
                </Pressable>
              </View>

              <View className="flex-row items-center rounded-xl border border-border-strong bg-surface-input px-3.5 py-2.5">
                <View className="flex-1">
                  <Text className="text-xs font-semibold text-primary">
                    New Password (min. 8 characters)
                  </Text>
                  <TextInput
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="Enter new password"
                    placeholderTextColor={colors.inkSubtle}
                    secureTextEntry={hideNew}
                    autoCapitalize="none"
                    editable={!saving}
                    className="mt-1 min-h-[26px] p-0 text-sm font-medium text-ink"
                  />
                </View>
                <Pressable onPress={() => setHideNew((p) => !p)} hitSlop={8} className="p-1">
                  <MaterialIcons
                    name={hideNew ? 'visibility-off' : 'visibility'}
                    size={20}
                    color={colors.inkMuted}
                  />
                </Pressable>
              </View>

              <View className="flex-row items-center rounded-xl border border-border-strong bg-surface-input px-3.5 py-2.5">
                <View className="flex-1">
                  <Text className="text-xs font-semibold text-primary">Confirm New Password</Text>
                  <TextInput
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Re-enter new password"
                    placeholderTextColor={colors.inkSubtle}
                    secureTextEntry={hideConfirm}
                    autoCapitalize="none"
                    editable={!saving}
                    className="mt-1 min-h-[26px] p-0 text-sm font-medium text-ink"
                  />
                </View>
                <Pressable onPress={() => setHideConfirm((p) => !p)} hitSlop={8} className="p-1">
                  <MaterialIcons
                    name={hideConfirm ? 'visibility-off' : 'visibility'}
                    size={20}
                    color={colors.inkMuted}
                  />
                </Pressable>
              </View>

              <View className="flex-row justify-end gap-2.5 pt-1">
                <Button
                  label={feedback?.tone === 'success' ? 'Done' : 'Cancel'}
                  variant="outline"
                  size="sm"
                  disabled={saving}
                  onPress={handleClose}
                />
                {feedback?.tone !== 'success' ? (
                  <Button
                    label="Update Password"
                    variant="primary"
                    size="sm"
                    loading={saving}
                    onPress={() => void handleSubmit()}
                  />
                ) : null}
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
