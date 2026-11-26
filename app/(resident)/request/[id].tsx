import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as DocumentPicker from 'expo-document-picker';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { QrCodeMatrix } from '@/components/QrCodeMatrix';
import { Banner, EmptyState, LoadingState } from '@/components/StateView';
import { StatusBadge } from '@/components/StatusBadge';
import { TextField } from '@/components/TextField';
import {
  formatDateTime,
  formatFee,
  formatSlotDate,
  formatTimeWindow,
  getStatusDescription,
} from '@/constants/format';
import { colors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import {
  getRequestById,
  subscribeToRequest,
  updateRequestPurpose,
} from '@/services/requestService';
import { bookPickupSlot, listPickupSlots } from '@/services/scheduleService';
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  deleteRequirementAttachment,
  getSignedAttachmentUrl,
  MAX_ATTACHMENT_BYTES,
  uploadRequirementAttachment,
  type UploadableFileBody,
} from '@/services/storageService';
import { toServiceError } from '@/services/supabase';
import type { PickupSlot, RequestAttachment, RequestStatus, RequestWithDetails } from '@/types/database';

const TIMELINE_STEPS: { key: RequestStatus; label: string; detail: string }[] = [
  { key: 'pending', label: 'Submitted', detail: 'Request received in barangay queue' },
  { key: 'reviewing', label: 'Under Review', detail: 'Staff verifying your requirements' },
  { key: 'ready', label: 'Ready for Pickup', detail: 'QR pickup pass issued' },
  { key: 'completed', label: 'Completed', detail: 'Document verified and released' },
];

function getStepIndex(status: RequestStatus): number {
  switch (status) {
    case 'pending':
      return 0;
    case 'reviewing':
      return 1;
    case 'ready':
      return 2;
    case 'completed':
      return 3;
    case 'rejected':
      return -1;
  }
}

