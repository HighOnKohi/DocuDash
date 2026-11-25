import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

import type {
  DocumentRequest,
  PickupSlot,
  PickupSlotInsert,
  PickupSlotUpdate,
} from '@/types/database';

import { getSupabaseClient, ServiceError, toServiceError } from './supabase';

export interface ListPickupSlotsOptions {
  /** Inclusive YYYY-MM-DD lower bound (defaults to today in Asia/Manila when `upcomingOnly` is true). */
  fromDate?: string;
  /** Inclusive YYYY-MM-DD upper bound. */
  toDate?: string;
  /** When true, defaults `fromDate` to today in Asia/Manila. */
  upcomingOnly?: boolean;
  /** When true, returns only slots with remaining capacity (`booked_count < max_capacity`). */
  onlyAvailable?: boolean;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_WINDOW_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9]-([01][0-9]|2[0-3]):[0-5][0-9]$/;

/** Returns the current calendar date (`YYYY-MM-DD`) in `Asia/Manila` (UTC+8). */
export function getTodayManilaDate(): string {
  const manilaMs = Date.now() + 8 * 60 * 60 * 1000;
  return new Date(manilaMs).toISOString().slice(0, 10);
}

function validateTimeWindow(timeWindow: string): void {
  if (!TIME_WINDOW_PATTERN.test(timeWindow)) {
    throw new ServiceError('Time window must use 24-hour HH:MM-HH:MM format (e.g. 08:00-10:00).', {
      code: 'invalid_time_window',
    });
  }
  const [start, end] = timeWindow.split('-');
  if (!start || !end || start >= end) {
    throw new ServiceError('Time window end time must be after start time.', {
      code: 'invalid_time_window_order',
    });
  }
}

export async function listPickupSlots(
  options: ListPickupSlotsOptions = {}
): Promise<PickupSlot[]> {
  const supabase = getSupabaseClient();
  const fromDate = options.fromDate ?? (options.upcomingOnly ? getTodayManilaDate() : undefined);

  let query = supabase
    .from('pickup_slots')
    .select('*')
    .order('slot_date', { ascending: true })
    .order('time_window', { ascending: true });

  if (fromDate) {
    query = query.gte('slot_date', fromDate);
  }
  if (options.toDate) {
    query = query.lte('slot_date', options.toDate);
  }

  const { data, error } = await query;
  if (error) {
    throw toServiceError(error, 'Unable to load pickup slots.');
  }

  const slots = data ?? [];
  return options.onlyAvailable
    ? slots.filter((slot) => slot.booked_count < slot.max_capacity)
    : slots;
}

export async function getPickupSlotById(slotId: string): Promise<PickupSlot | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('pickup_slots')
    .select('*')
    .eq('id', slotId)
    .maybeSingle();

  if (error) {
    throw toServiceError(error, 'Unable to load pickup slot.');
  }
  return data;
}

/** Creates a new pickup slot window (staff/admin only; RLS enforced). */
export async function createPickupSlot(input: PickupSlotInsert): Promise<PickupSlot> {
  const slotDate = input.slot_date.trim();
  const timeWindow = input.time_window.trim();

  if (!DATE_PATTERN.test(slotDate)) {
    throw new ServiceError('Slot date must use YYYY-MM-DD format.', { code: 'invalid_slot_date' });
  }
  validateTimeWindow(timeWindow);

  if (!Number.isInteger(input.max_capacity) || input.max_capacity < 1 || input.max_capacity > 500) {
    throw new ServiceError('Maximum capacity must be a whole number between 1 and 500.', {
      code: 'invalid_capacity',
    });
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('pickup_slots')
    .insert({
      slot_date: slotDate,
      time_window: timeWindow,
      max_capacity: input.max_capacity,
    })
    .select('*')
    .single();

  if (error) {
    throw toServiceError(error, 'Unable to create pickup slot.');
  }

  return data;
}

/** Updates an existing pickup slot's capacity or unbooked schedule (staff/admin only). */
export async function updatePickupSlot(
  slotId: string,
  updates: PickupSlotUpdate
): Promise<PickupSlot> {
  const payload: PickupSlotUpdate = {};

  if (updates.slot_date !== undefined) {
    const slotDate = updates.slot_date.trim();
    if (!DATE_PATTERN.test(slotDate)) {
      throw new ServiceError('Slot date must use YYYY-MM-DD format.', {
        code: 'invalid_slot_date',
      });
    }
    payload.slot_date = slotDate;
  }

  if (updates.time_window !== undefined) {
    const timeWindow = updates.time_window.trim();
    validateTimeWindow(timeWindow);
    payload.time_window = timeWindow;
  }

  if (updates.max_capacity !== undefined) {
    if (
      !Number.isInteger(updates.max_capacity) ||
      updates.max_capacity < 1 ||
      updates.max_capacity > 500
    ) {
      throw new ServiceError('Maximum capacity must be a whole number between 1 and 500.', {
        code: 'invalid_capacity',
      });
    }
    payload.max_capacity = updates.max_capacity;
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('pickup_slots')
    .update(payload)
    .eq('id', slotId)
    .select('*')
    .single();

  if (error) {
    throw toServiceError(error, 'Unable to update pickup slot.');
  }

  return data;
}

/** Deletes an unbooked pickup slot (staff/admin only; RLS requires `booked_count = 0`). */
export async function deletePickupSlot(slotId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('pickup_slots').delete().eq('id', slotId);

  if (error) {
    throw toServiceError(error, 'Unable to delete pickup slot.');
  }
}

/**
 * Atomically books or re-books a pickup slot via the `book_pickup_slot`
 * PostgreSQL RPC (uses `SELECT ... FOR UPDATE` row locking to prevent
 * overbooking).
 */
export async function bookPickupSlot(
  requestId: string,
  slotId: string
): Promise<DocumentRequest> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('book_pickup_slot', {
    p_request_id: requestId,
    p_slot_id: slotId,
  });

  if (error) {
    throw toServiceError(error, 'Unable to book the selected pickup slot.');
  }

  return data;
}

/**
 * Subscribes to real-time changes on `public.pickup_slots` (capacity updates,
 * new windows, deletions). Returns an unsubscribe callback.
 */
export function subscribeToPickupSlots(
  onChange: (payload: RealtimePostgresChangesPayload<PickupSlot>) => void
): () => void {
  const supabase = getSupabaseClient();
  const channel = supabase
    .channel(`pickup-slots-${Date.now()}`)
    .on<PickupSlot>(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'pickup_slots' },
      onChange
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
