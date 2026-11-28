import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

import type {
  DocumentRequest,
  DocumentType,
  NotifyResidentPayload,
  NotifyResidentResponse,
  PaymentMethod,
  PaymentTiming,
  RequestStatus,
  RequestWithDetails,
  VerifyPickupResponse,
} from '@/types/database';

import {
  callApi,
  getSupabaseClient,
  requireAuthenticatedUserId,
  ServiceError,
  toServiceError,
} from './supabase';

export interface CreateRequestInput {
  documentTypeId: string;
  purpose: string;
  paymentMethod?: PaymentMethod;
  paymentTiming?: PaymentTiming;
}

export interface ListAllRequestsFilters {
  status?: RequestStatus | 'all';
  limit?: number;
  offset?: number;
  ascending?: boolean;
}

export type StaffTransitionStatus = 'reviewing' | 'ready' | 'rejected';

const REQUEST_DETAILS_SELECT = `
  *,
  document_type:document_types!requests_document_type_id_fkey(id, name, fee, required_docs),
  pickup_slot:pickup_slots!requests_pickup_slot_id_fkey(id, slot_date, time_window, max_capacity, booked_count),
  resident:profiles!requests_resident_id_fkey(id, full_name, address, contact_number),
  reviewer:profiles!requests_reviewed_by_fkey(id, full_name),
  barangay:barangays!requests_barangay_id_fkey(*),
  attachments:request_attachments(id, request_id, storage_path, doc_type, uploaded_at)
`;

/** Lists barangay document types (active only by default; staff can include inactive). */
export async function listDocumentTypes(
  options: { includeInactive?: boolean } = {}
): Promise<DocumentType[]> {
  const supabase = getSupabaseClient();
  let query = supabase.from('document_types').select('*').order('name', { ascending: true });

  if (!options.includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) {
    throw toServiceError(error, 'Unable to load document types.');
  }

  return data ?? [];
}

/**
 * Creates a new `pending` document request for the signed-in resident.
 * Pickup slot booking happens separately via `bookPickupSlot()`, and the
 * `request_created` audit entry is written automatically by a DB trigger.
 */
export async function createRequest(input: CreateRequestInput): Promise<DocumentRequest> {
  const purpose = input.purpose.trim();
  if (purpose.length < 3 || purpose.length > 500) {
    throw new ServiceError('Purpose must be between 3 and 500 characters.', {
      code: 'invalid_purpose',
    });
  }

  const residentId = await requireAuthenticatedUserId();
  const supabase = getSupabaseClient();

  const paymentMethod: PaymentMethod = input.paymentMethod ?? 'cash';
  const paymentTiming: PaymentTiming =
    paymentMethod === 'cash' ? 'pay_on_pickup' : (input.paymentTiming ?? 'pay_now');

  const { data, error } = await supabase
    .from('requests')
    .insert({
      resident_id: residentId,
      document_type_id: input.documentTypeId,
      purpose,
      payment_method: paymentMethod,
      payment_timing: paymentTiming,
    })
    .select('*')
    .single();

  if (error) {
    throw toServiceError(error, 'Unable to submit document request.');
  }

  return data;
}

