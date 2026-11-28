import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';

import { useTheme } from '@/contexts/ThemeContext';
import { toServiceError } from '@/services/supabase';

import { Button } from './Button';
import { Banner } from './StateView';

export interface DeleteAccountModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirmDelete: (confirmation: string) => Promise<void>;
}

const DELETED_ITEMS: string[] = [
  'Your DocuDash resident profile and login credentials',
  'All submitted document requests and issued QR pickup passes',
  'All uploaded requirement IDs and files from private storage',
  'Any active pickup slot reservations (returned to barangay capacity)',
];

/**
 * High-friction confirmation modal for permanent self-service resident account
 * erasure (`POST /api/delete-account`).
 */
export function DeleteAccountModal({
  visible,
  onClose,
  onConfirmDelete,
}: DeleteAccountModalProps) {
  const { colors, themeVars } = useTheme();
  const [confirmationText, setConfirmationText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isConfirmed = confirmationText.trim() === 'DELETE';

  function handleClose() {
    if (submitting) return;
    setConfirmationText('');
    setErrorMessage(null);
    onClose();
  }

  async function handleConfirm() {
    if (!isConfirmed || submitting) return;
    setErrorMessage(null);
    setSubmitting(true);
    try {
      await onConfirmDelete(confirmationText.trim());
      setConfirmationText('');
      onClose();
    } catch (error) {
      setErrorMessage(
        toServiceError(error, 'Unable to delete your account right now. Please try again.').message
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View
        style={themeVars}
        className="flex-1 items-center justify-center bg-black/65 px-4 py-6"
      >
        <View className="w-full max-w-md overflow-hidden rounded-2xl border border-red-200 bg-surface shadow-xl dark:border-red-900">
          <View className="flex-row items-center justify-between border-b border-border px-5 py-4">
            <View className="flex-row items-center gap-2.5">
              <View className="h-9 w-9 items-center justify-center rounded-lg bg-red-50 dark:bg-red-950/60">
                <MaterialIcons name="delete-forever" size={20} color={colors.danger} />
              </View>
              <View>
                <Text className="text-base font-bold text-ink">Delete Account</Text>
                <Text className="text-xs text-ink-subtle">This action cannot be undone</Text>
              </View>
            </View>
            <Pressable
              onPress={handleClose}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityLabel="Close delete account dialog"
              hitSlop={8}
              className="rounded-full p-1.5"
            >
              <MaterialIcons name="close" size={20} color={colors.inkMuted} />
            </Pressable>
          </View>

          <View className="gap-4 p-5">
            {errorMessage ? <Banner tone="error" message={errorMessage} /> : null}

            <Text className="text-xs leading-5 text-ink-muted">
              Deleting your account permanently removes the following records from DocuDash:
            </Text>

            <View className="gap-1.5 rounded-xl border border-border bg-surface-muted p-3.5">
              {DELETED_ITEMS.map((item) => (
                <View key={item} className="flex-row items-start gap-2">
                  <MaterialIcons
                    name="remove-circle-outline"
                    size={15}
                    color={colors.danger}
                    style={{ marginTop: 2 }}
                  />
                  <Text className="flex-1 text-xs leading-4 text-ink">{item}</Text>
                </View>
              ))}
            </View>

            <Text className="text-[11px] leading-4 text-ink-subtle">
              Note: De-identified, PII-free administrative audit counts are retained as required by
              barangay record-keeping rules.
            </Text>

            <View className="gap-1.5">
              <Text className="text-xs font-semibold text-ink">
                Type <Text className="font-extrabold text-red-600 dark:text-red-400">DELETE</Text> to
                confirm
              </Text>
              <TextInput
                value={confirmationText}
                onChangeText={setConfirmationText}
                placeholder="Type DELETE"
                placeholderTextColor={colors.inkSubtle}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!submitting}
                className="min-h-[44px] rounded-xl border border-border-strong bg-surface-input px-3.5 py-2.5 text-sm font-semibold text-ink"
                accessibilityLabel="Type DELETE to confirm permanent account deletion"
              />
            </View>

            <View className="flex-row items-center justify-end gap-2.5 pt-1">
              <Button
                label="Cancel"
                variant="outline"
                size="sm"
                onPress={handleClose}
                disabled={submitting}
              />
              <Button
                label="Permanently Delete Account"
                variant="danger"
                size="sm"
                icon="delete-forever"
                loading={submitting}
                disabled={!isConfirmed}
                onPress={() => void handleConfirm()}
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
