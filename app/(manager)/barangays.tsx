import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Banner, EmptyState, LoadingState } from '@/components/StateView';
import { formatDateTime } from '@/constants/format';
import { useManagerData } from '@/contexts/ManagerDataContext';
import { useTheme } from '@/contexts/ThemeContext';
import { reviewBarangayAdminRequest, toggleBarangayActive } from '@/services/managerService';
import { toServiceError } from '@/services/supabase';

export default function ManagerBarangaysScreen() {
  const { colors } = useTheme();
  const { data, loading, refreshing, error, refresh } = useManagerData();

  const [showAllRequests, setShowAllRequests] = useState(false);
  const [barangaySearch, setBarangaySearch] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(
    null
  );

  const visibleRequests = useMemo(() => {
    const all = data?.adminRequests ?? [];
    if (showAllRequests) return all;
    return all.filter((r) => r.status === 'pending');
  }, [data?.adminRequests, showAllRequests]);

  const filteredBarangays = useMemo(() => {
    const all = data?.barangays ?? [];
    const q = barangaySearch.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.cityMunicipality.toLowerCase().includes(q) ||
        b.province.toLowerCase().includes(q)
    );
  }, [data?.barangays, barangaySearch]);

  async function handleReviewRequest(
    requestId: string,
    decision: 'approved' | 'rejected',
    promoteApplicant: boolean
  ) {
    setBusyKey(`req-${requestId}`);
    setFeedback(null);
    try {
      const res = await reviewBarangayAdminRequest({
        requestId,
        decision,
        promoteApplicant,
      });
      await refresh({ silent: true });
      setFeedback({ tone: 'success', message: res.message });
    } catch (err) {
      setFeedback({
        tone: 'error',
        message: toServiceError(err, 'Unable to update onboarding request.').message,
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function handleToggleBarangay(barangayId: string, nextActive: boolean) {
    setBusyKey(`brgy-${barangayId}`);
    setFeedback(null);
    try {
      const res = await toggleBarangayActive(barangayId, nextActive);
      await refresh({ silent: true });
      setFeedback({ tone: 'success', message: res.message });
    } catch (err) {
      setFeedback({
        tone: 'error',
        message: toServiceError(err, 'Unable to update barangay status.').message,
      });
    } finally {
      setBusyKey(null);
    }
  }

  if (loading && !data) {
    return (
      <View className="flex-1 p-6">
        <LoadingState message="Loading barangays and onboarding requests..." />
      </View>
    );
  }

  return (
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
            Barangays &amp; Onboarding
          </Text>
          <Text className="text-sm text-ink-muted">
            Review Barangay Admin requests emailed to docudash.app@gmail.com and manage active
            LGU offices.
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

      {/* Section 1: Barangay Admin Onboarding Requests */}
      <Card
        title="Barangay Admin Requests"
        subtitle="Approving registers or activates the barangay office and optionally promotes the applicant account."
        rightSlot={
          <View className="flex-row gap-1.5">
            <Pressable
              onPress={() => setShowAllRequests(false)}
              className={`rounded-full border px-3 py-1 ${
                !showAllRequests
                  ? 'border-primary bg-primary-50'
                  : 'border-border bg-surface-muted'
              }`}
            >
              <Text
                className={`text-xs font-semibold ${
                  !showAllRequests ? 'text-primary' : 'text-ink-muted'
                }`}
              >
                Pending ({data?.metrics.pendingAdminRequests ?? 0})
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setShowAllRequests(true)}
              className={`rounded-full border px-3 py-1 ${
                showAllRequests
                  ? 'border-primary bg-primary-50'
                  : 'border-border bg-surface-muted'
              }`}
            >
              <Text
                className={`text-xs font-semibold ${
                  showAllRequests ? 'text-primary' : 'text-ink-muted'
                }`}
              >
                All ({data?.adminRequests.length ?? 0})
              </Text>
            </Pressable>
          </View>
        }
      >
        {visibleRequests.length === 0 ? (
          <EmptyState
            icon="check-circle"
            title={showAllRequests ? 'No onboarding requests found' : 'No pending admin requests'}
            description="New applications submitted from the public Barangay Official request form will appear here."
          />
        ) : (
          <View className="gap-3">
            {visibleRequests.map((reqItem) => {
              const isBusy = busyKey === `req-${reqItem.id}`;
              const statusTone =
                reqItem.status === 'approved'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                  : reqItem.status === 'rejected'
                    ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/60 dark:text-red-300'
                    : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300';

              return (
                <View
                  key={reqItem.id}
                  className="gap-2.5 rounded-xl border border-border bg-surface-muted p-4"
                >
                  <View className="flex-row flex-wrap items-start justify-between gap-2">
                    <View className="min-w-[200px] flex-1 gap-0.5">
                      <Text className="text-base font-bold text-ink">
                        {reqItem.barangay_name}
                      </Text>
                      <Text className="text-xs text-ink-muted">
                        {reqItem.city_municipality}
                        {reqItem.province ? `, ${reqItem.province}` : ''}
                        {reqItem.region ? ` (${reqItem.region})` : ''}
                      </Text>
                    </View>
                    <View
                      className={`rounded-full border px-2.5 py-0.5 ${statusTone.split(' ').slice(0, 2).join(' ')}`}
                    >
                      <Text
                        className={`text-[11px] font-bold uppercase ${statusTone.split(' ').slice(2).join(' ')}`}
                      >
                        {reqItem.status}
                      </Text>
                    </View>
                  </View>

                  <View className="gap-1 border-t border-border pt-2.5">
                    <Text className="text-xs text-ink-muted">
                      Applicant:{' '}
                      <Text className="font-semibold text-ink">
                        {reqItem.applicant_name} ({reqItem.applicant_position})
                      </Text>
                    </Text>
                    <Text className="text-xs text-ink-muted">
                      Official Email:{' '}
                      <Text className="font-semibold text-ink">{reqItem.applicant_email}</Text> ·
                      Office Line: <Text className="font-semibold text-ink">{reqItem.contact_number}</Text>
                    </Text>
                    <Text className="text-xs text-ink-muted">
                      Barangay Hall:{' '}
                      <Text className="font-semibold text-ink">
                        {reqItem.hall_address || 'Not provided'}
                      </Text>
                    </Text>
                    {reqItem.notes ? (
                      <Text className="text-xs text-ink-muted">
                        Notes: <Text className="text-ink">{reqItem.notes}</Text>
                      </Text>
                    ) : null}
                    <Text className="text-[11px] text-ink-subtle">
                      Submitted {formatDateTime(reqItem.created_at)}
                    </Text>
                  </View>

                  {reqItem.status === 'pending' ? (
                    <View className="flex-row flex-wrap gap-2 pt-1">
                      <Button
                        label="Approve & Promote Admin"
                        size="sm"
                        variant="primary"
                        icon="verified-user"
                        loading={isBusy}
                        onPress={() => void handleReviewRequest(reqItem.id, 'approved', true)}
                      />
                      <Button
                        label="Approve Barangay Only"
                        size="sm"
                        variant="secondary"
                        icon="check-circle"
                        disabled={isBusy}
                        onPress={() => void handleReviewRequest(reqItem.id, 'approved', false)}
                      />
                      <Button
                        label="Reject"
                        size="sm"
                        variant="danger"
                        icon="cancel"
                        disabled={isBusy}
                        onPress={() => void handleReviewRequest(reqItem.id, 'rejected', false)}
                      />
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </Card>

      {/* Section 2: Registered Barangays Directory */}
      <Card
        title="Registered Barangays Directory"
        subtitle="Toggle LGU availability across the platform. Private GCash account numbers remain hidden."
      >
        <View className="gap-3">
          <View className="flex-row items-center gap-2 rounded-xl border border-border bg-surface-muted px-3.5 py-2.5">
            <MaterialIcons name="search" size={18} color={colors.inkSubtle} />
            <TextInput
              value={barangaySearch}
              onChangeText={setBarangaySearch}
              placeholder="Search registered barangays..."
              placeholderTextColor={colors.inkSubtle}
              className="flex-1 p-0 text-sm text-ink"
              accessibilityLabel="Search barangays"
            />
            {barangaySearch ? (
              <Pressable onPress={() => setBarangaySearch('')} hitSlop={8}>
                <MaterialIcons name="close" size={18} color={colors.inkMuted} />
              </Pressable>
            ) : null}
          </View>

          {filteredBarangays.length === 0 ? (
            <EmptyState
              icon="account-balance"
              title="No barangays found"
              description="Barangays appear automatically as residents register or as onboarding requests are approved."
            />
          ) : (
            <View className="gap-2.5">
              {filteredBarangays.map((b) => {
                const isBusy = busyKey === `brgy-${b.id}`;
                return (
                  <View
                    key={b.id}
                    className="flex-row flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-muted p-3.5"
                  >
                    <View className="min-w-[200px] flex-1 gap-0.5">
                      <View className="flex-row flex-wrap items-center gap-2">
                        <Text className="text-sm font-bold text-ink">{b.name}</Text>
                        <View
                          className={`rounded-full px-2 py-0.5 ${
                            b.isActive
                              ? 'bg-emerald-100 dark:bg-emerald-950'
                              : 'bg-surface'
                          }`}
                        >
                          <Text
                            className={`text-[10px] font-bold uppercase ${
                              b.isActive
                                ? 'text-emerald-800 dark:text-emerald-300'
                                : 'text-ink-subtle'
                            }`}
                          >
                            {b.isActive ? 'Active' : 'Inactive'}
                          </Text>
                        </View>
                        <View className="flex-row items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5">
                          <MaterialIcons
                            name="qr-code"
                            size={12}
                            color={b.hasGcashQr ? colors.primary : colors.inkSubtle}
                          />
                          <Text className="text-[10px] font-semibold text-ink-muted">
                            {b.hasGcashQr ? 'GCash QR Ready' : 'No QR Yet'}
                          </Text>
                        </View>
                      </View>
                      <Text className="text-xs text-ink-muted">
                        {b.cityMunicipality}
                        {b.province ? `, ${b.province}` : ''}
                        {b.hallAddress ? ` · ${b.hallAddress}` : ''}
                      </Text>
                    </View>

                    <Button
                      label={b.isActive ? 'Deactivate' : 'Activate'}
                      size="sm"
                      variant={b.isActive ? 'outline' : 'primary'}
                      loading={isBusy}
                      onPress={() => void handleToggleBarangay(b.id, !b.isActive)}
                    />
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </Card>
    </ScrollView>
  );
}
