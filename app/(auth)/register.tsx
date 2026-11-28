import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Link, router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { PrivacyPolicyModal } from '@/components/PrivacyPolicyModal';
import { SelectField, type SelectOption } from '@/components/SelectField';
import { SettingsButton } from '@/components/SettingsModal';
import { Banner } from '@/components/StateView';
import { TermsModal } from '@/components/TermsModal';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
  composePhilippineAddress,
  fetchBarangays,
  fetchCitiesByProvince,
  fetchCitiesByRegion,
  fetchProvinces,
  fetchRegions,
  type PhLocationOption,
} from '@/services/locationService';
import { toServiceError } from '@/services/supabase';

function toSelectOptions(items: PhLocationOption[]): SelectOption[] {
  return items.map((item) => ({
    value: item.code,
    label: item.name,
    subtitle: item.subtitle,
  }));
}

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const { signUp, configError } = useAuth();
  const { colors } = useTheme();

  // Personal details
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [contactNumber, setContactNumber] = useState('');

  // Philippine PSGC address state
  const [manualAddressMode, setManualAddressMode] = useState(false);
  const [manualAddress, setManualAddress] = useState('');
  const [streetAddress, setStreetAddress] = useState('');

  const [regions, setRegions] = useState<PhLocationOption[]>([]);
  const [regionsLoading, setRegionsLoading] = useState(true);
  const [regionsError, setRegionsError] = useState<string | null>(null);
  const [regionRetryKey, setRegionRetryKey] = useState(0);
  const [selectedRegion, setSelectedRegion] = useState<PhLocationOption | null>(null);

  const [provinces, setProvinces] = useState<PhLocationOption[]>([]);
  const [provincesLoading, setProvincesLoading] = useState(false);
  const [provincesError, setProvincesError] = useState<string | null>(null);
  const [provinceRetryKey, setProvinceRetryKey] = useState(0);
  const [selectedProvince, setSelectedProvince] = useState<PhLocationOption | null>(null);
  const [hasProvinces, setHasProvinces] = useState(true);

  const [cities, setCities] = useState<PhLocationOption[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [citiesError, setCitiesError] = useState<string | null>(null);
  const [cityRetryKey, setCityRetryKey] = useState(0);
  const [selectedCity, setSelectedCity] = useState<PhLocationOption | null>(null);

  const [barangays, setBarangays] = useState<PhLocationOption[]>([]);
  const [barangaysLoading, setBarangaysLoading] = useState(false);
  const [barangaysError, setBarangaysError] = useState<string | null>(null);
  const [barangayRetryKey, setBarangayRetryKey] = useState(0);
  const [selectedBarangay, setSelectedBarangay] = useState<PhLocationOption | null>(null);

  // Security & agreements
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordHidden, setPasswordHidden] = useState(true);
  const [confirmHidden, setConfirmHidden] = useState(true);
  const [privacyConsentAccepted, setPrivacyConsentAccepted] = useState(false);
  const [privacyModalVisible, setPrivacyModalVisible] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsModalVisible, setTermsModalVisible] = useState(false);

  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);

  // 1. Load Philippine regions on mount (or retry)
  useEffect(() => {
    let cancelled = false;

    void fetchRegions()
      .then((list) => {
        if (!cancelled) {
          setRegions(list);
          setRegionsLoading(false);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setRegionsError(
            error instanceof Error ? error.message : 'Unable to load Philippine regions.'
          );
          setRegionsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [regionRetryKey]);

  // 2. Load provinces when region changes (or cities directly if region has no provinces, e.g. NCR)
  useEffect(() => {
    if (!selectedRegion) {
      return;
    }

    let cancelled = false;

    void fetchProvinces(selectedRegion.code)
      .then(async (provList) => {
        if (cancelled) return;
        setProvinces(provList);
        setProvincesLoading(false);

        if (provList.length === 0) {
          setHasProvinces(false);
          setCitiesLoading(true);
          try {
            const regionCities = await fetchCitiesByRegion(selectedRegion.code);
            if (!cancelled) {
              setCities(regionCities);
              setCitiesLoading(false);
            }
          } catch (error) {
            if (!cancelled) {
              setCitiesError(
                error instanceof Error ? error.message : 'Unable to load cities/municipalities.'
              );
              setCitiesLoading(false);
            }
          }
        } else {
          setHasProvinces(true);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setProvincesError(
            error instanceof Error ? error.message : 'Unable to load provinces.'
          );
          setProvincesLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedRegion, provinceRetryKey]);

  // 3. Load cities/municipalities when province changes
  useEffect(() => {
    if (!selectedRegion || !hasProvinces || !selectedProvince) {
      return;
    }

    let cancelled = false;

    void fetchCitiesByProvince(selectedProvince.code)
      .then((list) => {
        if (!cancelled) {
          setCities(list);
          setCitiesLoading(false);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setCitiesError(
            error instanceof Error ? error.message : 'Unable to load cities/municipalities.'
          );
          setCitiesLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedRegion, selectedProvince, hasProvinces, cityRetryKey]);

  // 4. Retry loading cities directly when region has no provinces
  useEffect(() => {
    if (!selectedRegion || hasProvinces || cityRetryKey === 0) {
      return;
    }

    let cancelled = false;

    void fetchCitiesByRegion(selectedRegion.code)
      .then((list) => {
        if (!cancelled) {
          setCities(list);
          setCitiesLoading(false);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setCitiesError(
            error instanceof Error ? error.message : 'Unable to load cities/municipalities.'
          );
          setCitiesLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedRegion, hasProvinces, cityRetryKey]);

  // 5. Load barangays when city/municipality changes
  useEffect(() => {
    if (!selectedCity || !selectedRegion) {
      return;
    }

    let cancelled = false;

    void fetchBarangays(selectedCity.code, selectedRegion.code)
      .then((list) => {
        if (!cancelled) {
          setBarangays(list);
          setBarangaysLoading(false);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setBarangaysError(
            error instanceof Error ? error.message : 'Unable to load barangays.'
          );
          setBarangaysLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedCity, selectedRegion, barangayRetryKey]);

  const handleSelectRegion = useCallback((option: SelectOption) => {
    setSelectedRegion({ code: option.value, name: option.label });
    setSelectedProvince(null);
    setSelectedCity(null);
    setSelectedBarangay(null);
    setProvinces([]);
    setCities([]);
    setBarangays([]);
    setHasProvinces(true);
    setProvincesLoading(true);
    setCitiesLoading(false);
    setBarangaysLoading(false);
    setProvincesError(null);
    setCitiesError(null);
    setBarangaysError(null);
  }, []);

  const handleSelectProvince = useCallback((option: SelectOption) => {
    setSelectedProvince({ code: option.value, name: option.label });
    setSelectedCity(null);
    setSelectedBarangay(null);
    setCities([]);
    setBarangays([]);
    setCitiesLoading(true);
    setBarangaysLoading(false);
    setCitiesError(null);
    setBarangaysError(null);
  }, []);

  const handleSelectCity = useCallback((option: SelectOption) => {
    setSelectedCity({ code: option.value, name: option.label });
    setSelectedBarangay(null);
    setBarangays([]);
    setBarangaysLoading(true);
    setBarangaysError(null);
  }, []);

  const handleSelectBarangay = useCallback((option: SelectOption) => {
    setSelectedBarangay({
      code: option.value,
      name: option.label,
      subtitle: option.subtitle,
    });
  }, []);

  const handleRetryRegions = useCallback(() => {
    setRegionsLoading(true);
    setRegionsError(null);
    setRegionRetryKey((k) => k + 1);
  }, []);

  const handleRetryProvinces = useCallback(() => {
    setProvincesLoading(true);
    setProvincesError(null);
    setProvinceRetryKey((k) => k + 1);
  }, []);

  const handleRetryCities = useCallback(() => {
    setCitiesLoading(true);
    setCitiesError(null);
    setCityRetryKey((k) => k + 1);
  }, []);

  const handleRetryBarangays = useCallback(() => {
    setBarangaysLoading(true);
    setBarangaysError(null);
    setBarangayRetryKey((k) => k + 1);
  }, []);

  const regionOptions = useMemo(() => toSelectOptions(regions), [regions]);
  const provinceOptions = useMemo(() => toSelectOptions(provinces), [provinces]);
  const cityOptions = useMemo(() => toSelectOptions(cities), [cities]);
  const barangayOptions = useMemo(() => toSelectOptions(barangays), [barangays]);

  const composedAddressPreview = useMemo(() => {
    if (manualAddressMode || !selectedRegion) {
      return '';
    }
    return composePhilippineAddress({
      streetAddress,
      barangay: selectedBarangay?.name ?? '',
      city: selectedCity?.name ?? '',
      province: hasProvinces ? (selectedProvince?.name ?? '') : '',
      region: selectedRegion.name,
    });
  }, [
    manualAddressMode,
    streetAddress,
    selectedBarangay,
    selectedCity,
    selectedProvince,
    selectedRegion,
    hasProvinces,
  ]);

  async function handleSubmit() {
    setErrorMessage(null);

    if (fullName.trim().length < 2) {
      setErrorMessage('Please enter your full name (at least 2 characters).');
      return;
    }

    if (!email.trim()) {
      setErrorMessage('Please enter your email address.');
      return;
    }

    if (!contactNumber.trim()) {
      setErrorMessage('Please enter your Philippine mobile or landline number.');
      return;
    }

    let finalAddress = '';
    if (manualAddressMode) {
      finalAddress = manualAddress.trim();
      if (finalAddress.length < 5) {
        setErrorMessage('Please enter your complete barangay address (at least 5 characters).');
        return;
      }
    } else {
      if (!selectedRegion) {
        setErrorMessage('Please select your Region.');
        return;
      }
      if (hasProvinces && !selectedProvince) {
        setErrorMessage('Please select your Province.');
        return;
      }
      if (!selectedCity) {
        setErrorMessage('Please select your City or Municipality.');
        return;
      }
      if (!selectedBarangay) {
        setErrorMessage('Please select your Barangay.');
        return;
      }
      if (streetAddress.trim().length < 2) {
        setErrorMessage('Please enter your house/unit number, street, or purok.');
        return;
      }
      finalAddress = composePhilippineAddress({
        streetAddress,
        barangay: selectedBarangay.name,
        city: selectedCity.name,
        province: hasProvinces ? selectedProvince?.name : undefined,
        region: selectedRegion.name,
      });
    }

    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }

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

    if (!termsAccepted) {
      setErrorMessage('You must agree to the Terms & Conditions to register.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await signUp({
        email,
        password,
        fullName,
        address: finalAddress,
        contactNumber,
        barangayCode: manualAddressMode ? null : (selectedBarangay?.code ?? null),
        barangayName: manualAddressMode ? undefined : selectedBarangay?.name,
        cityMunicipality: manualAddressMode ? undefined : selectedCity?.name,
        province: manualAddressMode
          ? undefined
          : hasProvinces
            ? selectedProvince?.name
            : undefined,
        region: manualAddressMode ? undefined : selectedRegion?.name,
        privacyConsentAccepted,
        termsAccepted,
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
      className="flex-1 bg-surface"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + 14,
          paddingBottom: insets.bottom + 28,
          paddingHorizontal: 24,
        }}
      >
        <View className="mx-auto w-full max-w-md flex-1 justify-between gap-6">
          {/* Minimal top bar */}
          <View className="flex-row items-center justify-between gap-2">
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

          {confirmationEmail ? (
            <View className="my-auto items-center gap-5 py-8">
              <View className="h-16 w-16 items-center justify-center rounded-2xl bg-primary-50">
                <MaterialIcons name="mark-email-read" size={34} color={colors.primary} />
              </View>
              <View className="items-center gap-1.5">
                <Text className="text-center text-2xl font-extrabold text-ink">
                  Verify your email
                </Text>
                <Text className="text-center text-sm text-ink-muted">
                  One quick step before submitting document requests.
                </Text>
              </View>
              <View className="w-full">
                <Banner
                  tone="success"
                  message={`We sent a verification link to ${confirmationEmail}. Confirm your email, then sign in to your resident account.`}
                />
              </View>
              <Pressable
                onPress={() => router.replace('/(auth)/login')}
                accessibilityRole="button"
                accessibilityLabel="Go to Sign In"
                className="mt-2 min-h-[54px] w-full flex-row items-center justify-center rounded-full bg-primary px-6"
                style={({ pressed }) => (pressed ? { opacity: 0.9 } : undefined)}
              >
                <Text className="text-base font-bold text-white">Go to Sign In</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {/* Centered Brand Header */}
              <View className="items-center gap-2.5 pt-2">
                <Image
                  source={logoSource}
                  resizeMode="contain"
                  style={{ width: 56, height: 56, borderRadius: 14 }}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
                <View className="items-center gap-0.5">
                  <Text className="text-2xl font-extrabold tracking-tight text-ink">
                    Create Account
                  </Text>
                  <Text className="text-center text-sm text-ink-muted">
                    Register to request barangay documents online.
                  </Text>
                </View>
              </View>

              {configError ? <Banner tone="warning" message={configError} /> : null}
              {errorMessage ? <Banner tone="error" message={errorMessage} /> : null}

              {/* Form sections */}
              <View className="gap-6">
                {/* 1. Personal Details */}
                <View className="gap-3">
                  <Text className="text-xs font-bold uppercase tracking-wider text-ink-subtle">
                    Personal Details
                  </Text>

                  <View
                    className={`rounded-2xl border bg-surface-input px-4 py-3 ${
                      focusedField === 'fullName' ? 'border-primary' : 'border-transparent'
                    } ${submitting ? 'opacity-70' : ''}`}
                  >
                    <Text className="text-xs font-semibold text-primary">Full name</Text>
                    <TextInput
                      value={fullName}
                      onChangeText={setFullName}
                      placeholder="Juan Dela Cruz"
                      placeholderTextColor={colors.inkSubtle}
                      autoCapitalize="words"
                      autoComplete="name"
                      maxLength={120}
                      editable={!submitting}
                      onFocus={() => setFocusedField('fullName')}
                      onBlur={() => setFocusedField(null)}
                      className="mt-1 min-h-[26px] p-0 text-base font-medium text-ink"
                      accessibilityLabel="Full name"
                    />
                  </View>

                  <View
                    className={`rounded-2xl border bg-surface-input px-4 py-3 ${
                      focusedField === 'email' ? 'border-primary' : 'border-transparent'
                    } ${submitting ? 'opacity-70' : ''}`}
                  >
                    <Text className="text-xs font-semibold text-primary">Email address</Text>
                    <TextInput
                      value={email}
                      onChangeText={setEmail}
                      placeholder="juan.delacruz@example.com"
                      placeholderTextColor={colors.inkSubtle}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoComplete="email"
                      editable={!submitting}
                      onFocus={() => setFocusedField('email')}
                      onBlur={() => setFocusedField(null)}
                      className="mt-1 min-h-[26px] p-0 text-base font-medium text-ink"
                      accessibilityLabel="Email address"
                    />
                  </View>

                  <View className="gap-1">
                    <View
                      className={`rounded-2xl border bg-surface-input px-4 py-3 ${
                        focusedField === 'contact' ? 'border-primary' : 'border-transparent'
                      } ${submitting ? 'opacity-70' : ''}`}
                    >
                      <Text className="text-xs font-semibold text-primary">Contact number</Text>
                      <TextInput
                        value={contactNumber}
                        onChangeText={setContactNumber}
                        placeholder="09171234567"
                        placeholderTextColor={colors.inkSubtle}
                        keyboardType="phone-pad"
                        autoComplete="tel"
                        editable={!submitting}
                        onFocus={() => setFocusedField('contact')}
                        onBlur={() => setFocusedField(null)}
                        className="mt-1 min-h-[26px] p-0 text-base font-medium text-ink"
                        accessibilityLabel="Contact number"
                      />
                    </View>
                    <Text className="px-1 text-xs text-ink-subtle">
                      Philippine mobile or landline (e.g. 09171234567 or +639171234567)
                    </Text>
                  </View>
                </View>

                {/* 2. Philippine Address */}
                <View className="gap-3">
                  <View className="flex-row items-center justify-between gap-2">
                    <Text className="text-xs font-bold uppercase tracking-wider text-ink-subtle">
                      Philippine Address
                    </Text>
                    <Pressable
                      onPress={() => setManualAddressMode((prev) => !prev)}
                      hitSlop={6}
                      accessibilityRole="button"
                    >
                      <Text className="text-xs font-semibold text-primary">
                        {manualAddressMode
                          ? 'Use Philippines location selector'
                          : 'Enter address manually instead'}
                      </Text>
                    </Pressable>
                  </View>

                  {manualAddressMode ? (
                    <View
                      className={`rounded-2xl border bg-surface-input px-4 py-3 ${
                        focusedField === 'manualAddress' ? 'border-primary' : 'border-transparent'
                      } ${submitting ? 'opacity-70' : ''}`}
                    >
                      <Text className="text-xs font-semibold text-primary">
                        Complete barangay address
                      </Text>
                      <TextInput
                        value={manualAddress}
                        onChangeText={setManualAddress}
                        placeholder="Blk 4 Lot 12, Purok 3, Barangay, City, Province"
                        placeholderTextColor={colors.inkSubtle}
                        multiline
                        numberOfLines={3}
                        maxLength={300}
                        editable={!submitting}
                        onFocus={() => setFocusedField('manualAddress')}
                        onBlur={() => setFocusedField(null)}
                        textAlignVertical="top"
                        className="mt-1 min-h-[76px] p-0 text-base font-medium text-ink"
                        accessibilityLabel="Complete barangay address"
                      />
                    </View>
                  ) : (
                    <>
                      <SelectField
                        label="Region"
                        placeholder="Select Region"
                        value={selectedRegion?.code ?? null}
                        displayValue={selectedRegion?.name}
                        options={regionOptions}
                        onSelect={handleSelectRegion}
                        loading={regionsLoading}
                        disabled={submitting}
                        error={regionsError}
                        searchPlaceholder="Search Philippine region..."
                        onRetry={handleRetryRegions}
                      />

                      {selectedRegion && hasProvinces ? (
                        <SelectField
                          label="Province"
                          placeholder="Select Province"
                          value={selectedProvince?.code ?? null}
                          displayValue={selectedProvince?.name}
                          options={provinceOptions}
                          onSelect={handleSelectProvince}
                          loading={provincesLoading}
                          disabled={submitting || !selectedRegion || provincesLoading}
                          error={provincesError}
                          searchPlaceholder="Search province..."
                          onRetry={handleRetryProvinces}
                        />
                      ) : null}

                      <SelectField
                        label="City / Municipality"
                        placeholder={
                          selectedRegion
                            ? hasProvinces && !selectedProvince
                              ? 'Select a Province first'
                              : 'Select City or Municipality'
                            : 'Select a Region first'
                        }
                        value={selectedCity?.code ?? null}
                        displayValue={selectedCity?.name}
                        options={cityOptions}
                        onSelect={handleSelectCity}
                        loading={citiesLoading}
                        disabled={
                          submitting ||
                          !selectedRegion ||
                          provincesLoading ||
                          (hasProvinces && !selectedProvince)
                        }
                        error={citiesError}
                        searchPlaceholder="Search city or municipality..."
                        onRetry={handleRetryCities}
                      />

                      <SelectField
                        label="Barangay"
                        placeholder={
                          selectedCity ? 'Select Barangay' : 'Select a City / Municipality first'
                        }
                        value={selectedBarangay?.code ?? null}
                        displayValue={selectedBarangay?.name}
                        options={barangayOptions}
                        onSelect={handleSelectBarangay}
                        loading={barangaysLoading}
                        disabled={submitting || !selectedCity}
                        error={barangaysError}
                        searchPlaceholder="Search barangay..."
                        onRetry={handleRetryBarangays}
                      />

                      <View
                        className={`rounded-2xl border bg-surface-input px-4 py-3 ${
                          focusedField === 'street' ? 'border-primary' : 'border-transparent'
                        } ${submitting ? 'opacity-70' : ''}`}
                      >
                        <Text className="text-xs font-semibold text-primary">
                          House / Unit No., Street, Purok / Subdivision
                        </Text>
                        <TextInput
                          value={streetAddress}
                          onChangeText={setStreetAddress}
                          placeholder="e.g. Blk 4 Lot 12, Purok 3, Rizal St."
                          placeholderTextColor={colors.inkSubtle}
                          maxLength={140}
                          editable={!submitting}
                          onFocus={() => setFocusedField('street')}
                          onBlur={() => setFocusedField(null)}
                          className="mt-1 min-h-[26px] p-0 text-base font-medium text-ink"
                          accessibilityLabel="House number, street, or purok"
                        />
                      </View>

                      {composedAddressPreview ? (
                        <View className="flex-row items-start gap-2 rounded-xl bg-surface-muted px-3.5 py-2.5">
                          <MaterialIcons
                            name="location-on"
                            size={16}
                            color={colors.primary}
                            style={{ marginTop: 2 }}
                          />
                          <Text className="flex-1 text-xs leading-4 text-ink-muted">
                            {composedAddressPreview}
                          </Text>
                        </View>
                      ) : null}
                    </>
                  )}
                </View>

                {/* 3. Account Security */}
                <View className="gap-3">
                  <Text className="text-xs font-bold uppercase tracking-wider text-ink-subtle">
                    Account Security
                  </Text>

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
                        placeholder="At least 8 characters"
                        placeholderTextColor={colors.inkSubtle}
                        secureTextEntry={passwordHidden}
                        autoCapitalize="none"
                        autoComplete="new-password"
                        editable={!submitting}
                        onFocus={() => setFocusedField('password')}
                        onBlur={() => setFocusedField(null)}
                        className="mt-1 min-h-[26px] p-0 text-base font-medium text-ink"
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

                  <View
                    className={`flex-row items-center rounded-2xl border bg-surface-input px-4 py-3 ${
                      focusedField === 'confirmPassword' ? 'border-primary' : 'border-transparent'
                    } ${submitting ? 'opacity-70' : ''}`}
                  >
                    <View className="flex-1">
                      <Text className="text-xs font-semibold text-primary">Confirm password</Text>
                      <TextInput
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        placeholder="Re-enter your password"
                        placeholderTextColor={colors.inkSubtle}
                        secureTextEntry={confirmHidden}
                        autoCapitalize="none"
                        autoComplete="new-password"
                        editable={!submitting}
                        onFocus={() => setFocusedField('confirmPassword')}
                        onBlur={() => setFocusedField(null)}
                        className="mt-1 min-h-[26px] p-0 text-base font-medium text-ink"
                        accessibilityLabel="Confirm password"
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

                {/* 4. Privacy & Terms */}
                <View className="gap-3">
                  <Text className="text-xs font-bold uppercase tracking-wider text-ink-subtle">
                    Privacy &amp; Terms
                  </Text>

                  <View className="flex-row items-start gap-3 rounded-2xl bg-surface-input p-4">
                    <Pressable
                      onPress={() => setPrivacyConsentAccepted((prev) => !prev)}
                      disabled={submitting}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: privacyConsentAccepted }}
                      accessibilityLabel="I consent to the processing of my personal data under RA 10173"
                      hitSlop={6}
                    >
                      <MaterialIcons
                        name={privacyConsentAccepted ? 'check-box' : 'check-box-outline-blank'}
                        size={22}
                        color={privacyConsentAccepted ? colors.primary : colors.inkSubtle}
                      />
                    </Pressable>
                    <View className="flex-1 gap-1">
                      <Text className="text-xs font-bold text-ink">
                        Data Privacy Consent (RA 10173)
                      </Text>
                      <Text className="text-xs leading-5 text-ink-muted">
                        I consent to the Barangay Office processing my details and valid IDs solely
                        for document fulfillment under the{' '}
                        <Text
                          onPress={() => setPrivacyModalVisible(true)}
                          accessibilityRole="link"
                          className="font-bold text-primary underline"
                        >
                          Privacy Policy
                        </Text>
                        . Files are stored privately and purged 30 days after completion or
                        rejection.
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row items-start gap-3 rounded-2xl bg-surface-input p-4">
                    <Pressable
                      onPress={() => setTermsAccepted((prev) => !prev)}
                      disabled={submitting}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: termsAccepted }}
                      accessibilityLabel="I agree to the DocuDash Terms and Conditions"
                      hitSlop={6}
                    >
                      <MaterialIcons
                        name={termsAccepted ? 'check-box' : 'check-box-outline-blank'}
                        size={22}
                        color={termsAccepted ? colors.primary : colors.inkSubtle}
                      />
                    </Pressable>
                    <Text className="flex-1 text-xs font-medium leading-5 text-ink">
                      I have read and agree to the{' '}
                      <Text
                        onPress={() => setTermsModalVisible(true)}
                        accessibilityRole="link"
                        className="font-bold text-primary underline"
                      >
                        Terms &amp; Conditions
                      </Text>{' '}
                      governing DocuDash barangay document pre-processing and counter pickup.
                    </Text>
                  </View>
                </View>
              </View>

              {/* Bottom CTA zone */}
              <View className="gap-4 pt-2">
                <Pressable
                  onPress={() => void handleSubmit()}
                  disabled={Boolean(configError) || submitting}
                  accessibilityRole="button"
                  accessibilityLabel="Create Account"
                  accessibilityState={{
                    disabled: Boolean(configError) || submitting,
                    busy: submitting,
                  }}
                  className={`min-h-[54px] w-full flex-row items-center justify-center gap-2 rounded-full bg-primary px-6 ${
                    configError ? 'opacity-45' : ''
                  }`}
                  style={({ pressed }) =>
                    pressed && !configError && !submitting ? { opacity: 0.9 } : undefined
                  }
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text className="text-base font-bold text-white">Create Account</Text>
                  )}
                </Pressable>

                <View className="flex-row items-center justify-center gap-1.5">
                  <Text className="text-sm text-ink-muted">Already have an account?</Text>
                  <Link href="/(auth)/login" asChild>
                    <Pressable hitSlop={8}>
                      <Text className="text-sm font-semibold text-primary">Sign in</Text>
                    </Pressable>
                  </Link>
                </View>
              </View>
            </>
          )}
        </View>
      </ScrollView>

      <PrivacyPolicyModal
        visible={privacyModalVisible}
        onClose={() => setPrivacyModalVisible(false)}
        onAccept={() => {
          setPrivacyConsentAccepted(true);
          setPrivacyModalVisible(false);
        }}
        showAcceptButton
      />

      <TermsModal
        visible={termsModalVisible}
        onClose={() => setTermsModalVisible(false)}
        onAccept={() => {
          setTermsAccepted(true);
          setTermsModalVisible(false);
        }}
        showAcceptButton
      />
    </KeyboardAvoidingView>
  );
}
