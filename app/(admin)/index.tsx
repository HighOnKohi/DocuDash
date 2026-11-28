import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
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
import { StatusBadge } from '@/components/StatusBadge';
import {
  formatDateTime,
  formatFee,
  formatSlotDate,
  formatTimeWindow,
  getPaymentStatusLabel,
} from '@/constants/format';
import { useTheme } from '@/contexts/ThemeContext';
import { listAllRequests, subscribeToAllRequests } from '@/services/requestService';
import {
  getTodayManilaDate,
  listPickupSlots,
  subscribeToPickupSlots,
} from '@/services/scheduleService';
import { toServiceError } from '@/services/supabase';
import type { PickupSlot, RequestStatus, RequestWithDetails } from '@/types/database';

type QueueFilter = 'all' | RequestStatus;

const STATUS_FILTERS: { key: QueueFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'reviewing', label: 'Reviewing' },
  { key: 'ready', label: 'Ready' },
  { key: 'completed', label: 'Completed' },
  { key: 'rejected', label: 'Rejected' },
];

export default function AdminDashboardScreen() {
  const { colors } = useTheme();
  const todayManila = useMemo(() => getTodayManilaDate(), []);

  const [requests, setRequests] = useState<RequestWithDetails[]>([]);
  const [todaySlots, setTodaySlots] = useState<PickupSlot[]>([]);
  const [statusFilter, setStatusFilter] = useState<QueueFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadData = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (!options.silent) setLoading(true);
      setErrorMessage(null);
      try {
        const [allReqs, slots] = await Promise.all([
          listAllRequests({ limit: 200, ascending: true }),
          listPickupSlots({ fromDate: todayManila, toDate: todayManila }),
        ]);
        setRequests(allReqs);
        setTodaySlots(slots);
      } catch (error) {
        setErrorMessage(toServiceError(error, 'Unable to load barangay queue.').message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [todayManila]
  );

  useEffect(() => {
    let active = true;
    void Promise.all([
      listAllRequests({ limit: 200, ascending: true }),
      listPickupSlots({ fromDate: todayManila, toDate: todayManila }),
    ])
      .then(([allReqs, slots]) => {
        if (!active) return;
        setRequests(allReqs);
        setTodaySlots(slots);
        setErrorMessage(null);
      })
      .catch((error) => {
        if (!active) return;
        setErrorMessage(toServiceError(error, 'Unable to load barangay queue.').message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [todayManila]);

  useEffect(() => {
    const unsubReqs = subscribeToAllRequests(() => {
      void loadData({ silent: true });
    });
    const unsubSlots = subscribeToPickupSlots(() => {
      void loadData({ silent: true });
    });
    return () => {
      unsubReqs();
      unsubSlots();
    };
  }, [loadData]);

  const metrics = useMemo(() => {
    const counts: Record<QueueFilter, number> = {
      all: requests.length,
      pending: 0,
      reviewing: 0,
      ready: 0,
      completed: 0,
      rejected: 0,
    };

    let todayPickupsReady = 0;
    let todayCompleted = 0;

    for (const req of requests) {
      counts[req.status] += 1;
      if (req.status === 'ready' && req.pickup_slot?.slot_date === todayManila) {
        todayPickupsReady += 1;
      }
      if (req.status === 'completed' && req.completed_at?.startsWith(todayManila)) {
        todayCompleted += 1;
      }
    }

    const todayBooked = todaySlots.reduce((sum, s) => sum + s.booked_count, 0);
    const todayCapacity = todaySlots.reduce((sum, s) => sum + s.max_capacity, 0);

    return {
      counts,
      todayPickupsReady,
      todayCompleted,
      todayBooked,
      todayCapacity,
    };
  }, [requests, todaySlots, todayManila]);

  const filteredRequests = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    return requests.filter((req) => {
      if (statusFilter !== 'all' && req.status !== statusFilter) {
        return false;
      }
      if (!needle) return true;
      const haystacks = [
        req.resident?.full_name ?? '',
        req.resident?.contact_number ?? '',
        req.document_type?.name ?? '',
        req.purpose,
        req.id,
      ];
      return haystacks.some((value) => value.toLowerCase().includes(needle));
    });
  }, [requests, statusFilter, searchQuery]);

  return (
    <ScrollView
      className="flex-1 bg-surface-muted"
      contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void loadData({ silent: true });
          }}
          tintColor={colors.primary}
        />
      }
    >
      <View className="mx-auto w-full max-w-6xl gap-6">
        {/* Page header */}
        <View className="flex-row flex-wrap items-center justify-between gap-4">
          <View className="gap-1">
            <Text className="text-2xl font-bold text-ink">Document Queue Overview</Text>
            <Text className="text-sm text-ink-muted">
              {formatSlotDate(todayManila)} · Live updates enabled
            </Text>
          </View>
          <View className="flex-row flex-wrap items-center gap-2.5">
            <Button
              label="Manage Schedules"
              variant="outline"
              size="sm"
              icon="event-note"
              onPress={() => router.push('/(admin)/schedules')}
            />
            <Button
              label="Scan QR Pass"
              variant="primary"
              size="sm"
              icon="qr-code-scanner"
              onPress={() => router.push('/(admin)/scanner')}
            />
          </View>
        </View>

        {/* Daily pickup & queue metrics */}
        <View className="flex-row flex-wrap gap-3">
          <View className="min-w-[155px] flex-1 rounded-card border border-border bg-surface p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-xs font-semibold text-ink-subtle">Pending Queue</Text>
              <MaterialIcons name="schedule" size={18} color={colors.warning} />
            </View>
            <Text className="mt-1.5 text-3xl font-bold text-ink">{metrics.counts.pending}</Text>
            <Text className="mt-0.5 text-xs text-ink-muted">Awaiting staff intake</Text>
          </View>

          <View className="min-w-[155px] flex-1 rounded-card border border-border bg-surface p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-xs font-semibold text-ink-subtle">Under Review</Text>
              <MaterialIcons name="rate-review" size={18} color={colors.info} />
            </View>
            <Text className="mt-1.5 text-3xl font-bold text-ink">{metrics.counts.reviewing}</Text>
            <Text className="mt-0.5 text-xs text-ink-muted">In active verification</Text>
          </View>

          <View className="min-w-[155px] flex-1 rounded-card border border-border bg-surface p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-xs font-semibold text-ink-subtle">Ready for Pickup</Text>
              <MaterialIcons name="qr-code-2" size={18} color={colors.primary} />
            </View>
            <Text className="mt-1.5 text-3xl font-bold text-primary">{metrics.counts.ready}</Text>
            <Text className="mt-0.5 text-xs text-ink-muted">
              {metrics.todayPickupsReady} scheduled today
            </Text>
          </View>

          <View className="min-w-[155px] flex-1 rounded-card border border-border bg-surface p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-xs font-semibold text-ink-subtle">Today&apos;s Capacity</Text>
              <MaterialIcons name="event-available" size={18} color={colors.success} />
            </View>
            <Text className="mt-1.5 text-3xl font-bold text-ink">
              {metrics.todayBooked}
              <Text className="text-lg font-medium text-ink-subtle">/{metrics.todayCapacity}</Text>
            </Text>
            <Text className="mt-0.5 text-xs text-ink-muted">
              {metrics.todayCompleted} released today
            </Text>
          </View>
        </View>

        {/* Today's pickup windows summary */}
        {todaySlots.length > 0 ? (
          <Card
            title="Today's Pickup Windows"
            subtitle="Live counter load for today (Asia/Manila)."
            rightSlot={
              <Button
                label="Edit Slots"
                variant="ghost"
                size="sm"
                onPress={() => router.push('/(admin)/schedules')}
              />
            }
          >
            <View className="flex-row flex-wrap gap-3">
              {todaySlots.map((slot) => {
                const ratio = slot.max_capacity > 0 ? slot.booked_count / slot.max_capacity : 0;
                const isFull = slot.booked_count >= slot.max_capacity;
                return (
                  <View
                    key={slot.id}
                    className="min-w-[190px] flex-1 gap-1.5 rounded-lg border border-border bg-surface-muted p-3"
                  >
                    <View className="flex-row items-center justify-between gap-2">
                      <Text className="text-xs font-bold text-ink">
                        {formatTimeWindow(slot.time_window)}
                      </Text>
                      <Text
                        className={`text-xs font-bold ${
                          isFull ? 'text-red-700 dark:text-red-400' : 'text-ink-muted'
                        }`}
                      >
                        {slot.booked_count}/{slot.max_capacity}
                      </Text>
                    </View>
                    <View className="h-1.5 overflow-hidden rounded-full bg-border">
                      <View
                        className={`h-full rounded-full ${
                          isFull ? 'bg-red-600' : ratio >= 0.75 ? 'bg-amber-600' : 'bg-emerald-600'
                        }`}
                        style={{ width: `${Math.min(ratio * 100, 100)}%` }}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          </Card>
        ) : null}

        {errorMessage ? (
          <Banner
            tone="error"
            message={errorMessage}
            actionLabel="Retry"
            onAction={() => void loadData()}
          />
        ) : null}

        {/* Filter & search controls */}
        <Card title="Resident Requests" subtitle="Oldest submissions first (FIFO processing queue).">
          <View className="gap-4">
            <View className="flex-row flex-wrap items-center justify-between gap-3">
              <View className="flex-row flex-wrap gap-2">
                {STATUS_FILTERS.map((item) => {
                  const selected = statusFilter === item.key;
                  return (
                    <Pressable
                      key={item.key}
                      onPress={() => setStatusFilter(item.key)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      className={`rounded-full border px-3 py-1.5 ${
                        selected
                          ? 'border-primary bg-primary'
                          : 'border-border bg-surface-muted'
                      }`}
                    >
                      <Text
                        className={`text-xs font-semibold ${
                          selected ? 'text-white' : 'text-ink-muted'
                        }`}
                      >
                        {item.label} ({metrics.counts[item.key]})
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View className="min-w-[240px] flex-1 flex-row items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 lg:max-w-xs">
                <MaterialIcons name="search" size={18} color={colors.inkSubtle} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search resident, document, purpose..."
                  placeholderTextColor={colors.inkSubtle}
                  className="min-h-[38px] flex-1 py-1.5 text-sm text-ink"
                  accessibilityLabel="Search requests"
                />
                {searchQuery ? (
                  <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                    <MaterialIcons name="close" size={16} color={colors.inkSubtle} />
                  </Pressable>
                ) : null}
              </View>
            </View>

            {loading ? (
              <LoadingState message="Loading barangay request queue..." />
            ) : filteredRequests.length === 0 ? (
              <EmptyState
                icon="inbox"
                title={
                  requests.length === 0
                    ? 'No resident requests yet'
                    : 'No requests match your filter'
                }
                description={
                  requests.length === 0
                    ? 'Submitted barangay document requests will appear here automatically in real time.'
                    : 'Clear your search query or switch status filters to see other requests.'
                }
                actionLabel={requests.length > 0 ? 'Reset Filters' : undefined}
                onAction={
                  requests.length > 0
                    ? () => {
                        setStatusFilter('all');
                        setSearchQuery('');
                      }
                    : undefined
                }
              />
            ) : (
              <View className="gap-3">
                {filteredRequests.map((req) => {
                  const attachmentCount = req.attachments?.length ?? 0;
                  return (
                    <Pressable
                      key={req.id}
                      onPress={() =>
                        router.push({
                          pathname: '/(admin)/requests/[id]',
                          params: { id: req.id },
                        })
                      }
                      accessibilityRole="button"
                      className="gap-3 rounded-lg border border-border bg-surface-muted p-4 lg:flex-row lg:items-center lg:justify-between"
                      style={({ pressed }) => (pressed ? { opacity: 0.92 } : undefined)}
                    >
                      <View className="flex-1 gap-1.5">
                        <View className="flex-row flex-wrap items-center gap-2">
                          <Text className="text-base font-bold text-ink">
                            {req.document_type?.name ?? 'Barangay Document'}
                          </Text>
                          <StatusBadge status={req.status} />
                          <Text className="text-xs font-semibold text-primary">
                            {formatFee(req.payment_amount || (req.document_type?.fee ?? 0))}
                          </Text>
                          {(req.payment_amount || (req.document_type?.fee ?? 0)) > 0 ? (
                            <View
                              className={`rounded-full px-2 py-0.5 ${
                                req.payment_status === 'verified'
                                  ? 'bg-emerald-100 dark:bg-emerald-950'
                                  : req.payment_status === 'submitted'
                                    ? 'bg-amber-100 dark:bg-amber-950'
                                    : 'bg-surface'
                              }`}
                            >
                              <Text
                                className={`text-[11px] font-bold ${
                                  req.payment_status === 'verified'
                                    ? 'text-emerald-800 dark:text-emerald-300'
                                    : req.payment_status === 'submitted'
                                      ? 'text-amber-800 dark:text-amber-300'
                                      : 'text-ink-muted'
                                }`}
                              >
                                {getPaymentStatusLabel(
                                  req.payment_status,
                                  req.payment_method,
                                  req.payment_timing
                                )}
                              </Text>
                            </View>
                          ) : null}
                        </View>

                        <Text className="text-sm font-medium text-ink">
                          {req.resident?.full_name ?? 'Unknown Resident'}
                          {req.resident?.contact_number ? ` · ${req.resident.contact_number}` : ''}
                        </Text>

                        <Text className="text-xs text-ink-muted" numberOfLines={1}>
                          Purpose: {req.purpose}
                        </Text>

                        <View className="flex-row flex-wrap items-center gap-3 pt-0.5">
                          <View className="flex-row items-center gap-1">
                            <MaterialIcons name="schedule" size={14} color={colors.inkSubtle} />
                            <Text className="text-xs text-ink-subtle">
                              {formatDateTime(req.created_at)}
                            </Text>
                          </View>
                          <View className="flex-row items-center gap-1">
                            <MaterialIcons name="attach-file" size={14} color={colors.inkSubtle} />
                            <Text className="text-xs text-ink-subtle">
                              {attachmentCount} {attachmentCount === 1 ? 'file' : 'files'}
                            </Text>
                          </View>
                          <View className="flex-row items-center gap-1">
                            <MaterialIcons
                              name={req.pickup_slot ? 'event-available' : 'event-busy'}
                              size={14}
                              color={req.pickup_slot ? colors.primary : colors.inkSubtle}
                            />
                            <Text className="text-xs text-ink-subtle">
                              {req.pickup_slot
                                ? `${formatSlotDate(req.pickup_slot.slot_date)} (${formatTimeWindow(req.pickup_slot.time_window)})`
                                : 'No slot booked'}
                            </Text>
                          </View>
                        </View>
                      </View>

                      <View className="flex-row items-center gap-1 self-end lg:self-center">
                        <Text className="text-sm font-semibold text-primary">
                          {req.status === 'pending' || req.status === 'reviewing'
                            ? 'Review'
                            : 'Inspect'}
                        </Text>
                        <MaterialIcons name="chevron-right" size={20} color={colors.primary} />
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        </Card>
      </View>
    </ScrollView>
  );
}
