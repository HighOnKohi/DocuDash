import type { VercelRequest, VercelResponse } from '@vercel/node';

import type { PurgeAttachmentsPayload } from '../types/database';
import { requireCronOrAdmin } from './_lib/auth';
import {
  applyCors,
  handleRouteError,
  HttpError,
  parseJsonBody,
  requireMethod,
  sendJson,
} from './_lib/http';
import { DEFAULT_RETENTION_DAYS, runRetentionPurge } from './_lib/retentionPurge';
import { getSupabaseAdmin } from './_lib/supabaseAdmin';

function parseOptionalPayload(req: VercelRequest): PurgeAttachmentsPayload {
  const { body } = req;
  if (body == null || body === '') {
    return {};
  }

  const parsed = parseJsonBody<{ retentionDays?: unknown; dryRun?: unknown }>(req);
  const result: PurgeAttachmentsPayload = {};

  if (parsed.retentionDays !== undefined) {
    if (
      typeof parsed.retentionDays !== 'number' ||
      !Number.isInteger(parsed.retentionDays) ||
      parsed.retentionDays < 1 ||
      parsed.retentionDays > 365
    ) {
      throw new HttpError(
        400,
        'invalid_retention_days',
        'retentionDays must be an integer between 1 and 365.'
      );
    }
    result.retentionDays = parsed.retentionDays;
  }

  if (parsed.dryRun !== undefined) {
    if (typeof parsed.dryRun !== 'boolean') {
      throw new HttpError(400, 'invalid_dry_run', 'dryRun must be a boolean.');
    }
    result.dryRun = parsed.dryRun;
  }

  return result;
}

/**
 * POST /api/purge-attachments
 *
 * Purges resident requirement files older than 30 days (RA 10173 storage
 * limitation) via the Supabase Storage API. Triggered automatically by GitHub
 * Actions (`.github/workflows/retention-purge.yml`) or Supabase `pg_cron` +
 * `pg_net` (`supabase/retention_pg_cron.sql`) with `Bearer $CRON_SECRET`, or on
 * demand by an authenticated administrator (`profiles.role = 'admin'`).
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (applyCors(req, res, ['POST', 'OPTIONS'])) {
    return;
  }

  try {
    requireMethod(req, 'POST');
    const caller = await requireCronOrAdmin(req);
    const payload = parseOptionalPayload(req);

    const supabaseAdmin = getSupabaseAdmin();
    const summary = await runRetentionPurge({
      supabaseAdmin,
      retentionDays: payload.retentionDays ?? DEFAULT_RETENTION_DAYS,
      dryRun: payload.dryRun ?? false,
      actorId: caller.actorId,
      triggeredBy: caller.kind,
    });

    sendJson(res, 200, summary);
  } catch (error) {
    handleRouteError(res, error);
  }
}
