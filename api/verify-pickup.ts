import type { VercelRequest, VercelResponse } from '@vercel/node';

import type { DocumentRequest, VerifyPickupResponse } from '../types/database';
import { requireStaff } from './_lib/auth';
import {
  applyCors,
  handleRouteError,
  HttpError,
  parseJsonBody,
  requireMethod,
  sendJson,
} from './_lib/http';
import { getSupabaseAdmin } from './_lib/supabaseAdmin';

const QR_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;

function mapVerifyRpcError(error: { code?: string; message?: string }): HttpError {
  const message = error.message?.trim() || 'Unable to verify pickup pass.';
  switch (error.code) {
    case 'P0002':
      return new HttpError(404, 'pickup_not_found', message);
    case '42501':
      return new HttpError(403, 'forbidden', message);
    case '22023': {
      const lower = message.toLowerCase();
      if (lower.includes('already been claimed')) {
        return new HttpError(409, 'already_claimed', message);
      }
      if (lower.includes('not ready')) {
        return new HttpError(409, 'not_ready_for_pickup', message);
      }
      return new HttpError(400, 'invalid_qr_token', message);
    }
    default:
      return new HttpError(500, 'verify_pickup_failed', 'Unable to verify pickup pass.');
  }
}

/**
 * POST /api/verify-pickup
 *
 * Staff-only serverless endpoint that atomically validates a resident's QR
 * pickup token, transitions the request from `ready` -> `completed`, writes
 * an immutable `pickup_verified` audit entry (via the server-only
 * `public.verify_pickup` RPC), and returns the hydrated receipt details.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (applyCors(req, res, ['POST', 'OPTIONS'])) {
    return;
  }

  try {
    requireMethod(req, 'POST');
    const staff = await requireStaff(req);
    const body = parseJsonBody<{ qrToken?: unknown }>(req);

    const qrToken = typeof body.qrToken === 'string' ? body.qrToken.trim() : '';
    if (!QR_TOKEN_PATTERN.test(qrToken)) {
      throw new HttpError(400, 'invalid_qr_token', 'Invalid QR pickup token format.');
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: verifiedRequest, error: rpcError } = await supabaseAdmin.rpc('verify_pickup', {
      p_qr_token: qrToken,
      p_staff_id: staff.userId,
    });

    if (rpcError || !verifiedRequest) {
      throw mapVerifyRpcError(rpcError ?? {});
    }

    const requestRow: DocumentRequest = verifiedRequest;

    const [residentResult, docTypeResult, slotResult] = await Promise.all([
      supabaseAdmin
        .from('profiles')
        .select('id, full_name, address, contact_number')
        .eq('id', requestRow.resident_id)
        .single(),
      supabaseAdmin
        .from('document_types')
        .select('id, name, fee')
        .eq('id', requestRow.document_type_id)
        .single(),
      requestRow.pickup_slot_id
        ? supabaseAdmin
            .from('pickup_slots')
            .select('id, slot_date, time_window')
            .eq('id', requestRow.pickup_slot_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (residentResult.error || !residentResult.data) {
      throw new HttpError(500, 'hydration_failed', 'Verified pickup, but failed to load resident.');
    }
    if (docTypeResult.error || !docTypeResult.data) {
      throw new HttpError(
        500,
        'hydration_failed',
        'Verified pickup, but failed to load document type.'
      );
    }
    if (slotResult.error) {
      throw new HttpError(
        500,
        'hydration_failed',
        'Verified pickup, but failed to load pickup slot.'
      );
    }

    const responsePayload: VerifyPickupResponse = {
      ok: true,
      request: requestRow,
      resident: residentResult.data,
      documentType: docTypeResult.data,
      pickupSlot: slotResult.data,
    };

    sendJson(res, 200, responsePayload);
  } catch (error) {
    handleRouteError(res, error);
  }
}
