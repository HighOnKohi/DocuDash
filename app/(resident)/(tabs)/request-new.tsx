import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { GcashPaymentDetails } from '@/components/GcashPaymentDetails';
import { Banner, LoadingState } from '@/components/StateView';
import { TextField } from '@/components/TextField';
import { formatFee, formatSlotDate, formatTimeWindow } from '@/constants/format';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getBarangayById } from '@/services/barangayService';
import {
  createRequest,
  listDocumentTypes,
  submitGcashPayment,
} from '@/services/requestService';
import {
  bookPickupSlot,
  listPickupSlots,
  subscribeToPickupSlots,
} from '@/services/scheduleService';
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  MAX_ATTACHMENT_BYTES,
  uploadPaymentProofFile,
  uploadRequirementAttachment,
  type UploadableFileBody,
} from '@/services/storageService';
import { ServiceError, toServiceError } from '@/services/supabase';
import type {
  Barangay,
  DocumentType,
  PaymentMethod,
  PaymentTiming,
  PickupSlot,
} from '@/types/database';

interface SelectedUpload {
  docType: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uri: string;
  webFile?: File;
}

const PURPOSE_SUGGESTIONS = [
  'Local employment requirement',
  'Bank account or loan application',
  'Medical or hospital assistance',
  'Scholarship or school enrollment',
  'Business permit application / renewal',
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function inferMimeType(asset: DocumentPicker.DocumentPickerAsset): string {
  if (asset.mimeType) return asset.mimeType.toLowerCase();
  const lowerName = asset.name.toLowerCase();
  if (lowerName.endsWith('.pdf')) return 'application/pdf';
  if (lowerName.endsWith('.png')) return 'image/png';
  if (lowerName.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

async function readUploadBody(item: SelectedUpload): Promise<UploadableFileBody> {
  if (item.webFile) {
    return item.webFile;
  }
  const response = await fetch(item.uri);
  return response.arrayBuffer();
}

export default function NewRequestScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const { colors } = useTheme();
  const barangayId = profile?.barangay_id ?? null;

  const [barangay, setBarangay] = useState<Barangay | null>(null);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [slots, setSlots] = useState<PickupSlot[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedDocTypeId, setSelectedDocTypeId] = useState<string | null>(null);
  const [purpose, setPurpose] = useState('');
  const [uploads, setUploads] = useState<Record<string, SelectedUpload>>({});
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [paymentTiming, setPaymentTiming] = useState<PaymentTiming>('pay_on_pickup');
  const [gcashRef, setGcashRef] = useState('');
  const [paymentProof, setPaymentProof] = useState<SelectedUpload | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchInitialData = useCallback(async () => {
    try {
      const [types, availableSlots] = await Promise.all([
        listDocumentTypes(),
        listPickupSlots({ upcomingOnly: true, onlyAvailable: true }),
      ]);
      setDocumentTypes(types);
      setSlots(availableSlots);
      setSelectedDocTypeId((current) => current ?? types[0]?.id ?? null);
      setLoadError(null);
    } catch (error) {
      setLoadError(toServiceError(error, 'Unable to load request options.').message);
    } finally {
      setLoadingData(false);
    }
  }, []);

  const loadInitialData = useCallback(async () => {
    setLoadingData(true);
    setLoadError(null);
    await fetchInitialData();
  }, [fetchInitialData]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      listDocumentTypes(),
      listPickupSlots({ upcomingOnly: true, onlyAvailable: true }),
    ])
      .then(([types, availableSlots]) => {
        if (!active) return;
        setDocumentTypes(types);
        setSlots(availableSlots);
        setSelectedDocTypeId((current) => current ?? types[0]?.id ?? null);
        setLoadError(null);
      })
      .catch((error) => {
        if (!active) return;
        setLoadError(toServiceError(error, 'Unable to load request options.').message);
      })
      .finally(() => {
        if (active) setLoadingData(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!barangayId) return;
    let active = true;
    void getBarangayById(barangayId)
      .then((row) => {
        if (active) setBarangay(row);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [barangayId]);

  useEffect(() => {
    const unsubscribe = subscribeToPickupSlots(() => {
      void listPickupSlots({ upcomingOnly: true, onlyAvailable: true })
        .then((latest) => {
          setSlots(latest);
          setSelectedSlotId((current) =>
            current && latest.some((s) => s.id === current) ? current : null
          );
        })
        .catch(() => {});
    });
    return unsubscribe;
  }, []);

  const selectedDocType = useMemo(
    () => documentTypes.find((item) => item.id === selectedDocTypeId) ?? null,
    [documentTypes, selectedDocTypeId]
  );

  const slotsByDate = useMemo(() => {
    const grouped: { date: string; items: PickupSlot[] }[] = [];
    const byDate = new Map<string, PickupSlot[]>();
    for (const slot of slots) {
      const existing = byDate.get(slot.slot_date);
      if (existing) {
        existing.push(slot);
      } else {
        const list = [slot];
        byDate.set(slot.slot_date, list);
        grouped.push({ date: slot.slot_date, items: list });
      }
    }
    return grouped;
  }, [slots]);

  function handleSelectDocType(id: string) {
    if (id === selectedDocTypeId) return;
    setSelectedDocTypeId(id);
    // Clear previously picked files since required_docs keys differ per document type.
    setUploads({});
    setFormError(null);
  }

  async function handlePickFile(docTypeKey: string) {
    setFormError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [...ALLOWED_ATTACHMENT_MIME_TYPES],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;

      const mimeType = inferMimeType(asset);
      if (!(ALLOWED_ATTACHMENT_MIME_TYPES as readonly string[]).includes(mimeType)) {
        setFormError('Only JPEG, PNG, WebP images and PDF files are accepted.');
        return;
      }

      const sizeBytes = asset.size ?? asset.file?.size ?? 0;
      if (sizeBytes > MAX_ATTACHMENT_BYTES) {
        setFormError('Selected file exceeds the 5 MB upload limit.');
        return;
      }

      setUploads((prev) => ({
        ...prev,
        [docTypeKey]: {
          docType: docTypeKey,
          fileName: asset.name,
          contentType: mimeType,
          sizeBytes,
          uri: asset.uri,
          webFile: asset.file,
        },
      }));
    } catch (error) {
      setFormError(toServiceError(error, 'Unable to select file.').message);
    }
  }

  function handleRemoveFile(docTypeKey: string) {
    setUploads((prev) => {
      const next = { ...prev };
      delete next[docTypeKey];
      return next;
    });
  }

  async function handlePickPaymentProof() {
    setFormError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [...ALLOWED_ATTACHMENT_MIME_TYPES],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;

      const mimeType = inferMimeType(asset);
      if (!(ALLOWED_ATTACHMENT_MIME_TYPES as readonly string[]).includes(mimeType)) {
        setFormError('Only JPEG, PNG, WebP images and PDF files are accepted.');
        return;
      }

      const sizeBytes = asset.size ?? asset.file?.size ?? 0;
      if (sizeBytes > MAX_ATTACHMENT_BYTES) {
        setFormError('Selected receipt exceeds the 5 MB upload limit.');
        return;
      }

      setPaymentProof({
        docType: 'payment_proof',
        fileName: asset.name,
        contentType: mimeType,
        sizeBytes,
        uri: asset.uri,
        webFile: asset.file,
      });
    } catch (error) {
      setFormError(toServiceError(error, 'Unable to select receipt file.').message);
    }
  }

  async function handleSubmit() {
    setFormError(null);

    if (!selectedDocType) {
      setFormError('Please select a barangay document type.');
      return;
    }

    const trimmedPurpose = purpose.trim();
    if (trimmedPurpose.length < 3 || trimmedPurpose.length > 500) {
      setFormError('Please enter a purpose between 3 and 500 characters.');
      return;
    }

    const requiredDocs = selectedDocType.required_docs ?? [];
    const missingDocs = requiredDocs.filter((doc) => !uploads[doc.key]);
    if (missingDocs.length > 0) {
      setFormError(
        `Please attach all required documents: ${missingDocs.map((d) => d.label).join(', ')}.`
      );
      return;
    }

    const isPayingGcashNow =
      selectedDocType.fee > 0 && paymentMethod === 'gcash' && paymentTiming === 'pay_now';
    const hasPartialGcashInput = isPayingGcashNow && (Boolean(paymentProof) || gcashRef.trim().length > 0);
    if (hasPartialGcashInput) {
      if (gcashRef.trim().length < 6) {
        setFormError('Enter a valid GCash reference number (at least 6 characters) or clear the receipt to pay later.');
        return;
      }
      if (!paymentProof) {
        setFormError('Please attach your GCash receipt screenshot or clear the reference number to pay later.');
        return;
      }
    }

    setSubmitting(true);
    let createdId: string | null = null;

    try {
      setSubmitProgress('Creating document request...');
      const created = await createRequest({
        documentTypeId: selectedDocType.id,
        purpose: trimmedPurpose,
        paymentMethod: selectedDocType.fee > 0 ? paymentMethod : 'cash',
        paymentTiming:
          selectedDocType.fee > 0 && paymentMethod === 'gcash' ? paymentTiming : 'pay_on_pickup',
      });
      createdId = created.id;

      for (let i = 0; i < requiredDocs.length; i += 1) {
        const spec = requiredDocs[i];
        if (!spec) continue;
        const picked = uploads[spec.key];
        if (!picked) continue;

        setSubmitProgress(`Uploading ${spec.label} (${i + 1}/${requiredDocs.length})...`);
        const fileBody = await readUploadBody(picked);
        await uploadRequirementAttachment({
          requestId: created.id,
          docType: spec.key,
          file: fileBody,
          fileName: picked.fileName,
          contentType: picked.contentType,
        });
      }

      if (selectedSlotId) {
        setSubmitProgress('Reserving pickup slot...');
        await bookPickupSlot(created.id, selectedSlotId);
      }

      if (isPayingGcashNow && paymentProof && gcashRef.trim().length >= 6) {
        setSubmitProgress('Submitting GCash payment proof...');
        const proofBody = await readUploadBody(paymentProof);
        const proofPath = await uploadPaymentProofFile({
          requestId: created.id,
          file: proofBody,
          fileName: paymentProof.fileName,
          contentType: paymentProof.contentType,
        });
        await submitGcashPayment(created.id, gcashRef.trim(), proofPath);
      }

      // Reset form and open the new request tracker.
      setPurpose('');
      setUploads({});
      setSelectedSlotId(null);
      setGcashRef('');
      setPaymentProof(null);
      router.push({
        pathname: '/(resident)/request/[id]',
        params: { id: created.id },
      });
    } catch (error) {
      const friendly =
        error instanceof ServiceError
          ? error.message
          : toServiceError(error, 'Unable to complete your request.').message;

      if (createdId) {
        // Request already exists; navigate to its detail page so the resident can
        // finish uploading or booking without creating a duplicate request.
        router.push({
          pathname: '/(resident)/request/[id]',
          params: { id: createdId, notice: friendly },
        });
      } else {
        setFormError(friendly);
      }
    } finally {
      setSubmitting(false);
      setSubmitProgress(null);
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
            <Text className="text-2xl font-bold text-ink">New Document Request</Text>
            <Text className="text-sm text-ink-muted">
              Complete the steps below to submit requirements for pre-processing.
            </Text>
          </View>

          {loadError ? (
            <Banner
              tone="error"
              message={loadError}
              actionLabel="Retry"
              onAction={() => void loadInitialData()}
            />
          ) : null}

          {loadingData ? (
            <LoadingState message="Loading available barangay documents and pickup slots..." />
          ) : (
            <>
              {/* Step 1: Document Type */}
              <Card
                title="1. Select Document"
                subtitle="Choose the barangay certificate or clearance you need."
              >
                <View className="gap-3">
                  {documentTypes.map((doc) => {
                    const selected = doc.id === selectedDocTypeId;
                    return (
                      <Pressable
                        key={doc.id}
                        onPress={() => handleSelectDocType(doc.id)}
                        disabled={submitting}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        className={`gap-1.5 rounded-lg border p-4 ${
                          selected
                            ? 'border-primary bg-primary-50'
                            : 'border-border bg-surface'
                        }`}
                      >
                        <View className="flex-row items-center justify-between gap-2">
                          <View className="flex-1 flex-row items-center gap-2">
                            <MaterialIcons
                              name={selected ? 'radio-button-checked' : 'radio-button-unchecked'}
                              size={20}
                              color={selected ? colors.primary : colors.inkSubtle}
                            />
                            <Text className="flex-1 text-base font-bold text-ink">{doc.name}</Text>
                          </View>
                          <View className="rounded-full bg-surface px-2.5 py-0.5">
                            <Text className="text-xs font-bold text-primary">
                              {formatFee(doc.fee)}
                            </Text>
                          </View>
                        </View>
                        {doc.description ? (
                          <Text className="pl-7 text-xs leading-5 text-ink-muted">
                            {doc.description}
                          </Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              </Card>

              {/* Step 2: Purpose */}
              <Card
                title="2. State Purpose"
                subtitle="Let barangay staff know where the document will be used."
              >
                <View className="gap-3">
                  <TextField
                    label="Purpose of request"
                    value={purpose}
                    onChangeText={setPurpose}
                    placeholder="e.g. Local employment requirement for ABC Company"
                    multiline
                    numberOfLines={3}
                    maxLength={500}
                    editable={!submitting}
                    required
                  />
                  <View className="flex-row flex-wrap gap-2">
                    {PURPOSE_SUGGESTIONS.map((suggestion) => (
                      <Pressable
                        key={suggestion}
                        onPress={() => setPurpose(suggestion)}
                        disabled={submitting}
                        className="rounded-full border border-border bg-surface-muted px-3 py-1.5"
                      >
                        <Text className="text-xs font-medium text-ink-muted">{suggestion}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </Card>

              {/* Step 3: Required Documents */}
              {selectedDocType ? (
                <Card
                  title="3. Upload Requirements"
                  subtitle="Accepted: JPG, PNG, WebP, or PDF (max 5 MB per file)."
                >
                  <View className="gap-3">
                    {selectedDocType.required_docs.map((spec) => {
                      const picked = uploads[spec.key];
                      return (
                        <View
                          key={spec.key}
                          className="gap-2.5 rounded-lg border border-border bg-surface-muted p-4"
                        >
                          <View className="flex-row items-start justify-between gap-2">
                            <View className="flex-1 gap-0.5">
                              <Text className="text-sm font-bold text-ink">{spec.label}</Text>
                              <Text className="text-xs leading-4 text-ink-muted">
                                {spec.description}
                              </Text>
                            </View>
                            {picked ? (
                              <MaterialIcons name="check-circle" size={20} color={colors.success} />
                            ) : null}
                          </View>

                          {picked ? (
                            <View className="flex-row items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2">
                              <View className="flex-1 flex-row items-center gap-2">
                                <MaterialIcons
                                  name={
                                    picked.contentType === 'application/pdf'
                                      ? 'picture-as-pdf'
                                      : 'image'
                                  }
                                  size={18}
                                  color={colors.primary}
                                />
                                <View className="flex-1">
                                  <Text className="text-xs font-semibold text-ink" numberOfLines={1}>
                                    {picked.fileName}
                                  </Text>
                                  {picked.sizeBytes > 0 ? (
                                    <Text className="text-[11px] text-ink-subtle">
                                      {formatBytes(picked.sizeBytes)}
                                    </Text>
                                  ) : null}
                                </View>
                              </View>
                              <View className="flex-row items-center gap-1">
                                <Pressable
                                  onPress={() => void handlePickFile(spec.key)}
                                  disabled={submitting}
                                  className="px-2 py-1"
                                >
                                  <Text className="text-xs font-semibold text-primary">Replace</Text>
                                </Pressable>
                                <Pressable
                                  onPress={() => handleRemoveFile(spec.key)}
                                  disabled={submitting}
                                  accessibilityLabel={`Remove ${spec.label}`}
                                  className="p-1"
                                >
                                  <MaterialIcons name="close" size={18} color={colors.inkSubtle} />
                                </Pressable>
                              </View>
                            </View>
                          ) : (
                            <Button
                              label="Choose File"
                              icon="upload-file"
                              variant="outline"
                              size="sm"
                              disabled={submitting}
                              onPress={() => void handlePickFile(spec.key)}
                            />
                          )}
                        </View>
                      );
                    })}

                    <Text className="text-xs leading-4 text-ink-subtle">
                      Privacy notice (RA 10173): Uploaded IDs are stored in a private bucket,
                      accessible only to authorized barangay staff via 60-second signed links, and
                      purged 30 days after request completion.
                    </Text>
                  </View>
                </Card>
              ) : null}

              {/* Step 4: Payment Option (GCash / Cash Only) */}
              {selectedDocType ? (
                <Card
                  title="4. Payment Option (GCash / Cash)"
                  subtitle={
                    selectedDocType.fee > 0
                      ? `Fee: ${formatFee(selectedDocType.fee)} — choose to pay now via GCash or pay Cash when claiming.`
                      : 'This document is free of charge.'
                  }
                >
                  {selectedDocType.fee <= 0 ? (
                    <Banner
                      tone="success"
                      message="No fee is required for this certificate (Free)."
                    />
                  ) : (
                    <View className="gap-3">
                      <Pressable
                        onPress={() => {
                          setPaymentMethod('cash');
                          setPaymentTiming('pay_on_pickup');
                        }}
                        disabled={submitting}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: paymentMethod === 'cash' }}
                        className={`flex-row items-start gap-3 rounded-xl border p-3.5 ${
                          paymentMethod === 'cash'
                            ? 'border-primary bg-primary-50'
                            : 'border-border bg-surface'
                        }`}
                      >
                        <MaterialIcons
                          name={
                            paymentMethod === 'cash'
                              ? 'radio-button-checked'
                              : 'radio-button-unchecked'
                          }
                          size={20}
                          color={paymentMethod === 'cash' ? colors.primary : colors.inkSubtle}
                        />
                        <View className="flex-1">
                          <Text className="text-sm font-bold text-ink">
                            Pay When Claiming (Cash at Counter)
                          </Text>
                          <Text className="text-xs text-ink-muted">
                            Settle {formatFee(selectedDocType.fee)} in cash at the Barangay Hall
                            upon pickup. Staff will verify payment manually at the counter.
                          </Text>
                        </View>
                      </Pressable>

                      <Pressable
                        onPress={() => {
                          setPaymentMethod('gcash');
                          setPaymentTiming('pay_now');
                        }}
                        disabled={submitting}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: paymentMethod === 'gcash' }}
                        className={`flex-row items-start gap-3 rounded-xl border p-3.5 ${
                          paymentMethod === 'gcash'
                            ? 'border-primary bg-primary-50'
                            : 'border-border bg-surface'
                        }`}
                      >
                        <MaterialIcons
                          name={
                            paymentMethod === 'gcash'
                              ? 'radio-button-checked'
                              : 'radio-button-unchecked'
                          }
                          size={20}
                          color={paymentMethod === 'gcash' ? colors.primary : colors.inkSubtle}
                        />
                        <View className="flex-1">
                          <Text className="text-sm font-bold text-ink">Pay Now (GCash QR)</Text>
                          <Text className="text-xs text-ink-muted">
                            Scan your barangay&apos;s GCash QR code and upload your payment receipt
                            now (or pay later from the Request Tracker).
                          </Text>
                        </View>
                      </Pressable>

                      {paymentMethod === 'gcash' ? (
                        <View className="gap-3 rounded-xl border border-border bg-surface-muted p-4">
                          <GcashPaymentDetails
                            barangay={barangay}
                            emptyTone="info"
                            emptyMessage="Your barangay office has not uploaded a GCash QR image yet. You can still submit this request now and upload GCash proof later or pay Cash upon claiming."
                          />

                          <View className="rounded-xl border border-border bg-surface px-3.5 py-2.5">
                            <Text className="text-xs font-semibold text-primary">
                              GCash Reference Number (optional now)
                            </Text>
                            <TextInput
                              value={gcashRef}
                              onChangeText={setGcashRef}
                              placeholder="Enter 13-digit GCash reference no."
                              placeholderTextColor={colors.inkSubtle}
                              maxLength={64}
                              editable={!submitting}
                              className="mt-1 min-h-[26px] p-0 text-sm font-medium text-ink"
                            />
                          </View>

                          {paymentProof ? (
                            <View className="flex-row items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-800 dark:bg-emerald-950/50">
                              <Text
                                className="flex-1 text-xs font-semibold text-emerald-900 dark:text-emerald-200"
                                numberOfLines={1}
                              >
                                Receipt: {paymentProof.fileName}
                              </Text>
                              <Pressable onPress={() => setPaymentProof(null)} hitSlop={8}>
                                <MaterialIcons name="close" size={18} color={colors.inkSubtle} />
                              </Pressable>
                            </View>
                          ) : (
                            <Button
                              label="Upload GCash Receipt (Optional Now)"
                              icon="upload-file"
                              variant="outline"
                              size="sm"
                              disabled={submitting}
                              onPress={() => void handlePickPaymentProof()}
                            />
                          )}
                        </View>
                      ) : null}
                    </View>
                  )}
                </Card>
              ) : null}

              {/* Step 5: Pickup Slot */}
              <Card
                title="5. Book Pickup Slot"
                subtitle="Reserve a counter window now (you can also re-book later before pickup)."
              >
                {slotsByDate.length === 0 ? (
                  <Banner
                    tone="info"
                    message="No pickup slots are open right now. You can still submit your request and book a slot from your request page once staff open schedules."
                  />
                ) : (
                  <View className="gap-4">
                    {slotsByDate.map((group) => (
                      <View key={group.date} className="gap-2">
                        <Text className="text-xs font-bold uppercase tracking-wider text-ink-subtle">
                          {formatSlotDate(group.date)}
                        </Text>
                        <View className="flex-row flex-wrap gap-2">
                          {group.items.map((slot) => {
                            const selected = selectedSlotId === slot.id;
                            const remaining = Math.max(slot.max_capacity - slot.booked_count, 0);
                            return (
                              <Pressable
                                key={slot.id}
                                onPress={() =>
                                  setSelectedSlotId((prev) => (prev === slot.id ? null : slot.id))
                                }
                                disabled={submitting}
                                accessibilityRole="radio"
                                accessibilityState={{ selected }}
                                className={`rounded-lg border px-3.5 py-2.5 ${
                                  selected
                                    ? 'border-primary bg-primary-50'
                                    : 'border-border bg-surface'
                                }`}
                              >
                                <Text
                                  className={`text-sm font-semibold ${
                                    selected ? 'text-primary' : 'text-ink'
                                  }`}
                                >
                                  {formatTimeWindow(slot.time_window)}
                                </Text>
                                <Text className="text-xs text-ink-subtle">
                                  {remaining} {remaining === 1 ? 'slot' : 'slots'} left
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </Card>

              {formError ? <Banner tone="error" message={formError} /> : null}

              <View className="gap-2">
                <Button
                  label={submitProgress ?? 'Submit Document Request'}
                  icon="send"
                  onPress={() => void handleSubmit()}
                  loading={submitting}
                  fullWidth
                />
                {selectedDocType && selectedDocType.fee > 0 ? (
                  <Text className="text-center text-xs text-ink-subtle">
                    Document fee: {formatFee(selectedDocType.fee)} (
                    {paymentMethod === 'gcash'
                      ? 'GCash digital verification'
                      : 'Cash upon counter pickup'}
                    ).
                  </Text>
                ) : null}
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
