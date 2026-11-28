import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Banner, EmptyState, LoadingState } from '@/components/StateView';
import { StatusBadge } from '@/components/StatusBadge';
import { TextField } from '@/components/TextField';
import {
  formatAuditAction,
  formatDateTime,
  formatFee,
  formatSlotDate,
  formatTimeWindow,
} from '@/constants/format';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { listAuditLogs } from '@/services/auditService';
import {
  approveRequest,
  getRequestById,
  notifyResident,
  rejectRequest,
  startReview,
  subscribeToRequest,
} from '@/services/requestService';
import { getSignedAttachmentUrl, SIGNED_URL_TTL_SECONDS } from '@/services/storageService';
import { toServiceError } from '@/services/supabase';
import type {
  AuditLog,
  NotifyResidentPayload,
  RequestAttachment,
  RequestWithDetails,
} from '@/types/database';

interface ActiveSignedPreview {
  attachmentId: string;
  label: string;
  fileName: string;
  isPdf: boolean;
  signedUrl: string;
  expiresAt: number;
}

function isPdfPath(storagePath: string): boolean {
  return storagePath.toLowerCase().endsWith('.pdf');
}

function getExpiryTimestamp(ttlSeconds: number): number {
  return Date.now() + ttlSeconds * 1000;
}