/** Allows a resident to update the purpose on their own pending request. */
export async function updateRequestPurpose(
  requestId: string,
  purpose: string
): Promise<DocumentRequest> {
  const trimmed = purpose.trim();
  if (trimmed.length < 3 || trimmed.length > 500) {
    throw new ServiceError('Purpose must be between 3 and 500 characters.', {
      code: 'invalid_purpose',
    });
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('requests')
    .update({ purpose: trimmed })
    .eq('id', requestId)
    .select('*')
    .single();

  if (error) {
    throw toServiceError(error, 'Unable to update request purpose.');
  }

  return data;
}

/** Lists requests belonging to the signed-in resident (newest first). */
export async function listResidentRequests(residentId?: string): Promise<RequestWithDetails[]> {
  const targetResidentId = residentId ?? (await requireAuthenticatedUserId());
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('requests')
    .select(REQUEST_DETAILS_SELECT)
    .eq('resident_id', targetResidentId)
    .order('created_at', { ascending: false });

  if (error) {
    throw toServiceError(error, 'Unable to load your document requests.');
  }

  return (data ?? []) as unknown as RequestWithDetails[];
}

/** Lists requests for the staff queue (defaults to oldest-first FIFO ordering). */
export async function listAllRequests(
  filters: ListAllRequestsFilters = {}
): Promise<RequestWithDetails[]> {
  const supabase = getSupabaseClient();
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const offset = Math.max(filters.offset ?? 0, 0);
  const ascending = filters.ascending ?? true;

  let query = supabase
    .from('requests')
    .select(REQUEST_DETAILS_SELECT)
    .order('created_at', { ascending })
    .range(offset, offset + limit - 1);

  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status);
  }

  const { data, error } = await query;
  if (error) {
    throw toServiceError(error, 'Unable to load barangay requests.');
  }

  return (data ?? []) as unknown as RequestWithDetails[];
}

/** Fetches a single hydrated request by ID (RLS restricts to owner or staff). */
export async function getRequestById(requestId: string): Promise<RequestWithDetails | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('requests')
    .select(REQUEST_DETAILS_SELECT)
    .eq('id', requestId)
    .maybeSingle();

  if (error) {
    throw toServiceError(error, 'Unable to load request details.');
  }

  return (data as unknown as RequestWithDetails | null) ?? null;
}

/**
 * Transitions a request through the staff workflow state machine:
 * - `pending -> reviewing` (`startReview`)
 * - `reviewing -> ready` (`approveRequest`, generates server-side QR token)
 * - `pending | reviewing -> rejected` (`rejectRequest`, requires reason, frees slot)
 *
 * Transitioning `ready -> completed` is intentionally NOT allowed here; use
 * `verifyPickupByQrToken()` so verification runs atomically on the server.
 */
export async function updateRequestStatus(
  requestId: string,
  nextStatus: StaffTransitionStatus,
  options: { rejectionReason?: string } = {}
): Promise<DocumentRequest> {
  const payload: { status: StaffTransitionStatus; rejection_reason?: string } = {
    status: nextStatus,
  };

  if (nextStatus === 'rejected') {
    const reason = options.rejectionReason?.trim() ?? '';
    if (reason.length < 3) {
      throw new ServiceError('Please provide a clear rejection reason (at least 3 characters).', {
        code: 'rejection_reason_required',
      });
    }
    payload.rejection_reason = reason;
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('requests')
    .update(payload)
    .eq('id', requestId)
    .select('*')
    .single();

  if (error) {
    throw toServiceError(error, 'Unable to update request status.');
  }

  return data;
}

export function startReview(requestId: string): Promise<DocumentRequest> {
  return updateRequestStatus(requestId, 'reviewing');
}

export function approveRequest(requestId: string): Promise<DocumentRequest> {
  return updateRequestStatus(requestId, 'ready');
}

export function rejectRequest(
  requestId: string,
  rejectionReason: string
): Promise<DocumentRequest> {
  return updateRequestStatus(requestId, 'rejected', { rejectionReason });
}

/** Switches a resident's payment choice between GCash (Pay Now / Pickup) and Cash (on Pickup). */
export async function setRequestPaymentOption(
  requestId: string,
  method: PaymentMethod,
  timing: PaymentTiming
): Promise<DocumentRequest> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('set_request_payment_option', {
    p_request_id: requestId,
    p_method: method,
    p_timing: method === 'cash' ? 'pay_on_pickup' : timing,
  });

  if (error || !data) {
    throw toServiceError(error, 'Unable to update payment option.');
  }

  return data;
}

