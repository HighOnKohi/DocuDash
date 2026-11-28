import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useState } from 'react';
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
import {
  PhilippineBarangayPicker,
  type SelectedBarangayLocation,
} from '@/components/PhilippineBarangayPicker';
import { SettingsButton } from '@/components/SettingsModal';
import { Banner } from '@/components/StateView';
import { useTheme } from '@/contexts/ThemeContext';
import { submitBarangayAdminRequest } from '@/services/barangayService';
import { toServiceError } from '@/services/supabase';

/**
 * Public Barangay Admin onboarding request form. Submits to
 * `POST /api/request-barangay-admin`, which emails `docudash.app@gmail.com`.
 */
export default function BarangayAdminRequestScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const [manualBarangayMode, setManualBarangayMode] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<SelectedBarangayLocation>({
    region: null,
    province: null,
    city: null,
    barangay: null,
  });
  const [manualBarangayName, setManualBarangayName] = useState('');
  const [manualCity, setManualCity] = useState('');
  const [manualProvince, setManualProvince] = useState('');

  const [hallAddress, setHallAddress] = useState('');
  const [googleMapsUrl, setGoogleMapsUrl] = useState('');
  const [applicantName, setApplicantName] = useState('');
  const [applicantPosition, setApplicantPosition] = useState('Barangay Secretary');
  const [applicantEmail, setApplicantEmail] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submittedResult, setSubmittedResult] = useState<{
    barangayLabel: string;
    emailedTo: string;
    deliveredVia: 'email' | 'recorded_only';
  } | null>(null);

  async function handleSubmit() {
    setErrorMessage(null);

    const barangayName = manualBarangayMode
      ? manualBarangayName.trim()
      : (selectedLocation.barangay?.name ?? '');
    const cityMunicipality = manualBarangayMode
      ? manualCity.trim()
      : (selectedLocation.city?.name ?? '');
    const province = manualBarangayMode
      ? manualProvince.trim()
      : (selectedLocation.province?.name ?? '');
    const region = manualBarangayMode ? '' : (selectedLocation.region?.name ?? '');

    if (barangayName.length < 2 || cityMunicipality.length < 2) {
      setErrorMessage('Please select (or enter) your Barangay and City / Municipality.');
      return;
    }
    if (hallAddress.trim().length < 5) {
      setErrorMessage('Please enter the Barangay Hall street address.');
      return;
    }
    if (applicantName.trim().length < 2) {
      setErrorMessage('Please enter your full name.');
      return;
    }
    if (applicantPosition.trim().length < 2) {
      setErrorMessage('Please enter your official barangay position.');
      return;
    }
    if (!applicantEmail.trim()) {
      setErrorMessage('Please enter your official email address.');
      return;
    }
    if (!contactNumber.trim()) {
      setErrorMessage('Please enter a contact number.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await submitBarangayAdminRequest({
        psgcCode: manualBarangayMode ? null : (selectedLocation.barangay?.code ?? null),
        barangayName,
        cityMunicipality,
        province,
        region,
        hallAddress: hallAddress.trim(),
        googleMapsUrl: googleMapsUrl.trim() || null,
        applicantName: applicantName.trim(),
        applicantPosition: applicantPosition.trim(),
        applicantEmail: applicantEmail.trim(),
        contactNumber: contactNumber.trim(),
        notes: notes.trim() || null,
      });

      setSubmittedResult({
        barangayLabel: `${barangayName}, ${cityMunicipality}`,
        emailedTo: response.emailedTo,
        deliveredVia: response.deliveredVia,
      });
    } catch (error) {
      setErrorMessage(
        toServiceError(error, 'Unable to send barangay admin request. Please try again.').message
      );
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
          paddingBottom: insets.bottom + 32,
          paddingHorizontal: 24,
        }}
      >
        <View className="mx-auto w-full max-w-md flex-1 gap-6">
          <View className="flex-row items-center justify-between">
            <Pressable
              onPress={() => {
                if (router.canGoBack()) router.back();
                else router.replace('/(auth)');
              }}
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={8}
              className="flex-row items-center gap-1 py-1"
            >
              <MaterialIcons name="arrow-back" size={22} color={colors.ink} />
              <Text className="text-sm font-semibold text-ink">Back</Text>
            </Pressable>
            <SettingsButton compact />
          </View>

          {submittedResult ? (
            <View className="my-auto gap-5 py-6">
              <View className="items-center gap-3">
                <View className="h-16 w-16 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/60">
                  <MaterialIcons name="mark-email-read" size={32} color={colors.success} />
                </View>
                <Text className="text-center text-2xl font-bold text-ink">
                  Admin request submitted
                </Text>
                <Text className="text-center text-sm leading-5 text-ink-muted">
                  Your onboarding request for{' '}
                  <Text className="font-semibold text-ink">{submittedResult.barangayLabel}</Text>{' '}
                  {submittedResult.deliveredVia === 'email'
                    ? `has been emailed to ${submittedResult.emailedTo}.`
                    : `has been logged for review by ${submittedResult.emailedTo}.`}
                </Text>
              </View>

              <Banner
                tone="info"
                title="What happens next"
                message="Our team verifies barangay official requests and replies to your email once your Barangay Admin access is provisioned."
              />

              <Pressable
                onPress={() => router.replace('/(auth)/login')}
                accessibilityRole="button"
                className="min-h-[54px] w-full flex-row items-center justify-center rounded-full bg-primary px-6"
              >
                <Text className="text-base font-bold text-white">Return to Sign In</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View className="items-center gap-2.5 pt-2">
                <Image
                  source={logoSource}
                  resizeMode="contain"
                  style={{ width: 60, height: 60, borderRadius: 14 }}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
                <Text className="text-center text-2xl font-bold tracking-tight text-ink">
                  Request Barangay Admin
                </Text>
                <Text className="max-w-sm text-center text-sm leading-5 text-ink-muted">
                  Register your Barangay Office with DocuDash. Applications are sent directly to{' '}
                  <Text className="font-semibold text-ink">docudash.app@gmail.com</Text>.
                </Text>
              </View>

              {errorMessage ? <Banner tone="error" message={errorMessage} /> : null}

              {/* 1. Barangay Details */}
              <View className="gap-3">
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs font-bold uppercase tracking-wider text-ink-subtle">
                    1. Barangay Office
                  </Text>
                  <Pressable
                    onPress={() => {
                      setManualBarangayMode((prev) => !prev);
                      setErrorMessage(null);
                    }}
                    hitSlop={8}
                  >
                    <Text className="text-xs font-semibold text-primary underline">
                      {manualBarangayMode ? 'Use PH dropdowns' : 'Enter manually'}
                    </Text>
                  </Pressable>
                </View>

                {manualBarangayMode ? (
                  <View className="gap-3">
                    <View className="rounded-2xl bg-surface-input px-4 py-3">
                      <Text className="text-xs font-semibold text-primary">Barangay Name</Text>
                      <TextInput
                        value={manualBarangayName}
                        onChangeText={setManualBarangayName}
                        placeholder="e.g. Barangay San Isidro"
                        placeholderTextColor={colors.inkSubtle}
                        editable={!submitting}
                        className="mt-1 min-h-[26px] p-0 text-base font-medium text-ink"
                      />
                    </View>
                    <View className="rounded-2xl bg-surface-input px-4 py-3">
                      <Text className="text-xs font-semibold text-primary">
                        City / Municipality
                      </Text>
                      <TextInput
                        value={manualCity}
                        onChangeText={setManualCity}
                        placeholder="e.g. Quezon City"
                        placeholderTextColor={colors.inkSubtle}
                        editable={!submitting}
                        className="mt-1 min-h-[26px] p-0 text-base font-medium text-ink"
                      />
                    </View>
                    <View className="rounded-2xl bg-surface-input px-4 py-3">
                      <Text className="text-xs font-semibold text-primary">
                        Province (optional for NCR)
                      </Text>
                      <TextInput
                        value={manualProvince}
                        onChangeText={setManualProvince}
                        placeholder="e.g. Laguna"
                        placeholderTextColor={colors.inkSubtle}
                        editable={!submitting}
                        className="mt-1 min-h-[26px] p-0 text-base font-medium text-ink"
                      />
                    </View>
                  </View>
                ) : (
                  <PhilippineBarangayPicker
                    disabled={submitting}
                    onChange={setSelectedLocation}
                  />
                )}

                <View className="rounded-2xl bg-surface-input px-4 py-3">
                  <Text className="text-xs font-semibold text-primary">Barangay Hall Address</Text>
                  <TextInput
                    value={hallAddress}
                    onChangeText={setHallAddress}
                    placeholder="Street, building, or landmark of the Barangay Hall"
                    placeholderTextColor={colors.inkSubtle}
                    maxLength={300}
                    editable={!submitting}
                    className="mt-1 min-h-[26px] p-0 text-base font-medium text-ink"
                  />
                </View>

                <View className="rounded-2xl bg-surface-input px-4 py-3">
                  <Text className="text-xs font-semibold text-primary">
                    Google Maps Link (optional)
                  </Text>
                  <TextInput
                    value={googleMapsUrl}
                    onChangeText={setGoogleMapsUrl}
                    placeholder="https://maps.google.com/..."
                    placeholderTextColor={colors.inkSubtle}
                    autoCapitalize="none"
                    keyboardType="url"
                    maxLength={500}
                    editable={!submitting}
                    className="mt-1 min-h-[26px] p-0 text-base font-medium text-ink"
                  />
                </View>
              </View>

              {/* 2. Official Details */}
              <View className="gap-3">
                <Text className="text-xs font-bold uppercase tracking-wider text-ink-subtle">
                  2. Barangay Official / Contact
                </Text>

                <View className="rounded-2xl bg-surface-input px-4 py-3">
                  <Text className="text-xs font-semibold text-primary">Official Full Name</Text>
                  <TextInput
                    value={applicantName}
                    onChangeText={setApplicantName}
                    placeholder="Juan Dela Cruz"
                    placeholderTextColor={colors.inkSubtle}
                    autoCapitalize="words"
                    editable={!submitting}
                    className="mt-1 min-h-[26px] p-0 text-base font-medium text-ink"
                  />
                </View>

                <View className="rounded-2xl bg-surface-input px-4 py-3">
                  <Text className="text-xs font-semibold text-primary">Position / Role</Text>
                  <TextInput
                    value={applicantPosition}
                    onChangeText={setApplicantPosition}
                    placeholder="e.g. Punong Barangay, Barangay Secretary, Kagawad"
                    placeholderTextColor={colors.inkSubtle}
                    editable={!submitting}
                    className="mt-1 min-h-[26px] p-0 text-base font-medium text-ink"
                  />
                </View>

                <View className="rounded-2xl bg-surface-input px-4 py-3">
                  <Text className="text-xs font-semibold text-primary">Email Address</Text>
                  <TextInput
                    value={applicantEmail}
                    onChangeText={setApplicantEmail}
                    placeholder="official@barangay.gov.ph"
                    placeholderTextColor={colors.inkSubtle}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    editable={!submitting}
                    className="mt-1 min-h-[26px] p-0 text-base font-medium text-ink"
                  />
                </View>

                <View className="rounded-2xl bg-surface-input px-4 py-3">
                  <Text className="text-xs font-semibold text-primary">Contact Number</Text>
                  <TextInput
                    value={contactNumber}
                    onChangeText={setContactNumber}
                    placeholder="09171234567"
                    placeholderTextColor={colors.inkSubtle}
                    keyboardType="phone-pad"
                    editable={!submitting}
                    className="mt-1 min-h-[26px] p-0 text-base font-medium text-ink"
                  />
                </View>

                <View className="rounded-2xl bg-surface-input px-4 py-3">
                  <Text className="text-xs font-semibold text-primary">
                    Additional Notes (optional)
                  </Text>
                  <TextInput
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Number of staff accounts needed or verification notes"
                    placeholderTextColor={colors.inkSubtle}
                    multiline
                    numberOfLines={3}
                    maxLength={800}
                    editable={!submitting}
                    className="mt-1 min-h-[54px] p-0 text-sm font-medium text-ink"
                  />
                </View>
              </View>

              <Pressable
                onPress={() => void handleSubmit()}
                disabled={submitting}
                accessibilityRole="button"
                accessibilityLabel="Submit Barangay Admin Request"
                className={`min-h-[54px] w-full flex-row items-center justify-center gap-2 rounded-full bg-primary px-6 ${
                  submitting ? 'opacity-70' : ''
                }`}
                style={({ pressed }) => (pressed && !submitting ? { opacity: 0.9 } : undefined)}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text className="text-base font-bold text-white">Send Admin Request</Text>
                )}
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