export default function RequestDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id, notice } = useLocalSearchParams<{ id: string; notice?: string }>();
  const { profile } = useAuth();

  const [request, setRequest] = useState<RequestWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{
    tone: 'success' | 'error' | 'warning';
    text: string;
  } | null>(notice ? { tone: 'warning', text: notice } : null);

  // Purpose editing (pending requests only)
  const [editingPurpose, setEditingPurpose] = useState(false);
  const [purposeDraft, setPurposeDraft] = useState('');
  const [savingPurpose, setSavingPurpose] = useState(false);

  // Inline slot picker
  const [slotPickerOpen, setSlotPickerOpen] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<PickupSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [bookingSlotId, setBookingSlotId] = useState<string | null>(null);

  // Attachment busy states
  const [busyDocType, setBusyDocType] = useState<string | null>(null);
  const [viewingAttachmentId, setViewingAttachmentId] = useState<string | null>(null);

  const loadRequest = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (!id) return;
      if (!options.silent) setLoading(true);
      setErrorMessage(null);
      try {
        const data = await getRequestById(id);
        setRequest(data);
        if (data) {
          setPurposeDraft(data.purpose);
        }
      } catch (error) {
        setErrorMessage(toServiceError(error, 'Unable to load request details.').message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [id]
  );

  useEffect(() => {
    if (!id) return;
    let active = true;
    void getRequestById(id)
      .then((data) => {
        if (!active) return;
        setRequest(data);
        if (data) {
          setPurposeDraft(data.purpose);
        }
        setErrorMessage(null);
      })
      .catch((error) => {
        if (!active) return;
        setErrorMessage(toServiceError(error, 'Unable to load request details.').message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const unsubscribe = subscribeToRequest(id, () => {
      void loadRequest({ silent: true });
    });
    return unsubscribe;
  }, [id, loadRequest]);

  const attachmentsByDocType = useMemo(() => {
    const map = new Map<string, RequestAttachment[]>();
    for (const att of request?.attachments ?? []) {
      const existing = map.get(att.doc_type);
      if (existing) existing.push(att);
      else map.set(att.doc_type, [att]);
    }
    return map;
  }, [request?.attachments]);

  async function handleOpenSlotPicker() {
    if (slotPickerOpen) {
      setSlotPickerOpen(false);
      return;
    }
    setSlotPickerOpen(true);
    setLoadingSlots(true);
    setActionMessage(null);
    try {
      const latest = await listPickupSlots({ upcomingOnly: true, onlyAvailable: true });
      setAvailableSlots(latest);
    } catch (error) {
      setActionMessage({
        tone: 'error',
        text: toServiceError(error, 'Unable to load pickup slots.').message,
      });
    } finally {
      setLoadingSlots(false);
    }
  }

  async function handleBookSlot(slotId: string) {
    if (!request) return;
    setBookingSlotId(slotId);
    setActionMessage(null);
    try {
      await bookPickupSlot(request.id, slotId);
      await loadRequest({ silent: true });
      setSlotPickerOpen(false);
      setActionMessage({ tone: 'success', text: 'Pickup slot reserved successfully.' });
    } catch (error) {
      setActionMessage({
        tone: 'error',
        text: toServiceError(error, 'Unable to reserve that slot.').message,
      });
    } finally {
      setBookingSlotId(null);
    }
  }

  async function handleSavePurpose() {
    if (!request) return;
    setSavingPurpose(true);
    setActionMessage(null);
    try {
      await updateRequestPurpose(request.id, purposeDraft);
      await loadRequest({ silent: true });
      setEditingPurpose(false);
      setActionMessage({ tone: 'success', text: 'Request purpose updated.' });
    } catch (error) {
      setActionMessage({
        tone: 'error',
        text: toServiceError(error, 'Unable to update purpose.').message,
      });
    } finally {
      setSavingPurpose(false);
    }
  }

  async function handleViewAttachment(attachment: RequestAttachment) {
    setViewingAttachmentId(attachment.id);
    setActionMessage(null);
    try {
      const { signedUrl } = await getSignedAttachmentUrl(attachment.storage_path, {
        logAudit: false,
      });
      if (Platform.OS === 'web') {
        await Linking.openURL(signedUrl);
      } else {
        await WebBrowser.openBrowserAsync(signedUrl);
      }
    } catch (error) {
      setActionMessage({
        tone: 'error',
        text: toServiceError(error, 'Unable to open attachment preview.').message,
      });
    } finally {
      setViewingAttachmentId(null);
    }
  }

  async function handleUploadForDocType(docTypeKey: string) {
    if (!request) return;
    setActionMessage(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [...ALLOWED_ATTACHMENT_MIME_TYPES],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;

      const mimeType =
        asset.mimeType?.toLowerCase() ??
        (asset.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');

      if (!(ALLOWED_ATTACHMENT_MIME_TYPES as readonly string[]).includes(mimeType)) {
        setActionMessage({
          tone: 'error',
          text: 'Only JPEG, PNG, WebP images and PDF files are accepted.',
        });
        return;
      }

      const sizeBytes = asset.size ?? asset.file?.size ?? 0;
      if (sizeBytes > MAX_ATTACHMENT_BYTES) {
        setActionMessage({ tone: 'error', text: 'Selected file exceeds the 5 MB limit.' });
        return;
      }

      setBusyDocType(docTypeKey);
      const body: UploadableFileBody = asset.file
        ? asset.file
        : await (await fetch(asset.uri)).arrayBuffer();

      await uploadRequirementAttachment({
        requestId: request.id,
        docType: docTypeKey,
        file: body,
        fileName: asset.name,
        contentType: mimeType,
      });

      await loadRequest({ silent: true });
      setActionMessage({ tone: 'success', text: 'Requirement uploaded.' });
    } catch (error) {
      setActionMessage({
        tone: 'error',
        text: toServiceError(error, 'Unable to upload requirement.').message,
      });
    } finally {
      setBusyDocType(null);
    }
  }

  async function handleDeleteAttachment(attachment: RequestAttachment) {
    setBusyDocType(attachment.doc_type);
    setActionMessage(null);
    try {
      await deleteRequirementAttachment(attachment.id, attachment.storage_path);
      await loadRequest({ silent: true });
      setActionMessage({ tone: 'success', text: 'Attachment removed.' });
    } catch (error) {
      setActionMessage({
        tone: 'error',
        text: toServiceError(error, 'Unable to remove attachment.').message,
      });
    } finally {
      setBusyDocType(null);
    }
  }

  const canBookSlot =
    request?.status === 'pending' ||
    request?.status === 'reviewing' ||
    request?.status === 'ready';

  const isPending = request?.status === 'pending';
  const activeStep = request ? getStepIndex(request.status) : 0;

  return (
    <ScrollView
      className="flex-1 bg-surface-muted"
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingBottom: insets.bottom + 36,
        paddingHorizontal: 20,
      }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void loadRequest({ silent: true });
          }}
          tintColor={colors.primary}
        />
      }
    >
      <View className="mx-auto w-full max-w-3xl gap-5">
        <View className="flex-row items-center justify-between">
          <Pressable
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace('/(resident)');
            }}
            accessibilityRole="button"
            className="flex-row items-center gap-1.5 py-1"
          >
            <MaterialIcons name="arrow-back" size={20} color={colors.ink} />
            <Text className="text-sm font-semibold text-ink">Back to Dashboard</Text>
          </Pressable>

          <View className="flex-row items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1">
            <View className="h-2 w-2 rounded-full bg-emerald-600" />
            <Text className="text-[11px] font-semibold text-emerald-800">Live updates</Text>
          </View>
        </View>

        {actionMessage ? (
          <Banner tone={actionMessage.tone} message={actionMessage.text} />
        ) : null}

        {errorMessage ? (
          <Banner
            tone="error"
            message={errorMessage}
            actionLabel="Retry"
            onAction={() => void loadRequest()}
          />
        ) : null}

        {loading ? (
          <LoadingState message="Loading request status..." />
        ) : !request ? (
          <EmptyState
            icon="search-off"
            title="Request not found"
            description="This document request could not be found or you do not have access to it."
            actionLabel="Return to Dashboard"
            onAction={() => router.replace('/(resident)')}
          />
        ) : (
          <>
            {/* Summary header */}
            <Card>
              <View className="gap-3">
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1 gap-1">
                    <Text className="text-xl font-bold text-ink">
                      {request.document_type?.name ?? 'Barangay Document'}
                    </Text>
                    <Text className="text-xs font-medium text-ink-subtle">
                      Fee: {formatFee(request.document_type?.fee ?? 0)} · Submitted{' '}
                      {formatDateTime(request.created_at)}
                    </Text>
                  </View>
                  <StatusBadge status={request.status} />
                </View>

                <Text className="text-sm leading-5 text-ink-muted">
                  {getStatusDescription(request.status)}
                </Text>
              </View>
            </Card>

            {/* QR Pickup Pass (Ready only) */}
            {request.status === 'ready' && request.qr_token ? (
              <View className="overflow-hidden rounded-card border border-primary-200 bg-surface">
                <View className="flex-row items-center justify-between bg-primary px-5 py-4">
                  <View className="gap-0.5">
                    <Text className="text-base font-bold text-surface">Official QR Pickup Pass</Text>
                    <Text className="text-xs text-primary-100">
                      Present this pass and a valid ID at the barangay counter
                    </Text>
                  </View>
                  <MaterialIcons name="qr-code-2" size={28} color={colors.accent} />
                </View>

                <View className="items-center gap-4 p-6">
                  <QrCodeMatrix value={request.qr_token} size={220} />

                  <View className="w-full gap-2 rounded-lg border border-border bg-surface-muted p-4">
                    <View className="flex-row justify-between gap-2">
                      <Text className="text-xs text-ink-subtle">Resident</Text>
                      <Text className="text-xs font-semibold text-ink">
                        {profile?.full_name ?? request.resident?.full_name ?? '—'}
                      </Text>
                    </View>
                    <View className="flex-row justify-between gap-2">
                      <Text className="text-xs text-ink-subtle">Document</Text>
                      <Text className="text-xs font-semibold text-ink">
                        {request.document_type?.name ?? '—'}
                      </Text>
                    </View>
                    <View className="flex-row justify-between gap-2">
                      <Text className="text-xs text-ink-subtle">Fee Due at Counter</Text>
                      <Text className="text-xs font-bold text-primary">
                        {formatFee(request.document_type?.fee ?? 0)}
                      </Text>
                    </View>
                    <View className="flex-row justify-between gap-2">
                      <Text className="text-xs text-ink-subtle">Scheduled Pickup</Text>
                      <Text className="text-xs font-semibold text-ink">
                        {request.pickup_slot
                          ? `${formatSlotDate(request.pickup_slot.slot_date)} · ${formatTimeWindow(request.pickup_slot.time_window)}`
                          : 'Not yet booked'}
                      </Text>
                    </View>
                    <View className="flex-row justify-between gap-2 border-t border-border pt-2">
                      <Text className="text-xs text-ink-subtle">Pass Reference</Text>
                      <Text selectable className="font-mono text-xs font-semibold text-ink">
                        {request.qr_token.slice(0, 14)}...
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            ) : null}

            {/* Completed receipt */}
            {request.status === 'completed' ? (
              <Banner
                tone="success"
                title="Document Claimed & Released"
                message={`Verified and released on ${formatDateTime(request.completed_at)}. Per RA 10173, uploaded requirement files will be purged 30 days after completion.`}
              />
            ) : null}

            {/* Rejection notice */}
            {request.status === 'rejected' ? (
              <Banner
                tone="error"
                title="Request Rejected"
                message={request.rejection_reason ?? 'No reason provided.'}
                actionLabel="Submit a New Request"
                onAction={() => router.push('/(resident)/request-new')}
              />
            ) : null}

            {/* Timeline */}
            {request.status !== 'rejected' ? (
              <Card title="Progress Timeline">
                <View className="gap-4">
                  {TIMELINE_STEPS.map((step, index) => {
                    const isDone = activeStep > index || request.status === 'completed';
                    const isCurrent = activeStep === index && request.status !== 'completed';
                    return (
                      <View key={step.key} className="flex-row items-start gap-3">
                        <View
                          className={`mt-0.5 h-7 w-7 items-center justify-center rounded-full border ${
                            isDone
                              ? 'border-emerald-600 bg-emerald-600'
                              : isCurrent
                                ? 'border-primary bg-primary-50'
                                : 'border-border-strong bg-surface'
                          }`}
                        >
                          {isDone ? (
                            <MaterialIcons name="check" size={16} color={colors.surface} />
                          ) : (
                            <View
                              className={`h-2.5 w-2.5 rounded-full ${
                                isCurrent ? 'bg-primary' : 'bg-border-strong'
                              }`}
                            />
                          )}
                        </View>
                        <View className="flex-1 gap-0.5">
                          <Text
                            className={`text-sm font-bold ${
                              isDone || isCurrent ? 'text-ink' : 'text-ink-subtle'
                            }`}
                          >
                            {step.label}
                          </Text>
                          <Text className="text-xs text-ink-muted">{step.detail}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </Card>
            ) : null}

            {/* Pickup Slot */}
            <Card
              title="Pickup Schedule"
              rightSlot={
                canBookSlot ? (
                  <Button
                    label={slotPickerOpen ? 'Close' : request.pickup_slot ? 'Change Slot' : 'Book Slot'}
                    variant="secondary"
                    size="sm"
                    onPress={() => void handleOpenSlotPicker()}
                  />
                ) : null
              }
            >
              <View className="gap-3">
                {request.pickup_slot ? (
                  <View className="flex-row items-center gap-3 rounded-lg border border-border bg-surface-muted p-3.5">
                    <MaterialIcons name="event-available" size={22} color={colors.primary} />
                    <View className="flex-1">
                      <Text className="text-sm font-bold text-ink">
                        {formatSlotDate(request.pickup_slot.slot_date)}
                      </Text>
                      <Text className="text-xs text-ink-muted">
                        {formatTimeWindow(request.pickup_slot.time_window)}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <Text className="text-sm text-ink-muted">
                    {request.status === 'rejected'
                      ? 'Pickup slot was released when this request was rejected.'
                      : 'No pickup slot booked yet. Reserve a counter window so you can claim without waiting.'}
                  </Text>
                )}

                {slotPickerOpen ? (
                  <View className="gap-3 border-t border-border pt-3">
                    {loadingSlots ? (
                      <Text className="text-sm text-ink-muted">Loading available slots...</Text>
                    ) : availableSlots.length === 0 ? (
                      <Text className="text-sm text-ink-muted">
                        No upcoming slots with available capacity were found.
                      </Text>
                    ) : (
                      <View className="gap-2">
                        {availableSlots.map((slot) => {
                          const isCurrent = slot.id === request.pickup_slot_id;
                          const remaining = Math.max(slot.max_capacity - slot.booked_count, 0);
                          return (
                            <View
                              key={slot.id}
                              className="flex-row items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3"
                            >
                              <View className="flex-1">
                                <Text className="text-sm font-semibold text-ink">
                                  {formatSlotDate(slot.slot_date)}
                                </Text>
                                <Text className="text-xs text-ink-muted">
                                  {formatTimeWindow(slot.time_window)} · {remaining} left
                                </Text>
                              </View>
                              <Button
                                label={isCurrent ? 'Booked' : 'Reserve'}
                                size="sm"
                                variant={isCurrent ? 'outline' : 'primary'}
                                disabled={isCurrent || bookingSlotId !== null}
                                loading={bookingSlotId === slot.id}
                                onPress={() => void handleBookSlot(slot.id)}
                              />
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                ) : null}
              </View>
            </Card>

            {/* Purpose */}
            <Card
              title="Purpose"
              rightSlot={
                isPending && !editingPurpose ? (
                  <Button
                    label="Edit"
                    variant="ghost"
                    size="sm"
                    icon="edit"
                    onPress={() => setEditingPurpose(true)}
                  />
                ) : null
              }
            >
              {editingPurpose ? (
                <View className="gap-3">
                  <TextField
                    label="Update purpose"
                    value={purposeDraft}
                    onChangeText={setPurposeDraft}
                    multiline
                    numberOfLines={3}
                    maxLength={500}
                    editable={!savingPurpose}
                  />
                  <View className="flex-row gap-2">
                    <Button
                      label="Save"
                      size="sm"
                      loading={savingPurpose}
                      onPress={() => void handleSavePurpose()}
                    />
                    <Button
                      label="Cancel"
                      variant="outline"
                      size="sm"
                      disabled={savingPurpose}
                      onPress={() => {
                        setPurposeDraft(request.purpose);
                        setEditingPurpose(false);
                      }}
                    />
                  </View>
                </View>
              ) : (
                <Text className="text-sm leading-6 text-ink">{request.purpose}</Text>
              )}
            </Card>

            {/* Requirements */}
            <Card
              title="Uploaded Requirements"
              subtitle={
                isPending
                  ? 'You can add or replace requirement files until barangay staff begin reviewing.'
                  : 'Files are locked during and after review.'
              }
            >
              <View className="gap-3">
                {(request.document_type?.required_docs ?? []).map((spec) => {
                  const files = attachmentsByDocType.get(spec.key) ?? [];
                  return (
                    <View
                      key={spec.key}
                      className="gap-2 rounded-lg border border-border bg-surface-muted p-3.5"
                    >
                      <View className="flex-row items-center justify-between gap-2">
                        <Text className="flex-1 text-sm font-bold text-ink">{spec.label}</Text>
                        {files.length > 0 ? (
                          <MaterialIcons name="check-circle" size={18} color={colors.success} />
                        ) : (
                          <Text className="text-xs font-semibold text-red-700">Missing</Text>
                        )}
                      </View>

                      {files.map((att) => (
                        <View
                          key={att.id}
                          className="flex-row items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2"
                        >
                          <View className="flex-1">
                            <Text className="text-xs font-semibold text-ink" numberOfLines={1}>
                              {att.storage_path.split('/').pop()}
                            </Text>
                            <Text className="text-[11px] text-ink-subtle">
                              Uploaded {formatDateTime(att.uploaded_at)}
                            </Text>
                          </View>
                          <View className="flex-row items-center gap-1.5">
                            <Button
                              label="View"
                              variant="outline"
                              size="sm"
                              loading={viewingAttachmentId === att.id}
                              onPress={() => void handleViewAttachment(att)}
                            />
                            {isPending ? (
                              <Pressable
                                onPress={() => void handleDeleteAttachment(att)}
                                disabled={busyDocType === spec.key}
                                accessibilityLabel={`Delete ${spec.label}`}
                                className="p-1.5"
                              >
                                <MaterialIcons name="delete-outline" size={20} color={colors.danger} />
                              </Pressable>
                            ) : null}
                          </View>
                        </View>
                      ))}

                      {isPending && files.length === 0 ? (
                        <Button
                          label="Upload File"
                          icon="upload-file"
                          variant="outline"
                          size="sm"
                          loading={busyDocType === spec.key}
                          onPress={() => void handleUploadForDocType(spec.key)}
                        />
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </Card>
          </>
        )}
      </View>
    </ScrollView>
  );
}