export default function AdminRequestReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { colors } = useTheme();

  const [request, setRequest] = useState<RequestWithDetails | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [feedback, setFeedback] = useState<{
    tone: 'success' | 'error' | 'warning' | 'info';
    message: string;
  } | null>(null);

  // Workflow controls
  const [sendNotification, setSendNotification] = useState(true);
  const [rejectionMode, setRejectionMode] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [busyAction, setBusyAction] = useState<
    'reviewing' | 'ready' | 'rejected' | 'reminder' | null
  >(null);

  // 60-second signed requirement viewer
  const [mintingId, setMintingId] = useState<string | null>(null);
  const [activePreview, setActivePreview] = useState<ActiveSignedPreview | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  const refreshAll = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (!id) return;
      if (!options.silent) setLoading(true);
      setLoadError(null);
      try {
        const [reqData, logs] = await Promise.all([
          getRequestById(id),
          listAuditLogs({ requestId: id, limit: 30 }),
        ]);
        setRequest(reqData);
        setAuditLogs(logs);
      } catch (error) {
        setLoadError(toServiceError(error, 'Unable to load request record.').message);
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
    void Promise.all([
      getRequestById(id),
      listAuditLogs({ requestId: id, limit: 30 }),
    ])
      .then(([reqData, logs]) => {
        if (!active) return;
        setRequest(reqData);
        setAuditLogs(logs);
        setLoadError(null);
      })
      .catch((error) => {
        if (!active) return;
        setLoadError(toServiceError(error, 'Unable to load request record.').message);
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
      void refreshAll({ silent: true });
    });
    return unsubscribe;
  }, [id, refreshAll]);

  // Live countdown timer for active 60-second signed URL
  useEffect(() => {
    if (!activePreview) return;
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((activePreview.expiresAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        setActivePreview(null);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [activePreview]);

  const attachmentsByDocType = useMemo(() => {
    const map = new Map<string, RequestAttachment[]>();
    for (const att of request?.attachments ?? []) {
      const existing = map.get(att.doc_type);
      if (existing) existing.push(att);
      else map.set(att.doc_type, [att]);
    }
    return map;
  }, [request?.attachments]);

  const isOwnRequest = Boolean(request && user?.id && request.resident_id === user.id);

  async function openExternalUrl(url: string) {
    if (Platform.OS === 'web') {
      await Linking.openURL(url);
    } else {
      await WebBrowser.openBrowserAsync(url);
    }
  }

  async function handleViewSignedAttachment(attachment: RequestAttachment, label: string) {
    if (!request) return;
    setMintingId(attachment.id);
    setFeedback(null);

    try {
      const { signedUrl, expiresIn } = await getSignedAttachmentUrl(attachment.storage_path, {
        requestId: request.id,
        logAudit: true,
      });

      const pdf = isPdfPath(attachment.storage_path);
      const fileName = attachment.storage_path.split('/').pop() ?? label;
      const expiresAt = getExpiryTimestamp(expiresIn);

      setSecondsLeft(expiresIn);
      setActivePreview({
        attachmentId: attachment.id,
        label,
        fileName,
        isPdf: pdf,
        signedUrl,
        expiresAt,
      });

      // Refresh audit log so the new attachment_viewed entry shows immediately.
      void listAuditLogs({ requestId: request.id, limit: 30 })
        .then(setAuditLogs)
        .catch(() => {});

      if (pdf) {
        await openExternalUrl(signedUrl);
      }
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: toServiceError(error, 'Unable to mint 60-second signed link.').message,
      });
    } finally {
      setMintingId(null);
    }
  }

  async function maybeDispatchNotification(
    requestId: string,
    event: NotifyResidentPayload['event']
  ): Promise<string> {
    if (!sendNotification) return '';
    try {
      const result = await notifyResident({ requestId, event });
      return result.deliveredVia === 'email'
        ? ' Resident notified by email.'
        : ' Resident alert logged (in-app Realtime active).';
    } catch (error) {
      return ` Status saved, but notification failed: ${toServiceError(error).message}`;
    }
  }

  async function handleStartReview() {
    if (!request) return;
    setBusyAction('reviewing');
    setFeedback(null);
    try {
      await startReview(request.id);
      const notifyNote = await maybeDispatchNotification(request.id, 'reviewing');
      await refreshAll({ silent: true });
      setFeedback({ tone: 'success', message: `Request moved to Under Review.${notifyNote}` });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: toServiceError(error, 'Unable to start review.').message,
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleApprove() {
    if (!request) return;
    setBusyAction('ready');
    setFeedback(null);
    try {
      await approveRequest(request.id);
      const notifyNote = await maybeDispatchNotification(request.id, 'ready');
      await refreshAll({ silent: true });
      setRejectionMode(false);
      setFeedback({
        tone: 'success',
        message: `Request approved and QR pickup pass generated.${notifyNote}`,
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: toServiceError(error, 'Unable to approve request.').message,
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleReject() {
    if (!request) return;
    const trimmed = rejectionReason.trim();
    if (trimmed.length < 3) {
      setFeedback({
        tone: 'error',
        message: 'Enter a clear rejection reason (at least 3 characters).',
      });
      return;
    }

    setBusyAction('rejected');
    setFeedback(null);
    try {
      await rejectRequest(request.id, trimmed);
      const notifyNote = await maybeDispatchNotification(request.id, 'rejected');
      await refreshAll({ silent: true });
      setRejectionMode(false);
      setRejectionReason('');
      setFeedback({
        tone: 'success',
        message: `Request rejected and any booked slot has been released.${notifyNote}`,
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: toServiceError(error, 'Unable to reject request.').message,
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSendReminder() {
    if (!request) return;
    setBusyAction('reminder');
    setFeedback(null);
    try {
      const result = await notifyResident({
        requestId: request.id,
        event: 'slot_reminder',
      });
      await refreshAll({ silent: true });
      setFeedback({
        tone: 'success',
        message:
          result.deliveredVia === 'email'
            ? 'Pickup reminder email sent to the resident.'
            : 'Pickup reminder recorded in the audit trail.',
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: toServiceError(error, 'Unable to send pickup reminder.').message,
      });
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <ScrollView
      className="flex-1 bg-surface-muted"
      contentContainerStyle={{ padding: 24, paddingBottom: 44 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void refreshAll({ silent: true });
          }}
          tintColor={colors.primary}
        />
      }
    >
      <View className="mx-auto w-full max-w-6xl gap-6">
        {/* Top bar */}
        <View className="flex-row flex-wrap items-center justify-between gap-3">
          <Pressable
            onPress={() => router.replace('/(admin)')}
            accessibilityRole="button"
            className="flex-row items-center gap-1.5 py-1"
          >
            <MaterialIcons name="arrow-back" size={20} color={colors.ink} />
            <Text className="text-sm font-semibold text-ink">Back to Queue Overview</Text>
          </Pressable>

          {request ? (
            <View className="flex-row items-center gap-2">
              <StatusBadge status={request.status} />
            </View>
          ) : null}
        </View>

        {feedback ? <Banner tone={feedback.tone} message={feedback.message} /> : null}

        {loadError ? (
          <Banner
            tone="error"
            message={loadError}
            actionLabel="Retry"
            onAction={() => void refreshAll()}
          />
        ) : null}

        {loading ? (
          <LoadingState message="Loading request record and audit trail..." />
        ) : !request ? (
          <EmptyState
            icon="search-off"
            title="Request not found"
            description="This document request no longer exists."
            actionLabel="Return to Queue"
            onAction={() => router.replace('/(admin)')}
          />
        ) : (
          <View className="gap-6 lg:flex-row lg:items-start">
            {/* Left / Main column */}
            <View className="flex-[1.5] gap-6">
              {/* Document & Resident details */}
              <Card
                title={request.document_type?.name ?? 'Barangay Document'}
                subtitle={`Fee: ${formatFee(request.document_type?.fee ?? 0)} · Submitted ${formatDateTime(request.created_at)}`}
                rightSlot={
                  <Text className="font-mono text-xs text-ink-subtle">
                    #{request.id.slice(0, 8)}
                  </Text>
                }
              >
                <View className="gap-4">
                  <View className="gap-2 rounded-lg border border-border bg-surface-muted p-4">
                    <Text className="text-xs font-bold uppercase tracking-wider text-ink-subtle">
                      Resident Details
                    </Text>
                    <View className="gap-1.5">
                      <Text className="text-base font-bold text-ink">
                        {request.resident?.full_name ?? 'Unknown Resident'}
                      </Text>
                      <Text className="text-sm text-ink-muted">
                        Contact: {request.resident?.contact_number ?? '—'}
                      </Text>
                      <Text className="text-sm text-ink-muted">
                        Address: {request.resident?.address ?? '—'}
                      </Text>
                    </View>
                  </View>

                  <View className="gap-1">
                    <Text className="text-xs font-bold uppercase tracking-wider text-ink-subtle">
                      Stated Purpose
                    </Text>
                    <Text className="text-sm leading-6 text-ink">{request.purpose}</Text>
                  </View>

                  <View className="flex-row flex-wrap gap-4 border-t border-border pt-3">
                    <View className="min-w-[180px] flex-1 gap-0.5">
                      <Text className="text-xs font-bold uppercase tracking-wider text-ink-subtle">
                        Pickup Slot
                      </Text>
                      <Text className="text-sm font-semibold text-ink">
                        {request.pickup_slot
                          ? `${formatSlotDate(request.pickup_slot.slot_date)} · ${formatTimeWindow(request.pickup_slot.time_window)}`
                          : 'No slot booked'}
                      </Text>
                    </View>
                    <View className="min-w-[140px] flex-1 gap-0.5">
                      <Text className="text-xs font-bold uppercase tracking-wider text-ink-subtle">
                        Reviewed By
                      </Text>
                      <Text className="text-sm font-semibold text-ink">
                        {request.reviewer?.full_name ?? 'Unassigned'}
                      </Text>
                    </View>
                  </View>
                </View>
              </Card>

              {/* Requirement Viewer (60-second signed URLs) */}
              <Card
                title="Requirement Viewer (Private Storage)"
                subtitle={`Every file opens through a ${SIGNED_URL_TTL_SECONDS}-second signed link and records an immutable attachment_viewed audit entry (RA 10173).`}
              >
                <View className="gap-4">
                  {/* Active inline preview */}
                  {activePreview ? (
                    <View className="overflow-hidden rounded-lg border border-primary-200 bg-surface-muted">
                      <View className="flex-row flex-wrap items-center justify-between gap-2 border-b border-border bg-primary-50 px-4 py-2.5">
                        <View className="flex-1 flex-row items-center gap-2">
                          <MaterialIcons name="lock-clock" size={18} color={colors.primary} />
                          <Text className="flex-1 text-xs font-bold text-primary" numberOfLines={1}>
                            {activePreview.label} · Signed link expires in {secondsLeft}s
                          </Text>
                        </View>
                        <View className="flex-row items-center gap-2">
                          <Button
                            label={activePreview.isPdf ? 'Open PDF' : 'Open Full'}
                            variant="outline"
                            size="sm"
                            icon="open-in-new"
                            onPress={() => void openExternalUrl(activePreview.signedUrl)}
                          />
                          <Pressable
                            onPress={() => setActivePreview(null)}
                            accessibilityLabel="Close preview"
                            className="p-1"
                          >
                            <MaterialIcons name="close" size={20} color={colors.inkMuted} />
                          </Pressable>
                        </View>
                      </View>

                      {activePreview.isPdf ? (
                        <View className="items-center gap-2 p-6">
                          <MaterialIcons name="picture-as-pdf" size={36} color={colors.primary} />
                          <Text className="text-sm font-semibold text-ink">
                            {activePreview.fileName}
                          </Text>
                          <Text className="text-center text-xs text-ink-muted">
                            PDF opened in a separate tab/browser. Temporary link automatically
                            expires in {secondsLeft} seconds.
                          </Text>
                        </View>
                      ) : (
                        <View className="items-center bg-surface p-3">
                          <Image
                            source={{ uri: activePreview.signedUrl }}
                            resizeMode="contain"
                            style={{ width: '100%', height: 340 }}
                            accessibilityLabel={`Preview of ${activePreview.label}`}
                          />
                        </View>
                      )}
                    </View>
                  ) : null}

                  {/* Checklist of required documents */}
                  <View className="gap-3">
                    {(request.document_type?.required_docs ?? []).map((spec) => {
                      const files = attachmentsByDocType.get(spec.key) ?? [];
                      return (
                        <View
                          key={spec.key}
                          className="gap-2 rounded-lg border border-border bg-surface-muted p-4"
                        >
                          <View className="flex-row items-center justify-between gap-2">
                            <View className="flex-1">
                              <Text className="text-sm font-bold text-ink">{spec.label}</Text>
                              <Text className="text-xs text-ink-muted">{spec.description}</Text>
                            </View>
                            {files.length > 0 ? (
                              <MaterialIcons name="check-circle" size={18} color={colors.success} />
                            ) : (
                              <Text className="text-xs font-bold text-red-700 dark:text-red-400">
                                Not uploaded
                              </Text>
                            )}
                          </View>

                          {files.map((att) => (
                            <View
                              key={att.id}
                              className="flex-row flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2.5"
                            >
                              <View className="flex-1 flex-row items-center gap-2">
                                <MaterialIcons
                                  name={isPdfPath(att.storage_path) ? 'picture-as-pdf' : 'image'}
                                  size={18}
                                  color={colors.primary}
                                />
                                <View className="flex-1">
                                  <Text className="text-xs font-semibold text-ink" numberOfLines={1}>
                                    {att.storage_path.split('/').pop()}
                                  </Text>
                                  <Text className="text-[11px] text-ink-subtle">
                                    Uploaded {formatDateTime(att.uploaded_at)}
                                  </Text>
                                </View>
                              </View>
                              <Button
                                label="View (60s)"
                                icon="visibility"
                                variant="secondary"
                                size="sm"
                                loading={mintingId === att.id}
                                onPress={() => void handleViewSignedAttachment(att, spec.label)}
                              />
                            </View>
                          ))}
                        </View>
                      );
                    })}
                  </View>
                </View>
              </Card>
            </View>

            {/* Right column: Workflow actions + Audit trail */}
            <View className="flex-1 gap-6">
              <Card
                title="Workflow Decision"
                subtitle="Transitions are enforced by Postgres RLS and triggers."
              >
                <View className="gap-4">
                  {isOwnRequest ? (
                    <Banner
                      tone="warning"
                      title="Separation of duties"
                      message="Staff cannot review, approve, or reject their own document requests."
                    />
                  ) : null}

                  {(request.status === 'pending' || request.status === 'reviewing') && !isOwnRequest ? (
                    <>
                      <Pressable
                        onPress={() => setSendNotification((prev) => !prev)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: sendNotification }}
                        className="flex-row items-center gap-2 rounded-lg border border-border bg-surface-muted px-3 py-2.5"
                      >
                        <MaterialIcons
                          name={sendNotification ? 'check-box' : 'check-box-outline-blank'}
                          size={20}
                          color={sendNotification ? colors.primary : colors.inkSubtle}
                        />
                        <Text className="flex-1 text-xs font-medium text-ink">
                          Notify resident via `/api/notify-resident` after status change
                        </Text>
                      </Pressable>

                      {request.status === 'pending' ? (
                        <Button
                          label="Start Review"
                          icon="rate-review"
                          loading={busyAction === 'reviewing'}
                          disabled={busyAction !== null}
                          onPress={() => void handleStartReview()}
                          fullWidth
                        />
                      ) : (
                        <Button
                          label="Approve & Issue QR Pass"
                          icon="qr-code-2"
                          loading={busyAction === 'ready'}
                          disabled={busyAction !== null}
                          onPress={() => void handleApprove()}
                          fullWidth
                        />
                      )}

                      {rejectionMode ? (
                        <View className="gap-3 rounded-lg border border-red-200 bg-red-50 p-3.5 dark:border-red-800 dark:bg-red-950/50">
                          <TextField
                            label="Reason for rejection"
                            value={rejectionReason}
                            onChangeText={setRejectionReason}
                            placeholder="e.g. Uploaded ID is blurry or expired; please re-submit a clear photo."
                            multiline
                            numberOfLines={3}
                            maxLength={300}
                            editable={busyAction === null}
                            required
                          />
                          <View className="flex-row gap-2">
                            <Button
                              label="Confirm Rejection"
                              variant="danger"
                              size="sm"
                              icon="cancel"
                              loading={busyAction === 'rejected'}
                              disabled={busyAction !== null}
                              onPress={() => void handleReject()}
                            />
                            <Button
                              label="Cancel"
                              variant="outline"
                              size="sm"
                              disabled={busyAction !== null}
                              onPress={() => {
                                setRejectionMode(false);
                                setRejectionReason('');
                              }}
                            />
                          </View>
                        </View>
                      ) : (
                        <Button
                          label="Reject Request"
                          variant="danger"
                          icon="cancel"
                          disabled={busyAction !== null}
                          onPress={() => setRejectionMode(true)}
                          fullWidth
                        />
                      )}
                    </>
                  ) : null}

                  {request.status === 'ready' ? (
                    <View className="gap-3">
                      <Banner
                        tone="info"
                        title="Ready for Counter Pickup"
                        message="A cryptographic QR pickup pass has been issued. Scan the resident's pass at the counter to complete release."
                      />
                      {request.qr_token ? (
                        <View className="rounded-lg border border-border bg-surface-muted px-3 py-2">
                          <Text className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
                            Pass Reference
                          </Text>
                          <Text selectable className="font-mono text-xs font-semibold text-ink">
                            {request.qr_token.slice(0, 14)}...
                          </Text>
                        </View>
                      ) : null}
                      <Button
                        label="Open QR Verification Scanner"
                        icon="qr-code-scanner"
                        onPress={() => router.push('/(admin)/scanner')}
                        fullWidth
                      />
                      <Button
                        label="Send Pickup Reminder"
                        variant="outline"
                        icon="notifications-active"
                        loading={busyAction === 'reminder'}
                        disabled={busyAction !== null}
                        onPress={() => void handleSendReminder()}
                        fullWidth
                      />
                    </View>
                  ) : null}

                  {request.status === 'completed' ? (
                    <Banner
                      tone="success"
                      title="Verified & Released"
                      message={`Completed on ${formatDateTime(request.completed_at)}.`}
                    />
                  ) : null}

                  {request.status === 'rejected' ? (
                    <Banner
                      tone="error"
                      title="Rejected"
                      message={request.rejection_reason ?? 'No reason recorded.'}
                    />
                  ) : null}
                </View>
              </Card>

              {/* Append-only Audit Trail */}
              <Card
                title="Audit Trail"
                subtitle="Append-only record of lifecycle & ID access events."
              >
                {auditLogs.length === 0 ? (
                  <Text className="text-xs text-ink-muted">No audit events recorded yet.</Text>
                ) : (
                  <View className="gap-3">
                    {auditLogs.map((log) => (
                      <View
                        key={log.id}
                        className="gap-0.5 border-l-2 border-primary-200 pl-3"
                      >
                        <Text className="text-xs font-bold text-ink">
                          {formatAuditAction(log.action)}
                        </Text>
                        <Text className="text-[11px] text-ink-subtle">
                          {formatDateTime(log.created_at)}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </Card>
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
