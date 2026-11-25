import type { AuditAction, AuditLog, Json } from '@/types/database';

import { getSupabaseClient, requireAuthenticatedUserId, toServiceError } from './supabase';

export interface AppendAuditLogInput {
  action: AuditAction;
  requestId?: string | null;
  metadata?: Record<string, Json | undefined>;
}

export interface ListAuditLogsFilters {
  requestId?: string;
  actorId?: string;
  action?: AuditAction;
  limit?: number;
  offset?: number;
}

/**
 * Appends an immutable entry to `public.audit_logs`.
 *
 * Only staff/admin users may insert directly from the client (enforced by RLS
 * `audit_logs_staff_insert`, requiring `actor_id = auth.uid()`). Request
 * lifecycle transitions and slot bookings are logged automatically by database
 * triggers and RPCs, so use this for client-side staff actions such as
 * `attachment_viewed`.
 */
export async function appendAuditLog(input: AppendAuditLogInput): Promise<void> {
  const actorId = await requireAuthenticatedUserId();
  const supabase = getSupabaseClient();

  const { error } = await supabase.from('audit_logs').insert({
    actor_id: actorId,
    action: input.action,
    request_id: input.requestId ?? null,
    metadata: input.metadata ?? {},
  });

  if (error) {
    throw toServiceError(error, 'Unable to write audit log entry.');
  }
}

/**
 * Reads the append-only audit trail (staff/admin only; RLS blocks residents).
 */
export async function listAuditLogs(filters: ListAuditLogsFilters = {}): Promise<AuditLog[]> {
  const supabase = getSupabaseClient();
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const offset = Math.max(filters.offset ?? 0, 0);

  let query = supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1);

  if (filters.requestId) {
    query = query.eq('request_id', filters.requestId);
  }
  if (filters.actorId) {
    query = query.eq('actor_id', filters.actorId);
  }
  if (filters.action) {
    query = query.eq('action', filters.action);
  }

  const { data, error } = await query;
  if (error) {
    throw toServiceError(error, 'Unable to load audit logs.');
  }

  return data ?? [];
}
