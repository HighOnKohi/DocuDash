import type { VercelRequest, VercelResponse } from '@vercel/node';

import type { DeleteAccountResponse } from '../types/database';
import { isConfiguredAppManagerEmail, requireAuthenticatedUser } from './_lib/auth';
import {
  applyCors,
  handleRouteError,
  HttpError,
  parseJsonBody,
  requireMethod,
  sendJson,
} from './_lib/http';
import { getSupabaseAdmin } from './_lib/supabaseAdmin';

const REQUIREMENTS_BUCKET = 'requirements';
const STORAGE_REMOVE_BATCH_SIZE = 100;
const STORAGE_LIST_LIMIT = 1000;

/**
 * Lists any files remaining under `{userId}/` inside the private `requirements`
 * bucket so orphaned uploads are removed alongside tracked `request_attachments`.
 */
async function listUserBucketPaths(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  userId: string
): Promise<string[]> {
  const paths: string[] = [];
  const { data: topEntries, error: listError } = await supabaseAdmin.storage
    .from(REQUIREMENTS_BUCKET)
    .list(userId, { limit: STORAGE_LIST_LIMIT });

  if (listError || !topEntries) {
    return paths;
  }

  for (const entry of topEntries) {
    if (!entry.name) continue;
    const entryPath = `${userId}/${entry.name}`;
    if (entry.id) {
      paths.push(entryPath);
    } else {
      const { data: nestedEntries } = await supabaseAdmin.storage
        .from(REQUIREMENTS_BUCKET)
        .list(entryPath, { limit: STORAGE_LIST_LIMIT });

      for (const nested of nestedEntries ?? []) {
        if (nested.name && nested.id) {
          paths.push(`${entryPath}/${nested.name}`);
        }
      }
    }
  }

  return paths;
}

/**
 * POST /api/delete-account
 *
 * Self-service RA 10173 right-to-erasure endpoint for resident accounts:
 * 1. Verifies the caller's Supabase JWT and requires `confirmation: "DELETE"`.
 * 2. Prevents staff/admin self-deletion so administrative audit trails stay intact.
 * 3. Deletes all private Storage IDs/files owned by the resident first.
 * 4. Writes a PII-free `account_deleted` entry to `audit_logs`.
 * 5. Deletes the Supabase Auth user (cascading `profiles`, `requests`, and
 *    `request_attachments`, while releasing open pickup slot capacity).
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (applyCors(req, res, ['POST', 'OPTIONS'])) {
    return;
  }

  try {
    requireMethod(req, 'POST');
    const caller = await requireAuthenticatedUser(req);
    const body = parseJsonBody<{ confirmation?: unknown }>(req);

    if (body.confirmation !== 'DELETE') {
      throw new HttpError(
        400,
        'confirmation_required',
        'Confirmation must equal "DELETE" to permanently delete your account.'
      );
    }

    if (isConfiguredAppManagerEmail(caller.email)) {
      throw new HttpError(
        403,
        'manager_self_delete_forbidden',
        'The App Manager platform account cannot be self-deleted.'
      );
    }

    if (caller.role === 'staff' || caller.role === 'admin') {
      throw new HttpError(
        403,
        'staff_self_delete_forbidden',
        'Staff and administrator accounts cannot be self-deleted. Contact your Barangay System Administrator to revoke staff access.'
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    // 1. Collect all resident requests and attachment paths before cascading delete.
    const { data: residentRequests, error: requestsError } = await supabaseAdmin
      .from('requests')
      .select('id')
      .eq('resident_id', caller.userId);

    if (requestsError) {
      console.error('[DocuDash delete-account] Failed to load resident requests:', {
        code: requestsError.code,
        message: requestsError.message,
      });
      throw new HttpError(500, 'request_lookup_failed', 'Unable to prepare account deletion.');
    }

    const requestIds = (residentRequests ?? []).map((row) => row.id);
    const storagePaths = new Set<string>();

    if (requestIds.length > 0) {
      const { data: attachments, error: attachmentsError } = await supabaseAdmin
        .from('request_attachments')
        .select('storage_path')
        .in('request_id', requestIds);

      if (attachmentsError) {
        console.error('[DocuDash delete-account] Failed to load attachment paths:', {
          code: attachmentsError.code,
          message: attachmentsError.message,
        });
        throw new HttpError(
          500,
          'attachment_lookup_failed',
          'Unable to prepare uploaded files for removal.'
        );
      }

      for (const row of attachments ?? []) {
        if (row.storage_path) {
          storagePaths.add(row.storage_path);
        }
      }
    }

    for (const bucketPath of await listUserBucketPaths(supabaseAdmin, caller.userId)) {
      storagePaths.add(bucketPath);
    }

    // 2. Purge all private requirement files via Storage API before deleting DB rows.
    const uniqueStoragePaths = Array.from(storagePaths);
    for (let offset = 0; offset < uniqueStoragePaths.length; offset += STORAGE_REMOVE_BATCH_SIZE) {
      const batch = uniqueStoragePaths.slice(offset, offset + STORAGE_REMOVE_BATCH_SIZE);
      const { error: removeError } = await supabaseAdmin.storage
        .from(REQUIREMENTS_BUCKET)
        .remove(batch);

      if (removeError) {
        console.error('[DocuDash delete-account] Storage cleanup failed:', {
          batchSize: batch.length,
          message: removeError.message,
        });
        throw new HttpError(
          500,
          'storage_cleanup_failed',
          'Unable to erase uploaded requirement files. Please try again.'
        );
      }
    }

    // 3. Write PII-free aggregate audit log before deleting auth user.
    let auditLogged = false;
    const { error: auditError } = await supabaseAdmin.from('audit_logs').insert({
      actor_id: null,
      action: 'account_deleted',
      request_id: null,
      metadata: {
        role: caller.role,
        deleted_requests_count: requestIds.length,
        deleted_attachments_count: uniqueStoragePaths.length,
      },
    });

    if (auditError) {
      console.error('[DocuDash delete-account] Audit insert failed:', {
        code: auditError.code,
        message: auditError.message,
      });
    } else {
      auditLogged = true;
    }

    // 4. Delete Auth user (cascades profiles, requests, attachments & frees open slots).
    const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(caller.userId);
    if (deleteUserError) {
      console.error('[DocuDash delete-account] auth.admin.deleteUser failed:', {
        message: deleteUserError.message,
      });
      throw new HttpError(
        500,
        'account_delete_failed',
        'Unable to delete your account right now. Please try again.'
      );
    }

    const response: DeleteAccountResponse = {
      ok: true,
      deletedRequestsCount: requestIds.length,
      deletedAttachmentsCount: uniqueStoragePaths.length,
      auditLogged,
    };
    sendJson(res, 200, response);
  } catch (error) {
    handleRouteError(res, error);
  }
}
