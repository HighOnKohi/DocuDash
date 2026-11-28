import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState, type ComponentProps } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { DeleteAccountModal } from '@/components/DeleteAccountModal';
import { PermissionsPromptModal } from '@/components/PermissionsPromptModal';
import { PrivacyPolicyModal } from '@/components/PrivacyPolicyModal';
import { Banner } from '@/components/StateView';
import { TermsModal } from '@/components/TermsModal';
import { TextField } from '@/components/TextField';
import { formatDateTime } from '@/constants/format';
import type { ThemePreference } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getPermissionEnableSteps } from '@/services/permissionService';
import { toServiceError } from '@/services/supabase';

type MaterialIconName = ComponentProps<typeof MaterialIcons>['name'];

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: MaterialIconName }[] = [
  { value: 'light', label: 'Light', icon: 'light-mode' },
  { value: 'dark', label: 'Dark', icon: 'dark-mode' },
  { value: 'system', label: 'System', icon: 'settings-brightness' },
];

export default function ResidentProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, profile, updateProfile, signOut, deleteAccount } = useAuth();
  const {
    isSupported: notificationsSupported,
    permissionStatus,
    enabled: notificationsEnabled,
    busy: notificationsBusy,
    enableNotifications,
    disableNotifications,
    sendTestAlert,
  } = useNotifications();
  const { preference, setPreference, colors } = useTheme();

  const [fullNameDraft, setFullNameDraft] = useState<string | null>(null);
  const [contactNumberDraft, setContactNumberDraft] = useState<string | null>(null);
  const [addressDraft, setAddressDraft] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [termsVisible, setTermsVisible] = useState(false);
  const [privacyVisible, setPrivacyVisible] = useState(false);
  const [permissionsModalVisible, setPermissionsModalVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [notificationNotice, setNotificationNotice] = useState<{
    tone: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(
    null
  );

  const notificationsActive =
    notificationsSupported && notificationsEnabled && permissionStatus === 'granted';
  const notifGuide = getPermissionEnableSteps('notifications');

  const fullName = fullNameDraft ?? profile?.full_name ?? '';
  const contactNumber = contactNumberDraft ?? profile?.contact_number ?? '';
  const address = addressDraft ?? profile?.address ?? '';

  const hasChanges =
    profile != null &&
    (fullName.trim() !== profile.full_name ||
      contactNumber.trim() !== profile.contact_number ||
      address.trim() !== profile.address);

  async function handleSave() {
    setFeedback(null);
    setSaving(true);
    try {
      await updateProfile({
        full_name: fullName,
        contact_number: contactNumber,
        address,
      });
      setFullNameDraft(null);
      setContactNumberDraft(null);
      setAddressDraft(null);
      setFeedback({ tone: 'success', message: 'Your profile details have been updated.' });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: toServiceError(error, 'Unable to update your profile.').message,
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    setFeedback(null);
    setSigningOut(true);
    try {
      await signOut();
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: toServiceError(error, 'Unable to sign out.').message,
      });
      setSigningOut(false);
    }
  }

  async function handleToggleNotifications() {
    setNotificationNotice(null);
    if (notificationsActive) {
      await disableNotifications();
      setNotificationNotice({
        tone: 'warning',
        message: 'Device alerts paused. You can re-enable them anytime.',
      });
      return;
    }

    const status = await enableNotifications();
    if (status === 'granted') {
      setNotificationNotice({
        tone: 'success',
        message: 'Mobile alerts enabled for request updates and pickup reminders.',
      });
    } else if (status === 'denied') {
      setNotificationNotice({
        tone: 'error',
        message:
          'Notification permission is blocked in your device settings. Open settings to allow DocuDash alerts.',
      });
    }
  }

  async function handleSendTestNotification() {
    setNotificationNotice(null);
    const sent = await sendTestAlert();
    if (sent) {
      setNotificationNotice({
        tone: 'success',
        message: 'Test alert triggered! Check your device notification shade.',
      });
    } else {
      setNotificationNotice({
        tone: 'error',
        message:
          'Allow notifications in your device settings to receive mobile alerts and pickup reminders.',
      });
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
          paddingTop: insets.top + 20,
          paddingBottom: insets.bottom + 36,
          paddingHorizontal: 20,
        }}
      >
        <View className="mx-auto w-full max-w-3xl gap-6">
          <View className="gap-1">
            <Text className="text-2xl font-bold text-ink">Profile &amp; Settings</Text>
            <Text className="text-sm text-ink-muted">
              Manage your contact details, appearance, and RA 10173 data privacy settings.
            </Text>
          </View>

          {/* Identity summary */}
          <Card>
            <View className="flex-row items-center gap-4">
              <View className="h-14 w-14 items-center justify-center rounded-full bg-primary-50">
                <MaterialIcons name="person" size={28} color={colors.primary} />
              </View>
              <View className="flex-1 gap-0.5">
                <Text className="text-lg font-bold text-ink">
                  {profile?.full_name ?? 'Resident'}
                </Text>
                <Text className="text-sm text-ink-muted">{user?.email ?? '—'}</Text>
                <Text className="text-xs text-ink-subtle">
                  Role: Resident · Member since {formatDateTime(profile?.created_at)}
                </Text>
              </View>
            </View>
          </Card>

          {feedback ? <Banner tone={feedback.tone} message={feedback.message} /> : null}

          {/* Contact details form */}
          <Card
            title="Contact Information"
            subtitle="Keep your address and mobile number current for barangay verification."
          >
            <View className="gap-4">
              <TextField
                label="Full name"
                value={fullName}
                onChangeText={setFullNameDraft}
                maxLength={120}
                editable={!saving}
                required
              />
              <TextField
                label="Contact number"
                value={contactNumber}
                onChangeText={setContactNumberDraft}
                keyboardType="phone-pad"
                helperText="Philippine mobile or landline number (e.g. 09171234567)."
                editable={!saving}
                required
              />
              <TextField
                label="Barangay address"
                value={address}
                onChangeText={setAddressDraft}
                multiline
                numberOfLines={3}
                maxLength={300}
                editable={!saving}
                required
              />

              <View className="flex-row flex-wrap gap-2.5 pt-1">
                <Button
                  label="Save Changes"
                  icon="save"
                  onPress={() => void handleSave()}
                  loading={saving}
                  disabled={!hasChanges}
                />
                {hasChanges ? (
                  <Button
                    label="Reset"
                    variant="outline"
                    disabled={saving}
                    onPress={() => {
                      setFullNameDraft(null);
                      setContactNumberDraft(null);
                      setAddressDraft(null);
                      setFeedback(null);
                    }}
                  />
                ) : null}
              </View>
            </View>
          </Card>

          {/* Appearance & Settings */}
          <Card
            title="Appearance & Settings"
            subtitle="Switch between light and dark mode or review portal terms."
          >
            <View className="gap-4">
              <View className="flex-row gap-2">
                {THEME_OPTIONS.map((option) => {
                  const active = preference === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => setPreference(option.value)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`Use ${option.label} theme`}
                      className={`flex-1 items-center gap-1.5 rounded-xl border py-3 ${
                        active
                          ? 'border-primary bg-primary-50'
                          : 'border-border bg-surface-muted'
                      }`}
                    >
                      <MaterialIcons
                        name={option.icon}
                        size={20}
                        color={active ? colors.primary : colors.inkMuted}
                      />
                      <Text
                        className={`text-xs font-semibold ${
                          active ? 'text-primary' : 'text-ink-muted'
                        }`}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View className="flex-row flex-wrap gap-2.5">
                <Button
                  label="View Privacy Policy"
                  variant="outline"
                  size="sm"
                  icon="privacy-tip"
                  onPress={() => setPrivacyVisible(true)}
                />
                <Button
                  label="View Terms & Conditions"
                  variant="outline"
                  size="sm"
                  icon="gavel"
                  onPress={() => setTermsVisible(true)}
                />
              </View>
            </View>
          </Card>

          {/* Mobile notifications */}
          <Card
            title="Mobile Notifications"
            subtitle="Receive status updates and pickup slot reminders on this device."
          >
            <View className="gap-3">
              {notificationNotice ? (
                <Banner tone={notificationNotice.tone} message={notificationNotice.message} />
              ) : null}

              {notificationsSupported ? (
                <>
                  <View className="flex-row items-center justify-between rounded-xl border border-border bg-surface-muted px-4 py-3">
                    <View className="flex-1 flex-row items-center gap-3 pr-2">
                      <MaterialIcons
                        name={notificationsActive ? 'notifications-active' : 'notifications-off'}
                        size={20}
                        color={notificationsActive ? colors.primary : colors.inkSubtle}
                      />
                      <View className="flex-1">
                        <Text className="text-sm font-semibold text-ink">
                          {notificationsActive
                            ? 'Device Alerts Enabled'
                            : permissionStatus === 'denied'
                              ? 'Blocked in Device Settings'
                              : 'Device Alerts Paused'}
                        </Text>
                        <Text className="text-xs text-ink-subtle">
                          Triggers local alerts when status changes and reminds you before pickup.
                        </Text>
                      </View>
                    </View>
                  </View>

                  {permissionStatus === 'denied' && notifGuide.steps.length > 0 ? (
                    <View className="gap-1.5 rounded-xl border border-border bg-surface-muted p-3.5">
                      <Text className="text-xs font-bold text-ink">{notifGuide.heading}</Text>
                      {notifGuide.steps.map((step, index) => (
                        <Text key={step} className="text-xs leading-4 text-ink-muted">
                          {index + 1}. {step}
                        </Text>
                      ))}
                      {notifGuide.note ? (
                        <Text className="mt-1 text-[11px] leading-4 text-ink-subtle">
                          {notifGuide.note}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}

                  <View className="flex-row flex-wrap gap-2.5">
                    {permissionStatus === 'denied' ? (
                      <Button
                        label="Open Device Settings"
                        variant="outline"
                        size="sm"
                        icon="open-in-new"
                        onPress={() => void Linking.openSettings()}
                      />
                    ) : (
                      <Button
                        label={notificationsActive ? 'Pause Alerts' : 'Enable Alerts'}
                        variant={notificationsActive ? 'outline' : 'primary'}
                        size="sm"
                        icon={notificationsActive ? 'notifications-off' : 'notifications'}
                        loading={notificationsBusy}
                        onPress={() => void handleToggleNotifications()}
                      />
                    )}
                    <Button
                      label="Send Test Alert"
                      variant="outline"
                      size="sm"
                      icon="notifications"
                      loading={notificationsBusy}
                      onPress={() => void handleSendTestNotification()}
                    />
                    <Button
                      label="Permissions Guide"
                      variant="outline"
                      size="sm"
                      icon="help-outline"
                      onPress={() => setPermissionsModalVisible(true)}
                    />
                  </View>
                </>
              ) : (
                <View className="flex-row items-start gap-2.5 rounded-xl border border-border bg-surface-muted p-3.5">
                  <MaterialIcons
                    name="notifications-none"
                    size={18}
                    color={colors.primary}
                    style={{ marginTop: 2 }}
                  />
                  <Text className="flex-1 text-xs leading-5 text-ink-muted">
                    Email alerts and real-time in-app updates are active in your browser. Device
                    push banners and pickup reminders run on the Android &amp; iOS mobile app.
                  </Text>
                </View>
              )}
            </View>
          </Card>

          {/* RA 10173 Data Privacy section */}
          <Card
            title="Data Privacy & Retention (RA 10173)"
            subtitle="How DocuDash protects your personal information."
          >
            <View className="gap-3">
              <View className="flex-row items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 dark:border-emerald-800 dark:bg-emerald-950/50">
                <MaterialIcons name="verified-user" size={20} color={colors.success} />
                <View className="flex-1">
                  <Text className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                    Consent Recorded
                  </Text>
                  <Text className="text-xs text-emerald-800 dark:text-emerald-300">
                    Explicit RA 10173 consent timestamped on{' '}
                    {formatDateTime(profile?.privacy_consent_at)}.
                  </Text>
                </View>
              </View>

              <View className="gap-2">
                <View className="flex-row items-start gap-2">
                  <MaterialIcons
                    name="lock"
                    size={16}
                    color={colors.primary}
                    style={{ marginTop: 2 }}
                  />
                  <Text className="flex-1 text-xs leading-5 text-ink-muted">
                    <Text className="font-semibold text-ink">Private storage &amp; timed links:</Text>{' '}
                    Your uploaded IDs are never public. Staff view them only through temporary
                    60-second signed links logged to the audit trail.
                  </Text>
                </View>
                <View className="flex-row items-start gap-2">
                  <MaterialIcons
                    name="auto-delete"
                    size={16}
                    color={colors.primary}
                    style={{ marginTop: 2 }}
                  />
                  <Text className="flex-1 text-xs leading-5 text-ink-muted">
                    <Text className="font-semibold text-ink">30-day retention policy:</Text>{' '}
                    Uploaded requirement files are automatically queued for deletion 30 days after
                    a request is completed or rejected.
                  </Text>
                </View>
                <View className="flex-row items-start gap-2">
                  <MaterialIcons
                    name="gavel"
                    size={16}
                    color={colors.primary}
                    style={{ marginTop: 2 }}
                  />
                  <Text className="flex-1 text-xs leading-5 text-ink-muted">
                    <Text className="font-semibold text-ink">Your rights:</Text> Under Republic Act
                    No. 10173, you may request access, correction, or erasure of your account data
                    using the Delete Account option below or through the Barangay Office Data
                    Protection Officer.
                  </Text>
                </View>
              </View>
            </View>
          </Card>

          {/* Sign out */}
          <Card title="Session">
            <Button
              label="Sign Out"
              variant="outline"
              icon="logout"
              loading={signingOut}
              onPress={() => void handleSignOut()}
              fullWidth
            />
          </Card>

          {/* Delete Account (RA 10173 Right to Erasure) */}
          <Card
            title="Delete Account"
            subtitle="Permanently erase your DocuDash profile, requests, and uploaded IDs."
          >
            <View className="gap-3">
              <Text className="text-xs leading-5 text-ink-muted">
                Removing your account permanently deletes all personal details, submitted document
                requests, QR pickup passes, and uploaded ID files, and releases any reserved
                pickup slots.
              </Text>
              <Button
                label="Delete My Account"
                variant="danger"
                icon="delete-forever"
                onPress={() => setDeleteModalVisible(true)}
                fullWidth
              />
            </View>
          </Card>
        </View>
      </ScrollView>

      <PermissionsPromptModal
        visible={permissionsModalVisible}
        onClose={() => setPermissionsModalVisible(false)}
      />
      <PrivacyPolicyModal visible={privacyVisible} onClose={() => setPrivacyVisible(false)} />
      <TermsModal visible={termsVisible} onClose={() => setTermsVisible(false)} />
      <DeleteAccountModal
        visible={deleteModalVisible}
        onClose={() => setDeleteModalVisible(false)}
        onConfirmDelete={async (confirmation) => {
          await deleteAccount(confirmation);
        }}
      />
    </KeyboardAvoidingView>
  );
}
