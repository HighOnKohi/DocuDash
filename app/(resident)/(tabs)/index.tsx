import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/BrandMark';
import { Button } from '@/components/Button';
import { RequestCard } from '@/components/RequestCard';
import { SettingsButton } from '@/components/SettingsModal';
import { Banner, EmptyState, LoadingState } from '@/components/StateView';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getBarangayById, openBarangayHallInMaps } from '@/services/barangayService';
import { listResidentRequests, subscribeToResidentRequests } from '@/services/requestService';
import { toServiceError } from '@/services/supabase';
import type { Barangay, RequestWithDetails } from '@/types/database';

type FilterKey = 'all' | 'active' | 'ready' | 'past';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'In Progress' },
  { key: 'ready', label: 'Ready' },
  { key: 'past', label: 'Completed / Past' },
];

export default function ResidentDashboardScreen() {
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const { colors } = useTheme();
  const userId = user?.id ?? null;

  const [requests, setRequests] = useState<RequestWithDetails[]>([]);
  const [barangay, setBarangay] = useState<Barangay | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadRequests = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (!userId) return;
      if (!options.silent) setLoading(true);
      setErrorMessage(null);

      try {
        const rows = await listResidentRequests(userId);
        setRequests(rows);
      } catch (error) {
        setErrorMessage(toServiceError(error, 'Unable to load your document requests.').message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [userId]
  );

  useFocusEffect(
    useCallback(() => {
      void loadRequests({ silent: requests.length > 0 });
    }, [loadRequests, requests.length])
  );

  useEffect(() => {
    if (!userId) return;
    const unsubscribe = subscribeToResidentRequests(userId, () => {
      void loadRequests({ silent: true });
    });
    return unsubscribe;
  }, [userId, loadRequests]);

  const barangayId = profile?.barangay_id ?? null;
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

  const counts = useMemo(() => {
    let active = 0;
    let ready = 0;
    let completed = 0;
    for (const item of requests) {
      if (item.status === 'pending' || item.status === 'reviewing') active += 1;
      if (item.status === 'ready') ready += 1;
      if (item.status === 'completed') completed += 1;
    }
    return { active, ready, completed };
  }, [requests]);

  const readyRequest = useMemo(
    () => requests.find((item) => item.status === 'ready') ?? null,
    [requests]
  );

  const filteredRequests = useMemo(() => {
    switch (filter) {
      case 'active':
        return requests.filter((r) => r.status === 'pending' || r.status === 'reviewing');
      case 'ready':
        return requests.filter((r) => r.status === 'ready');
      case 'past':
        return requests.filter((r) => r.status === 'completed' || r.status === 'rejected');
      default:
        return requests;
    }
  }, [requests, filter]);

  const firstName = profile?.full_name.trim().split(/\s+/)[0] || 'Resident';

  return (
    <ScrollView
      className="flex-1 bg-surface-muted"
      contentContainerStyle={{
        paddingTop: insets.top + 20,
        paddingBottom: insets.bottom + 28,
        paddingHorizontal: 20,
      }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void loadRequests({ silent: true });
          }}
          tintColor={colors.primary}
        />
      }
    >
      <View className="mx-auto w-full max-w-3xl gap-6">
        {/* Header */}
        <View className="flex-row flex-wrap items-center justify-between gap-4">
          <View className="gap-1">
            <BrandMark showTagline={false} />
            <Text className="text-sm text-ink-muted">
              Welcome back, <Text className="font-semibold text-ink">{firstName}</Text>
            </Text>
          </View>
          <View className="flex-row items-center gap-2">
            <SettingsButton compact />
            <Button
              label="New Request"
              icon="post-add"
              size="sm"
              onPress={() => router.push('/(resident)/(tabs)/request-new')}
            />
          </View>
        </View>

        {/* Assigned Barangay & Hall Locator */}
        {barangay || profile?.barangay_name ? (
          <View className="flex-row items-center justify-between gap-3 rounded-card border border-border bg-surface p-4">
            <View className="flex-1 flex-row items-center gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-lg bg-primary-50">
                <MaterialIcons name="location-city" size={20} color={colors.primary} />
              </View>
              <View className="flex-1">
                <Text className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                  Your Barangay
                </Text>
                <Text className="text-sm font-bold text-ink" numberOfLines={1}>
                  {barangay?.name ?? profile?.barangay_name}
                  {barangay?.city_municipality || profile?.city_municipality
                    ? `, ${barangay?.city_municipality ?? profile?.city_municipality}`
                    : ''}
                </Text>
              </View>
            </View>
            <Button
              label="Locate Hall"
              size="sm"
              variant="outline"
              icon="map"
              onPress={() =>
                void openBarangayHallInMaps(
                  barangay ?? {
                    name: profile?.barangay_name,
                    city_municipality: profile?.city_municipality,
                    province: profile?.province,
                  }
                )
              }
            />
          </View>
        ) : (
          <View className="flex-row items-center justify-between gap-3 rounded-card border border-border bg-surface p-4">
            <View className="flex-1">
              <Text className="text-sm font-bold text-ink">No barangay assigned yet</Text>
              <Text className="text-xs text-ink-muted">
                Set your Philippine barangay in Profile to view hall directions &amp; GCash QR.
              </Text>
            </View>
            <Button
              label="Set Barangay"
              size="sm"
              variant="outline"
              onPress={() => router.push('/(resident)/(tabs)/profile')}
            />
          </View>
        )}

        {/* Ready-for-pickup highlight banner */}
        {readyRequest ? (
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/(resident)/request/[id]',
                params: { id: readyRequest.id },
              })
            }
            accessibilityRole="button"
            className="flex-row items-center gap-3.5 rounded-card border border-primary-200 bg-primary p-4"
            style={({ pressed }) => (pressed ? { opacity: 0.92 } : undefined)}
          >
            <View className="h-11 w-11 items-center justify-center rounded-lg bg-primary-800">
              <MaterialIcons name="qr-code-2" size={24} color={colors.accent} />
            </View>
            <View className="flex-1 gap-0.5">
              <Text className="text-sm font-bold text-white">
                {readyRequest.document_type?.name ?? 'Document'} is ready for pickup
              </Text>
              <Text className="text-xs text-primary-100">
                Tap to open your QR pickup pass for the barangay counter.
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color="#FFFFFF" />
          </Pressable>
        ) : null}

        {/* Summary metrics */}
        <View className="flex-row gap-3">
          <View className="flex-1 rounded-card border border-border bg-surface p-3.5">
            <Text className="text-xs font-medium text-ink-subtle">In Progress</Text>
            <Text className="mt-1 text-2xl font-bold text-ink">{counts.active}</Text>
          </View>
          <View className="flex-1 rounded-card border border-border bg-surface p-3.5">
            <Text className="text-xs font-medium text-ink-subtle">Ready</Text>
            <Text className="mt-1 text-2xl font-bold text-primary">{counts.ready}</Text>
          </View>
          <View className="flex-1 rounded-card border border-border bg-surface p-3.5">
            <Text className="text-xs font-medium text-ink-subtle">Completed</Text>
            <Text className="mt-1 text-2xl font-bold text-ink">{counts.completed}</Text>
          </View>
        </View>

        {/* Filter pills */}
        <View className="flex-row flex-wrap gap-2">
          {FILTERS.map((item) => {
            const selected = filter === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => setFilter(item.key)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                className={`rounded-full border px-3.5 py-1.5 ${
                  selected
                    ? 'border-primary bg-primary'
                    : 'border-border bg-surface'
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    selected ? 'text-white' : 'text-ink-muted'
                  }`}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Error banner */}
        {errorMessage ? (
          <Banner
            tone="error"
            message={errorMessage}
            actionLabel="Retry"
            onAction={() => void loadRequests()}
          />
        ) : null}

        {/* Request list */}
        {loading ? (
          <LoadingState message="Loading your document requests..." />
        ) : filteredRequests.length === 0 ? (
          <EmptyState
            icon="description"
            title={
              requests.length === 0
                ? 'No document requests yet'
                : 'No requests match this filter'
            }
            description={
              requests.length === 0
                ? 'Submit your first Barangay Clearance, Indigency, Residency, or Business Clearance online.'
                : 'Try switching filters to view your other requests.'
            }
            actionLabel={requests.length === 0 ? 'Start a Request' : 'Show All Requests'}
            onAction={() => {
              if (requests.length === 0) {
                router.push('/(resident)/(tabs)/request-new');
              } else {
                setFilter('all');
              }
            }}
          />
        ) : (
          <View className="gap-3">
            {filteredRequests.map((item) => (
              <RequestCard
                key={item.id}
                request={item}
                onPress={() =>
                  router.push({
                    pathname: '/(resident)/request/[id]',
                    params: { id: item.id },
                  })
                }
              />
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