/** Submits a GCash reference number and private receipt proof for staff verification. */
export async function submitGcashPayment(
  requestId: string,
  referenceNumber: string,
  proofPath: string
): Promise<DocumentRequest> {
  const trimmedRef = referenceNumber.trim();
  if (trimmedRef.length < 6 || trimmedRef.length > 64) {
    throw new ServiceError('Please enter a valid GCash reference number (6–64 characters).', {
      code: 'invalid_payment_reference',
    });
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('submit_gcash_payment', {
    p_request_id: requestId,
    p_reference_number: trimmedRef,
    p_proof_path: proofPath,
  });

  if (error || !data) {
    throw toServiceError(error, 'Unable to submit GCash payment proof.');
  }

  return data;
}

/** Staff/admin manual Cash or digital GCash payment verification. */
export async function verifyRequestPayment(
  requestId: string,
  decision: 'verified' | 'rejected',
  options: { method?: PaymentMethod; reference?: string; notes?: string } = {}
): Promise<DocumentRequest> {
  if (decision === 'rejected' && (!options.notes || options.notes.trim().length < 3)) {
    throw new ServiceError('Please enter a reason for rejecting this payment proof.', {
      code: 'payment_rejection_reason_required',
    });
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('verify_request_payment', {
    p_request_id: requestId,
    p_decision: decision,
    p_method: options.method ?? null,
    p_reference: options.reference?.trim() || null,
    p_notes: options.notes?.trim() || null,
  });

  if (error || !data) {
    throw toServiceError(error, 'Unable to update payment verification status.');
  }

  return data;
}

/**
 * Verifies a resident's QR pickup pass via the server-only Vercel endpoint
 * `POST /api/verify-pickup` (staff/admin only).
 */
export async function verifyPickupByQrToken(qrToken: string): Promise<VerifyPickupResponse> {
  const trimmed = qrToken.trim();
  if (trimmed.length < 43) {
    throw new ServiceError('Invalid QR pickup token.', { code: 'invalid_qr_token' });
  }

  return callApi<VerifyPickupResponse>('/api/verify-pickup', {
    method: 'POST',
    body: { qrToken: trimmed },
  });
}

/**
 * Dispatches a resident status/pickup alert via Vercel `POST /api/notify-resident`
 * (staff/admin only).
 */
export async function notifyResident(
  payload: NotifyResidentPayload
): Promise<NotifyResidentResponse> {
  return callApi<NotifyResidentResponse>('/api/notify-resident', {
    method: 'POST',
    body: payload,
  });
}

/**
 * Subscribes to live updates for a single request. Returns an unsubscribe callback.
 */
export function subscribeToRequest(
  requestId: string,
  onChange: (payload: RealtimePostgresChangesPayload<DocumentRequest>) => void
): () => void {
  const supabase = getSupabaseClient();
  const channel = supabase
    .channel(`request-${requestId}-${Date.now()}`)
    .on<DocumentRequest>(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'requests',
        filter: `id=eq.${requestId}`,
      },
      onChange
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

/**
 * Subscribes to live updates for all requests belonging to a resident.
 */
export function subscribeToResidentRequests(
  residentId: string,
  onChange: (payload: RealtimePostgresChangesPayload<DocumentRequest>) => void
): () => void {
  const supabase = getSupabaseClient();
  const channel = supabase
    .channel(`resident-requests-${residentId}-${Date.now()}`)
    .on<DocumentRequest>(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'requests',
        filter: `resident_id=eq.${residentId}`,
      },
      onChange
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

/**
 * Subscribes to live updates for the full barangay request queue (staff/admin;
 * Supabase Realtime enforces RLS on delivered events).
 */
export function subscribeToAllRequests(
  onChange: (payload: RealtimePostgresChangesPayload<DocumentRequest>) => void
): () => void {
  const supabase = getSupabaseClient();
  const channel = supabase
    .channel(`all-requests-${Date.now()}`)
    .on<DocumentRequest>(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'requests' },
      onChange
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
