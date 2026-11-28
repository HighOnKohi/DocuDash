import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ChangePasswordModal } from '@/components/ChangePasswordModal';
import {
  PhilippineBarangayPicker,
  type SelectedBarangayLocation,
} from '@/components/PhilippineBarangayPicker';
import { Banner, EmptyState, LoadingState } from '@/components/StateView';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
  assignMyBarangay,
  getBarangayById,
  getBarangayGcashQrUrl,
  openBarangayHallInMaps,
  updateBarangayOffice,
  uploadBarangayGcashQr,
} from '@/services/barangayService';
import { MAX_ATTACHMENT_BYTES, type UploadableFileBody } from '@/services/storageService';
import { toServiceError } from '@/services/supabase';
import type { Barangay } from '@/types/database';

const QR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Staff/Admin Barangay Office & GCash QR management screen.
 * Allows configuring the Barangay Hall address, Google Maps pin/coordinates,
 * and uploading the barangay's GCash payment QR code.
 */
export default function AdminBarangayOfficeScreen() {
  const { user, profile, refreshProfile } = useAuth();
  const { colors } = useTheme();
  const barangayId = profile?.barangay_id ?? null;

  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const isTempPassword = Boolean(user?.user_metadata?.must_change_password);

  const [barangay, setBarangay] = useState<Barangay | null>(null);
  const [loading, setLoading] = useState(Boolean(barangayId));
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedLocation, setSelectedLocation] = useState<SelectedBarangayLocation>({
    region: null,
    province: null,
    city: null,
    barangay: null,
  });
  const [assigning, setAssigning] = useState(false);

  const [hallAddress, setHallAddress] = useState('');
  const [googleMapsUrl, setGoogleMapsUrl] = useState('');
  const [latitudeDraft, setLatitudeDraft] = useState('');
  const [longitudeDraft, setLongitudeDraft] = useState('');
  const [savingLocation, setSavingLocation] = useState(false);

  const [gcashAccountName, setGcashAccountName] = useState('');
  const [gcashAccountNumber, setGcashAccountNumber] = useState('');
  const [savingGcash, setSavingGcash] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);

  const [feedback, setFeedback] = useState<{
    tone: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!barangayId) return;
    let active = true;

    void getBarangayById(barangayId)
      .then((row) => {
        if (!active) return;
        setBarangay(row);
        if (row) {
          setHallAddress(row.hall_address ?? '');
          setGoogleMapsUrl(row.google_maps_url ?? '');
          setLatitudeDraft(row.hall_latitude != null ? String(row.hall_latitude) : '');
          setLongitudeDraft(row.hall_longitude != null ? String(row.hall_longitude) : '');
          setGcashAccountName(row.gcash_account_name ?? '');
          setGcashAccountNumber(row.gcash_account_number ?? '');
        }
        setLoadError(null);
      })
      .catch((error) => {
        if (!active) return;
        setLoadError(toServiceError(error, 'Unable to load barangay office record.').message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [barangayId]);

  async function handleAssignBarangay() {
    setFeedback(null);
    if (!selectedLocation.barangay || !selectedLocation.city) {
      setFeedback({
        tone: 'error',
        message: 'Please select a Region, City/Municipality, and Barangay.',
      });
      return;
    }

    setAssigning(true);
    try {
      setLoading(true);
      await assignMyBarangay({
        barangayCode: selectedLocation.barangay.code,
        barangayName: selectedLocation.barangay.name,
        cityMunicipality: selectedLocation.city.name,
        province: selectedLocation.province?.name ?? '',
        region: selectedLocation.region?.name ?? '',
      });
      await refreshProfile();
      setFeedback({
        tone: 'success',
        message: `Assigned to ${selectedLocation.barangay.name}, ${selectedLocation.city.name}.`,
      });
    } catch (error) {
      setLoading(false);
      setFeedback({
        tone: 'error',
        message: toServiceError(error, 'Unable to assign your barangay.').message,
      });
    } finally {
      setAssigning(false);
    }
  }

  async function handleSaveLocation() {
    if (!barangay) return;
    setFeedback(null);

    const parsedLat = latitudeDraft.trim() ? Number(latitudeDraft.trim()) : null;
    const parsedLng = longitudeDraft.trim() ? Number(longitudeDraft.trim()) : null;

    setSavingLocation(true);
    try {
      const updated = await updateBarangayOffice(barangay.id, {
        hall_address: hallAddress,
        google_maps_url: googleMapsUrl.trim() || null,
        hall_latitude: parsedLat,
        hall_longitude: parsedLng,
      });
      setBarangay(updated);
      setFeedback({ tone: 'success', message: 'Barangay Hall location updated.' });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: toServiceError(error, 'Unable to save Barangay Hall location.').message,
      });
    } finally {
      setSavingLocation(false);
    }
  }

  async function handleSaveGcashDetails() {
    if (!barangay) return;
    setFeedback(null);
    setSavingGcash(true);
    try {
      const updated = await updateBarangayOffice(barangay.id, {
        gcash_account_name: gcashAccountName.trim() || null,
        gcash_account_number: gcashAccountNumber.trim() || null,
      });
      setBarangay(updated);
      setFeedback({ tone: 'success', message: 'GCash account details saved.' });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: toServiceError(error, 'Unable to save GCash account details.').message,
      });
    } finally {
      setSavingGcash(false);
    }
  }

  async function handleUploadQrImage() {
    if (!barangay) return;
    setFeedback(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: QR_MIME_TYPES,
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;

      const mimeType =
        asset.mimeType?.toLowerCase() ??
        (asset.name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');

      if (!QR_MIME_TYPES.includes(mimeType)) {
        setFeedback({
          tone: 'error',
          message: 'Please select a JPEG, PNG, or WebP image for the GCash QR code.',
        });
        return;
      }

      const sizeBytes = asset.size ?? asset.file?.size ?? 0;
      if (sizeBytes > MAX_ATTACHMENT_BYTES) {
        setFeedback({ tone: 'error', message: 'Selected QR image exceeds the 5 MB limit.' });
        return;
      }

      setUploadingQr(true);
      const body: UploadableFileBody = asset.file
        ? asset.file
        : await (await fetch(asset.uri)).arrayBuffer();

      const updated = await uploadBarangayGcashQr({
        barangayId: barangay.id,
        file: body,
        fileName: asset.name,
        contentType: mimeType,
      });
      setBarangay(updated);
      setFeedback({
        tone: 'success',
        message: 'GCash payment QR code uploaded and published for residents.',
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: toServiceError(error, 'Unable to upload GCash QR image.').message,
      });
    } finally {
      setUploadingQr(false);
    }
  }

  const qrPublicUrl = getBarangayGcashQrUrl(barangay?.gcash_qr_storage_path);

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-surface-muted"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 24, paddingBottom: 44 }}
      >
        <View className="mx-auto w-full max-w-4xl gap-6">
          <View className="gap-1">
            <Text className="text-2xl font-bold text-ink">Barangay Office &amp; Payments</Text>
            <Text className="text-sm text-ink-muted">
              Manage your Barangay Hall Google Maps location and upload the official GCash QR code
              for resident payments.
            </Text>
          </View>

          {feedback ? <Banner tone={feedback.tone} message={feedback.message} /> : null}
          {loadError ? <Banner tone="error" message={loadError} /> : null}

          <Card
            title="Account Security &amp; Password"
            subtitle={`Signed in as ${user?.email ?? 'barangay official'}`}
            rightSlot={
              <Button
                label="Change Password"
                icon="lock-reset"
                size="sm"
                variant={isTempPassword ? 'primary' : 'outline'}
                onPress={() => setChangePasswordOpen(true)}
              />
            }
          >
            {isTempPassword ? (
              <Banner
                tone="warning"
                message="You are signed in with an emailed temporary password. Please set your own private password now."
              />
            ) : (
              <Text className="text-xs leading-5 text-ink-muted">
                Update your Barangay Admin password anytime to keep your office portal secure.
              </Text>
            )}
          </Card>

          {!barangayId ? (
            <Card
              title="Assign Your Barangay Office"
              subtitle="Link your staff account to your Philippine barangay before configuring hall coordinates and GCash QR."
            >
              <View className="gap-4">
                <PhilippineBarangayPicker disabled={assigning} onChange={setSelectedLocation} />
                <Button
                  label="Link Barangay Office"
                  icon="check"
                  loading={assigning}
                  onPress={() => void handleAssignBarangay()}
                />
              </View>
            </Card>
          ) : loading ? (
            <LoadingState message="Loading barangay office settings..." />
          ) : !barangay ? (
            <EmptyState
              icon="account-balance"
              title="Barangay record not found"
              description="Your assigned barangay record could not be loaded."
            />
          ) : (
            <>
              {/* Assigned Barangay Banner */}
              <Card>
                <View className="flex-row flex-wrap items-center justify-between gap-3">
                  <View className="flex-row items-center gap-3">
                    <View className="h-12 w-12 items-center justify-center rounded-xl bg-primary-50">
                      <MaterialIcons name="account-balance" size={24} color={colors.primary} />
                    </View>
                    <View>
                      <Text className="text-lg font-bold text-ink">{barangay.name}</Text>
                      <Text className="text-xs text-ink-muted">
                        {[barangay.city_municipality, barangay.province, barangay.region]
                          .filter(Boolean)
                          .join(', ')}
                      </Text>
                    </View>
                  </View>

                  <Button
                    label="Test in Google Maps"
                    variant="outline"
                    size="sm"
                    icon="map"
                    onPress={() => void openBarangayHallInMaps(barangay)}
                  />
                </View>
              </Card>

              {/* Hall Google Maps Location */}
              <Card
                title="Barangay Hall Location"
                subtitle="Residents see a 'Locate Barangay Hall' button using these details."
              >
                <View className="gap-4">
                  <TextField
                    label="Barangay Hall Address"
                    value={hallAddress}
                    onChangeText={setHallAddress}
                    placeholder="e.g. Rizal St. cor. Mabini St., Barangay Hall Compound"
                    multiline
                    numberOfLines={2}
                    maxLength={300}
                    editable={!savingLocation}
                  />

                  <TextField
                    label="Google Maps Link (optional)"
                    value={googleMapsUrl}
                    onChangeText={setGoogleMapsUrl}
                    placeholder="https://maps.google.com/?q=..."
                    autoCapitalize="none"
                    keyboardType="url"
                    helperText="Paste a Google Maps share link, or enter coordinates below."
                    editable={!savingLocation}
                  />

                  <View className="flex-row gap-3">
                    <View className="flex-1">
                      <TextField
                        label="Latitude (optional)"
                        value={latitudeDraft}
                        onChangeText={setLatitudeDraft}
                        placeholder="14.5995"
                        keyboardType="numeric"
                        editable={!savingLocation}
                      />
                    </View>
                    <View className="flex-1">
                      <TextField
                        label="Longitude (optional)"
                        value={longitudeDraft}
                        onChangeText={setLongitudeDraft}
                        placeholder="120.9842"
                        keyboardType="numeric"
                        editable={!savingLocation}
                      />
                    </View>
                  </View>

                  <View className="flex-row flex-wrap gap-2.5">
                    <Button
                      label="Save Location"
                      icon="save"
                      loading={savingLocation}
                      onPress={() => void handleSaveLocation()}
                    />
                    <Button
                      label="Preview Map"
                      variant="outline"
                      icon="open-in-new"
                      onPress={() =>
                        void openBarangayHallInMaps({
                          name: barangay.name,
                          city_municipality: barangay.city_municipality,
                          province: barangay.province,
                          hall_address: hallAddress,
                          google_maps_url: googleMapsUrl.trim() || null,
                          hall_latitude: latitudeDraft.trim() ? Number(latitudeDraft.trim()) : null,
                          hall_longitude: longitudeDraft.trim()
                            ? Number(longitudeDraft.trim())
                            : null,
                        })
                      }
                    />
                  </View>
                </View>
              </Card>

              {/* Official GCash QR & Account */}
              <Card
                title="GCash Payment QR Code"
                subtitle="Shown to residents who choose 'Pay Now (GCash)' when submitting or paying for a request."
              >
                <View className="gap-4">
                  <View className="items-center gap-3 rounded-xl border border-border bg-surface-muted p-5">
                    {qrPublicUrl ? (
                      <Image
                        source={{ uri: qrPublicUrl }}
                        resizeMode="contain"
                        style={{
                          width: 220,
                          height: 220,
                          borderRadius: 12,
                          backgroundColor: '#FFFFFF',
                        }}
                        accessibilityLabel="Barangay GCash QR Code"
                      />
                    ) : (
                      <View className="items-center gap-2 py-6">
                        <MaterialIcons name="qr-code-2" size={44} color={colors.inkSubtle} />
                        <Text className="text-sm font-semibold text-ink">
                          No GCash QR uploaded yet
                        </Text>
                        <Text className="max-w-xs text-center text-xs text-ink-muted">
                          Upload your Barangay Treasurer&apos;s official GCash QR image so residents
                          can pay digitally.
                        </Text>
                      </View>
                    )}

                    <Button
                      label={qrPublicUrl ? 'Replace GCash QR Image' : 'Upload GCash QR Image'}
                      icon="upload-file"
                      variant="primary"
                      size="sm"
                      loading={uploadingQr}
                      onPress={() => void handleUploadQrImage()}
                    />
                  </View>

                  <TextField
                    label="GCash Account Name"
                    value={gcashAccountName}
                    onChangeText={setGcashAccountName}
                    placeholder="e.g. Barangay San Isidro Treasury"
                    maxLength={120}
                    editable={!savingGcash}
                  />
                  <TextField
                    label="GCash Mobile Number"
                    value={gcashAccountNumber}
                    onChangeText={setGcashAccountNumber}
                    placeholder="09171234567"
                    keyboardType="phone-pad"
                    maxLength={25}
                    editable={!savingGcash}
                  />

                  <Button
                    label="Save GCash Account Details"
                    icon="save"
                    variant="outline"
                    loading={savingGcash}
                    onPress={() => void handleSaveGcashDetails()}
                  />
                </View>
              </Card>
            </>
          )}
        </View>
      </ScrollView>

      <ChangePasswordModal
        visible={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
        isTemporaryPassword={isTempPassword}
        onSuccess={() =>
          setFeedback({ tone: 'success', message: 'Your Barangay Admin password was updated.' })
        }
      />
    </KeyboardAvoidingView>
  );
}
