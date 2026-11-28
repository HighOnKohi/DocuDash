import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Banner, EmptyState, LoadingState } from '@/components/StateView';
import { TextField } from '@/components/TextField';
import { addDaysToDate, formatSlotDate, formatTimeWindow } from '@/constants/format';
import { useTheme } from '@/contexts/ThemeContext';
import {
  createPickupSlot,
  deletePickupSlot,
  getTodayManilaDate,
  listPickupSlots,
  subscribeToPickupSlots,
  updatePickupSlot,
} from '@/services/scheduleService';
import { toServiceError } from '@/services/supabase';
import type { PickupSlot } from '@/types/database';

const PRESET_WINDOWS = ['08:00-10:00', '10:00-12:00', '13:00-15:00', '15:00-17:00'] as const;

export default function AdminSchedulesScreen() {
  const { colors } = useTheme();
  const todayManila = useMemo(() => getTodayManilaDate(), []);

  const [slots, setSlots] = useState<PickupSlot[]>([]);
  const [showPast, setShowPast] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Create form
  const [slotDate, setSlotDate] = useState(() => addDaysToDate(getTodayManilaDate(), 1));
  const [timeWindow, setTimeWindow] = useState<string>('08:00-10:00');
  const [maxCapacity, setMaxCapacity] = useState('20');
  const [creating, setCreating] = useState(false);
  const [creatingDay, setCreatingDay] = useState(false);

  // Inline capacity edit
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [editCapacity, setEditCapacity] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingSlotId, setDeletingSlotId] = useState<string | null>(null);

  const [feedback, setFeedback] = useState<{
    tone: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  const loadSlots = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (!options.silent) setLoading(true);
      try {
        const rows = await listPickupSlots(showPast ? {} : { fromDate: todayManila });
        setSlots(rows);
      } catch (error) {
        setFeedback({
          tone: 'error',
          message: toServiceError(error, 'Unable to load pickup slots.').message,
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [showPast, todayManila]
  );

  useEffect(() => {
    let active = true;
    void listPickupSlots(showPast ? {} : { fromDate: todayManila })
      .then((rows) => {
        if (!active) return;
        setSlots(rows);
      })
      .catch((error) => {
        if (!active) return;
        setFeedback({
          tone: 'error',
          message: toServiceError(error, 'Unable to load pickup slots.').message,
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [showPast, todayManila]);

  useEffect(() => {
    const unsubscribe = subscribeToPickupSlots(() => {
      void loadSlots({ silent: true });
    });
    return unsubscribe;
  }, [loadSlots]);

  const quickDates = useMemo(
    () => [
      { label: 'Today', value: todayManila },
      { label: 'Tomorrow', value: addDaysToDate(todayManila, 1) },
      { label: '+2 Days', value: addDaysToDate(todayManila, 2) },
      { label: '+3 Days', value: addDaysToDate(todayManila, 3) },
    ],
    [todayManila]
  );

  const groupedSlots = useMemo(() => {
    const groups: { date: string; items: PickupSlot[] }[] = [];
    const map = new Map<string, PickupSlot[]>();
    for (const slot of slots) {
      const list = map.get(slot.slot_date);
      if (list) list.push(slot);
      else {
        const next = [slot];
        map.set(slot.slot_date, next);
        groups.push({ date: slot.slot_date, items: next });
      }
    }
    return groups;
  }, [slots]);

  async function handleCreateSingle() {
    setFeedback(null);
    const parsedCapacity = Number.parseInt(maxCapacity.trim(), 10);
    if (Number.isNaN(parsedCapacity)) {
      setFeedback({ tone: 'error', message: 'Enter a whole number for maximum capacity.' });
      return;
    }

    setCreating(true);
    try {
      await createPickupSlot({
        slot_date: slotDate.trim(),
        time_window: timeWindow.trim(),
        max_capacity: parsedCapacity,
      });
      await loadSlots({ silent: true });
      setFeedback({
        tone: 'success',
        message: `Created pickup slot ${formatSlotDate(slotDate.trim())} (${formatTimeWindow(timeWindow.trim())}).`,
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: toServiceError(error, 'Unable to create pickup slot.').message,
      });
    } finally {
      setCreating(false);
    }
  }

  async function handleCreateStandardDay() {
    setFeedback(null);
    const parsedCapacity = Number.parseInt(maxCapacity.trim(), 10);
    if (Number.isNaN(parsedCapacity) || parsedCapacity < 1 || parsedCapacity > 500) {
      setFeedback({ tone: 'error', message: 'Capacity must be a whole number between 1 and 500.' });
      return;
    }

    const targetDate = slotDate.trim();
    const existingWindows = new Set(
      slots.filter((s) => s.slot_date === targetDate).map((s) => s.time_window)
    );
    const windowsToCreate = PRESET_WINDOWS.filter((w) => !existingWindows.has(w));

    if (windowsToCreate.length === 0) {
      setFeedback({
        tone: 'info',
        message: `All 4 standard windows already exist for ${formatSlotDate(targetDate)}.`,
      });
      return;
    }

    setCreatingDay(true);
    try {
      for (const window of windowsToCreate) {
        await createPickupSlot({
          slot_date: targetDate,
          time_window: window,
          max_capacity: parsedCapacity,
        });
      }
      await loadSlots({ silent: true });
      setFeedback({
        tone: 'success',
        message: `Created ${windowsToCreate.length} pickup window(s) for ${formatSlotDate(targetDate)}.`,
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: toServiceError(error, 'Unable to create standard day slots.').message,
      });
    } finally {
      setCreatingDay(false);
    }
  }

  async function handleSaveCapacity(slot: PickupSlot) {
    setFeedback(null);
    const parsedCapacity = Number.parseInt(editCapacity.trim(), 10);
    if (Number.isNaN(parsedCapacity) || parsedCapacity < slot.booked_count) {
      setFeedback({
        tone: 'error',
        message: `Capacity must be at least ${slot.booked_count} (current bookings).`,
      });
      return;
    }

    setSavingEdit(true);
    try {
      await updatePickupSlot(slot.id, { max_capacity: parsedCapacity });
      setEditingSlotId(null);
      await loadSlots({ silent: true });
      setFeedback({ tone: 'success', message: 'Slot capacity updated.' });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: toServiceError(error, 'Unable to update capacity.').message,
      });
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDeleteSlot(slot: PickupSlot) {
    setFeedback(null);
    setDeletingSlotId(slot.id);
    try {
      await deletePickupSlot(slot.id);
      await loadSlots({ silent: true });
      setFeedback({
        tone: 'success',
        message: `Deleted unbooked slot ${formatSlotDate(slot.slot_date)} (${formatTimeWindow(slot.time_window)}).`,
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: toServiceError(error, 'Unable to delete pickup slot.').message,
      });
    } finally {
      setDeletingSlotId(null);
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
            void loadSlots({ silent: true });
          }}
          tintColor={colors.primary}
        />
      }
    >
      <View className="mx-auto w-full max-w-6xl gap-6">
        <View className="flex-row flex-wrap items-center justify-between gap-3">
          <View className="gap-1">
            <Text className="text-2xl font-bold text-ink">Pickup Schedule Management</Text>
            <Text className="text-sm text-ink-muted">
              Open counter windows and set hourly capacities to prevent overcrowding.
            </Text>
          </View>
          <Button
            label={showPast ? 'Showing All Dates' : 'Include Past Dates'}
            variant="outline"
            size="sm"
            icon="history"
            onPress={() => setShowPast((prev) => !prev)}
          />
        </View>

        {feedback ? <Banner tone={feedback.tone} message={feedback.message} /> : null}

        <View className="gap-6 lg:flex-row lg:items-start">
          {/* Create Slot Card */}
          <View className="lg:w-[380px]">
            <Card
              title="Add Pickup Window"
              subtitle="Slots use Asia/Manila local dates and 24-hour windows."
            >
              <View className="gap-4">
                <View className="gap-2">
                  <TextField
                    label="Pickup date (YYYY-MM-DD)"
                    value={slotDate}
                    onChangeText={setSlotDate}
                    placeholder="2026-11-27"
                    autoCapitalize="none"
                    editable={!creating && !creatingDay}
                    required
                  />
                  <View className="flex-row flex-wrap gap-1.5">
                    {quickDates.map((d) => (
                      <Pressable
                        key={d.value}
                        onPress={() => setSlotDate(d.value)}
                        className={`rounded-full border px-2.5 py-1 ${
                          slotDate === d.value
                            ? 'border-primary bg-primary-50'
                            : 'border-border bg-surface-muted'
                        }`}
                      >
                        <Text
                          className={`text-xs font-semibold ${
                            slotDate === d.value ? 'text-primary' : 'text-ink-muted'
                          }`}
                        >
                          {d.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <View className="gap-2">
                  <TextField
                    label="Time window (HH:MM-HH:MM)"
                    value={timeWindow}
                    onChangeText={setTimeWindow}
                    placeholder="08:00-10:00"
                    autoCapitalize="none"
                    editable={!creating && !creatingDay}
                    required
                  />
                  <View className="flex-row flex-wrap gap-1.5">
                    {PRESET_WINDOWS.map((win) => (
                      <Pressable
                        key={win}
                        onPress={() => setTimeWindow(win)}
                        className={`rounded-full border px-2.5 py-1 ${
                          timeWindow === win
                            ? 'border-primary bg-primary-50'
                            : 'border-border bg-surface-muted'
                        }`}
                      >
                        <Text
                          className={`text-xs font-semibold ${
                            timeWindow === win ? 'text-primary' : 'text-ink-muted'
                          }`}
                        >
                          {formatTimeWindow(win)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <TextField
                  label="Maximum capacity"
                  value={maxCapacity}
                  onChangeText={setMaxCapacity}
                  keyboardType="number-pad"
                  helperText="Between 1 and 500 residents per window."
                  editable={!creating && !creatingDay}
                  required
                />

                <View className="gap-2 pt-1">
                  <Button
                    label="Create Pickup Slot"
                    icon="add-circle-outline"
                    loading={creating}
                    disabled={creatingDay}
                    onPress={() => void handleCreateSingle()}
                    fullWidth
                  />
                  <Button
                    label="Add Standard Day (4 Windows)"
                    variant="secondary"
                    icon="date-range"
                    loading={creatingDay}
                    disabled={creating}
                    onPress={() => void handleCreateStandardDay()}
                    fullWidth
                  />
                </View>
              </View>
            </Card>
          </View>

          {/* Existing Slots List */}
          <View className="flex-1 gap-4">
            {loading ? (
              <LoadingState message="Loading pickup schedules..." />
            ) : groupedSlots.length === 0 ? (
              <EmptyState
                icon="event-busy"
                title="No pickup slots scheduled"
                description="Create a single window or add a standard 4-window barangay day using the form."
              />
            ) : (
              groupedSlots.map((group) => (
                <Card
                  key={group.date}
                  title={formatSlotDate(group.date)}
                  subtitle={`${group.items.length} ${group.items.length === 1 ? 'window' : 'windows'} · ${group.items.reduce((s, x) => s + x.booked_count, 0)} booked`}
                >
                  <View className="gap-3">
                    {group.items.map((slot) => {
                      const ratio = slot.max_capacity > 0 ? slot.booked_count / slot.max_capacity : 0;
                      const isFull = slot.booked_count >= slot.max_capacity;
                      const isEditing = editingSlotId === slot.id;

                      return (
                        <View
                          key={slot.id}
                          className="gap-2.5 rounded-lg border border-border bg-surface-muted p-4"
                        >
                          <View className="flex-row flex-wrap items-center justify-between gap-2">
                            <View className="gap-0.5">
                              <Text className="text-sm font-bold text-ink">
                                {formatTimeWindow(slot.time_window)}
                              </Text>
                              <Text className="text-xs text-ink-muted">
                                {slot.booked_count} booked of {slot.max_capacity} capacity (
                                {Math.max(slot.max_capacity - slot.booked_count, 0)} left)
                              </Text>
                            </View>

                            <View className="flex-row items-center gap-2">
                              <Button
                                label={isEditing ? 'Cancel' : 'Edit Cap'}
                                variant="outline"
                                size="sm"
                                onPress={() => {
                                  if (isEditing) {
                                    setEditingSlotId(null);
                                  } else {
                                    setEditingSlotId(slot.id);
                                    setEditCapacity(String(slot.max_capacity));
                                  }
                                }}
                              />
                              <Button
                                label="Delete"
                                variant="danger"
                                size="sm"
                                icon="delete-outline"
                                disabled={slot.booked_count > 0 || deletingSlotId !== null}
                                loading={deletingSlotId === slot.id}
                                onPress={() => void handleDeleteSlot(slot)}
                              />
                            </View>
                          </View>

                          <View className="h-2 overflow-hidden rounded-full bg-border">
                            <View
                              className={`h-full rounded-full ${
                                isFull
                                  ? 'bg-red-600'
                                  : ratio >= 0.75
                                    ? 'bg-amber-600'
                                    : 'bg-emerald-600'
                              }`}
                              style={{ width: `${Math.min(ratio * 100, 100)}%` }}
                            />
                          </View>

                          {slot.booked_count > 0 ? (
                            <Text className="text-[11px] text-ink-subtle">
                              Booked slots cannot be deleted or moved; you may still increase
                              capacity.
                            </Text>
                          ) : null}

                          {isEditing ? (
                            <View className="flex-row flex-wrap items-end gap-2 border-t border-border pt-3">
                              <View className="min-w-[140px] flex-1">
                                <TextField
                                  label="New max capacity"
                                  value={editCapacity}
                                  onChangeText={setEditCapacity}
                                  keyboardType="number-pad"
                                  editable={!savingEdit}
                                />
                              </View>
                              <Button
                                label="Save Capacity"
                                size="sm"
                                loading={savingEdit}
                                onPress={() => void handleSaveCapacity(slot)}
                              />
                            </View>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                </Card>
              ))
            )}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
