import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState, type ComponentProps } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Banner } from '@/components/StateView';
import { TermsModal } from '@/components/TermsModal';
import { TextField } from '@/components/TextField';
import { formatDateTime } from '@/constants/format';
import type { ThemePreference } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { toServiceError } from '@/services/supabase';

type MaterialIconName = ComponentProps<typeof MaterialIcons>['name'];

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: MaterialIconName }[] = [
  { value: 'light', label: 'Light', icon: 'light-mode' },
  { value: 'dark', label: 'Dark', icon: 'dark-mode' },
  { value: 'system', label: 'System', icon: 'settings-brightness' },
];

export default function ResidentProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, profile, updateProfile, signOut } = useAuth();
  const { preference, setPreference, colors } = useTheme();

  const [fullNameDraft, setFullNameDraft] = useState<string | null>(null);
  const [contactNumberDraft, setContactNumberDraft] = useState<string | null>(null);
  const [addressDraft, setAddressDraft] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [termsVisible, setTermsVisible] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(
    null
  );

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

              <Button
                label="View Terms & Conditions"
                variant="outline"
                size="sm"
                icon="gavel"
                onPress={() => setTermsVisible(true)}
              />
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
                    through the Barangay Office Data Protection Officer.
                  </Text>
                </View>
              </View>
            </View>
          </Card>

          {/* Sign out */}
          <Card title="Session">
            <Button
              label="Sign Out"
              variant="danger"
              icon="logout"
              loading={signingOut}
              onPress={() => void handleSignOut()}
              fullWidth
            />
          </Card>
        </View>
      </ScrollView>

      <TermsModal visible={termsVisible} onClose={() => setTermsVisible(false)} />
    </KeyboardAvoidingView>
  );
}
