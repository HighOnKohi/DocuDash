/**
 * Server-only RA 10173 attachment retention purge routine.
 *
 * Uses `public.get_expired_attachment_paths(p_retention_days)` to find ID
 * attachments on requests completed or rejected at least `retentionDays` ago,
 * deletes the files via the Supabase Storage API in batches (never via raw SQL
 * on `storage.objects`), deletes the corresponding `request_attachments` rows
 * only after Storage deletion succeeds, and writes a single PII-free
 * `attachments_purged` entry to `public.audit_logs`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, PurgeAttachmentsResponse } from '../../types/database';
import { HttpError } from './http';

export const DEFAULT_RETENTION_DAYS = 30;
const REQUIREMENTS_BUCKET = 'requirements';
const STORAGE_REMOVE_BATCH_SIZE = 100;
const MAX_ATTACHMENTS_PER_RUN = 500;

export interface RunRetentionPurgeOptions {
  supabaseAdmin: SupabaseClient<Database>;
  retentionDays?: number;
  dryRun?: boolean;
  actorId: string | null;
  triggeredBy: 'cron_secret' | 'admin' | 'app_manager';
}

export async function runRetentionPurge(
  options: RunRetentionPurgeOptions
): Promise<PurgeAttachmentsResponse> {
  const retentionDays = options.retentionDays ?? DEFAULT_RETENTION_DAYS;
  const dryRun = options.dryRun ?? false;

  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 365) {
    throw new HttpError(
      400,
      'invalid_retention_days',
      'retentionDays must be an integer between 1 and 365.'
    );
  }

  const { data: expiredRows, error: rpcError } = await options.supabaseAdmin.rpc(
    'get_expired_attachment_paths',
    { p_retention_days: retentionDays }
  );

  if (rpcError) {
    console.error('[DocuDash retention purge] RPC failed:', rpcError);
    throw new HttpError(500, 'retention_lookup_failed', 'Unable to query expired attachments.');
  }

  const allExpired = expiredRows ?? [];
  const hasMore = allExpired.length > MAX_ATTACHMENTS_PER_RUN;
  const candidates = allExpired.slice(0, MAX_ATTACHMENTS_PER_RUN);

  const uniqueRequests = new Set(candidates.map((row) => row.request_id));

  if (dryRun || candidates.length === 0) {
    return {
      ok: true,
      retentionDays,
      dryRun,
      matchedCount: allExpired.length,
      purgedCount: 0,
      failedCount: 0,
      affectedRequestCount: uniqueRequests.size,
      hasMore,
      auditLogged: false,
      triggeredBy: options.triggeredBy,
    };
  }

  let purgedCount = 0;
  let failedCount = 0;
  const purgedRequestIds = new Set<string>();

  for (let offset = 0; offset < candidates.length; offset += STORAGE_REMOVE_BATCH_SIZE) {
    const batch = candidates.slice(offset, offset + STORAGE_REMOVE_BATCH_SIZE);
    const paths = batch.map((row) => row.storage_path);
    const ids = batch.map((row) => row.attachment_id);

    const { error: storageError } = await options.supabaseAdmin.storage
      .from(REQUIREMENTS_BUCKET)
      .remove(paths);

    if (storageError) {
      console.error('[DocuDash retention purge] Storage batch removal failed:', {
        batchSize: batch.length,
        message: storageError.message,
      });
      failedCount += batch.length;
      continue;
    }

    const { error: deleteError } = await options.supabaseAdmin
      .from('request_attachments')
      .delete()
      .in('id', ids);

    if (deleteError) {
      console.error('[DocuDash retention purge] Metadata batch delete failed:', {
        batchSize: batch.length,
        code: deleteError.code,
        message: deleteError.message,
      });
      failedCount += batch.length;
      continue;
    }

    purgedCount += batch.length;
    for (const row of batch) {
      purgedRequestIds.add(row.request_id);
    }
  }

  let auditLogged = false;
  if (purgedCount > 0) {
    // RA 10173 data minimization: log aggregate counts only (no filenames, paths, or user PII).
    const { error: auditError } = await options.supabaseAdmin.from('audit_logs').insert({
      actor_id: options.actorId,
      action: 'attachments_purged',
      request_id: null,
      metadata: {
        purged_count: purgedCount,
        failed_count: failedCount,
        affected_request_count: purgedRequestIds.size,
        retention_days: retentionDays,
        triggered_by: options.triggeredBy,
        has_more: hasMore,
      },
    });

    if (auditError) {
      console.error('[DocuDash retention purge] Audit insert failed:', auditError);
    } else {
      auditLogged = true;
    }
  }

  return {
    ok: true,
    retentionDays,
    dryRun: false,
    matchedCount: allExpired.length,
    purgedCount,
    failedCount,
    affectedRequestCount: purgedRequestIds.size,
    hasMore,
    auditLogged,
    triggeredBy: options.triggeredBy,
  };
}
