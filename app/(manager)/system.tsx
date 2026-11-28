import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Banner, EmptyState, LoadingState } from '@/components/StateView';
import { formatFee } from '@/constants/format';
import { useManagerData } from '@/contexts/ManagerDataContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
  runManagerRetentionPurge,
  updateDocumentTypeConfig,
} from '@/services/managerService';
import { toServiceError } from '@/services/supabase';
import type { DocumentType, PurgeAttachmentsResponse } from '@/types/database';

export default function ManagerSystemScreen() {
  const { colors, themeVars } = useTheme();
  const { data, loading, refreshing, error, refresh } = useManagerData();

  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(
    null
  );

  // Document type editor modal
  const [editingDoc, setEditingDoc] = useState<DocumentType | null>(null);
  const [draftFee, setDraftFee] = useState('0');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftActive, setDraftActive] = useState(true);
  const [savingDoc, setSavingDoc] = useState(false);

  // Retention purge state
  const [retentionDaysInput, setRetentionDaysInput] = useState('30');
  const [purgeBusy, setPurgeBusy] = useState(false);
  const [lastPurgeResult, setLastPurgeResult] = useState<PurgeAttachmentsResponse | null>(null);

  function openDocEditor(doc: DocumentType) {
    setEditingDoc(doc);
    setDraftFee(String(doc.fee));
    setDraftDescription(doc.description);
    setDraftActive(doc.is_active);
    setFeedback(null);
  }

  async function handleSaveDoc() {
    if (!editingDoc) return;
    const numericFee = Number.parseFloat(draftFee.trim());
    if (!Number.isFinite(numericFee) || numericFee < 0 || numericFee > 100000) {
      setFeedback({
        tone: 'error',
        message: 'Enter a valid fee amount between PHP 0 and PHP 100,000.',
      });
      return;
    }

    setSavingDoc(true);
    setFeedback(null);
    try {
      const res = await updateDocumentTypeConfig({
        documentTypeId: editingDoc.id,
        fee: numericFee,
        isActive: draftActive,
        description: draftDescription.trim(),
      });
      await refresh({ silent: true });
      setFeedback({ tone: 'success', message: res.message });
      setEditingDoc(null);
    } catch (err) {
      setFeedback({
        tone: 'error',
        message: toServiceError(err, 'Unable to update document type.').message,
      });
    } finally {
      setSavingDoc(false);
    }
  }

  async function handleRetentionPurge(dryRun: boolean) {
    const parsedDays = Number.parseInt(retentionDaysInput.trim(), 10);
    if (!Number.isInteger(parsedDays) || parsedDays < 1 || parsedDays > 365) {
      setFeedback({
        tone: 'error',
        message: 'Retention days must be a whole number between 1 and 365.',
      });
      return;
    }

    setPurgeBusy(true);
    setFeedback(null);
    try {
      const res = await runManagerRetentionPurge({ dryRun, retentionDays: parsedDays });
      if (res.purgeResult) {
        setLastPurgeResult(res.purgeResult);
      }
      if (!dryRun) {
        await refresh({ silent: true });
      }
      setFeedback({ tone: 'success', message: res.message });
    } catch (err) {
      setFeedback({
        tone: 'error',
        message: toServiceError(err, 'Unable to run attachment retention purge.').message,
      });
    } finally {
      setPurgeBusy(false);
    }
  }

  if (loading && !data) {
    return (
      <View className="flex-1 p-6">
        <LoadingState message="Loading platform configuration..." />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        className="flex-1 bg-surface-muted"
        contentContainerStyle={{ padding: 20, gap: 18 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh({ silent: true })}
            tintColor={colors.primary}
          />
        }
      >
        <View className="flex-row flex-wrap items-center justify-between gap-3">
          <View className="flex-1 gap-0.5">
            <Text className="text-2xl font-extrabold text-ink">
              Platform &amp; RA 10173 Maintenance
            </Text>
            <Text className="text-sm text-ink-muted">
              Configure the document types catalog and trigger automated 30-day attachment retention
              purges.
            </Text>
          </View>
          <Button
            label="Refresh"
            variant="outline"
            size="sm"
            icon="refresh"
            loading={refreshing}
            onPress={() => void refresh({ silent: true })}
          />
        </View>

        {error ? <Banner tone="error" message={error} /> : null}
        {feedback ? <Banner tone={feedback.tone} message={feedback.message} /> : null}

        {/* Section 1: Document Catalogue */}
        <Card
          title="Document Types Catalogue"
          subtitle="Manage system-wide fees and availability for barangay certificate types."
        >
          {!data || data.documentTypes.length === 0 ? (
            <EmptyState
              icon="description"
              title="No document types configured"
              description="Document catalogue items seeded in Supabase will appear here."
            />
          ) : (
            <View className="gap-2.5">
              {data.documentTypes.map((doc) => (
                <View
                  key={doc.id}
                  className="flex-row flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-surface-muted p-4"
                >
                  <View className="min-w-[220px] flex-1 gap-1">
                    <View className="flex-row flex-wrap items-center gap-2">
                      <Text className="text-base font-bold text-ink">{doc.name}</Text>
                      <View className="rounded-full border border-primary-200 bg-primary-50 px-2.5 py-0.5">
                        <Text className="text-xs font-bold text-primary">
                          {formatFee(doc.fee)}
                        </Text>
                      </View>
                      <View
                        className={`rounded-full px-2 py-0.5 ${
                          doc.is_active
                            ? 'bg-emerald-100 dark:bg-emerald-950'
                            : 'bg-surface'
                        }`}
                      >
                        <Text
                          className={`text-[10px] font-bold uppercase ${
                            doc.is_active
                              ? 'text-emerald-800 dark:text-emerald-300'
                              : 'text-ink-subtle'
                          }`}
                        >
                          {doc.is_active ? 'Active' : 'Disabled'}
                        </Text>
                      </View>
                    </View>
                    <Text className="text-xs leading-5 text-ink-muted">{doc.description}</Text>
                  </View>

                  <Button
                    label="Edit"
                    size="sm"
                    variant="outline"
                    icon="edit"
                    onPress={() => openDocEditor(doc)}
                  />
                </View>
              ))}
            </View>
          )}
        </Card>

        {/* Section 2: RA 10173 30-Day Retention Purge */}
        <Card
          title="RA 10173 Attachment Retention Purge"
          subtitle="Purges expired ID files from private Storage on requests completed or rejected past the retention period. Counts only — zero PII viewed."
        >
          <View className="gap-4">
            <View className="gap-1.5">
              <Text className="text-xs font-semibold text-ink">
                Retention Window (Days, default 30)
              </Text>
              <TextInput
                value={retentionDaysInput}
                onChangeText={setRetentionDaysInput}
                keyboardType="number-pad"
                editable={!purgeBusy}
                className="max-w-[160px] rounded-xl border border-border-strong bg-surface-input px-3.5 py-2.5 text-sm font-semibold text-ink"
              />
            </View>

            <View className="flex-row flex-wrap gap-2.5">
              <Button
                label="Preview Expired Count (Dry Run)"
                variant="outline"
                size="sm"
                icon="search"
                loading={purgeBusy}
                onPress={() => void handleRetentionPurge(true)}
              />
              <Button
                label="Purge Expired Attachments"
                variant="danger"
                size="sm"
                icon="cleaning-services"
                loading={purgeBusy}
                onPress={() => void handleRetentionPurge(false)}
              />
            </View>

            {lastPurgeResult ? (
              <View className="gap-1.5 rounded-xl border border-border bg-surface-muted p-3.5">
                <Text className="text-xs font-bold uppercase tracking-wider text-ink-subtle">
                  {lastPurgeResult.dryRun ? 'Dry Run Summary' : 'Purge Result'} ({lastPurgeResult.retentionDays} days)
                </Text>
                <Text className="text-sm text-ink">
                  Eligible attachments: <Text className="font-bold">{lastPurgeResult.matchedCount}</Text> ·
                  Purged: <Text className="font-bold">{lastPurgeResult.purgedCount}</Text> ·
                  Failed: <Text className="font-bold">{lastPurgeResult.failedCount}</Text> ·
                  Requests affected:{' '}
                  <Text className="font-bold">{lastPurgeResult.affectedRequestCount}</Text>
                </Text>
              </View>
            ) : null}
          </View>
        </Card>
      </ScrollView>

      {/* Edit Document Type Modal */}
      <Modal
        visible={Boolean(editingDoc)}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!savingDoc) setEditingDoc(null);
        }}
      >
        <View
          style={themeVars}
          className="flex-1 items-center justify-center bg-black/60 px-4 py-6"
        >
          <View className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-xl">
            <View className="mb-4 flex-row items-center justify-between">
              <View className="flex-1 gap-0.5 pr-2">
                <Text className="text-base font-bold text-ink">Edit Document Configuration</Text>
                <Text className="text-xs text-ink-muted" numberOfLines={1}>
                  {editingDoc?.name}
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  if (!savingDoc) setEditingDoc(null);
                }}
                hitSlop={8}
              >
                <MaterialIcons name="close" size={20} color={colors.inkMuted} />
              </Pressable>
            </View>

            <View className="gap-4">
              <View className="gap-1.5">
                <Text className="text-xs font-semibold text-ink">Fee (PHP, 0 = Free)</Text>
                <TextInput
                  value={draftFee}
                  onChangeText={setDraftFee}
                  keyboardType="decimal-pad"
                  editable={!savingDoc}
                  className="rounded-xl border border-border-strong bg-surface-input px-3.5 py-2.5 text-sm font-semibold text-ink"
                />
              </View>

              <View className="gap-1.5">
                <Text className="text-xs font-semibold text-ink">Description</Text>
                <TextInput
                  value={draftDescription}
                  onChangeText={setDraftDescription}
                  multiline
                  numberOfLines={3}
                  editable={!savingDoc}
                  className="min-h-[84px] rounded-xl border border-border-strong bg-surface-input px-3.5 py-2.5 text-sm text-ink"
                  textAlignVertical="top"
                />
              </View>

              <Pressable
                onPress={() => setDraftActive((prev) => !prev)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: draftActive }}
                className="flex-row items-center justify-between rounded-xl border border-border bg-surface-muted px-3.5 py-3"
              >
                <Text className="text-sm font-semibold text-ink">Available to Residents</Text>
                <MaterialIcons
                  name={draftActive ? 'check-circle' : 'cancel'}
                  size={20}
                  color={draftActive ? colors.success : colors.inkSubtle}
                />
              </Pressable>

              <View className="flex-row justify-end gap-2.5">
                <Button
                  label="Cancel"
                  variant="outline"
                  size="sm"
                  disabled={savingDoc}
                  onPress={() => setEditingDoc(null)}
                />
                <Button
                  label="Save"
                  variant="primary"
                  size="sm"
                  loading={savingDoc}
                  onPress={() => void handleSaveDoc()}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
