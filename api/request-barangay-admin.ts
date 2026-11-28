import type { VercelRequest, VercelResponse } from '@vercel/node';

import type {
  BarangayAdminRequestPayload,
  BarangayAdminRequestResponse,
} from '../types/database';
import {
  applyCors,
  handleRouteError,
  HttpError,
  parseJsonBody,
  requireMethod,
  sendJson,
} from './_lib/http';
import { sendBarangayAdminRequestEmail } from './_lib/smtp';
import { getSupabaseAdmin } from './_lib/supabaseAdmin';

const DEFAULT_ADMIN_REQUEST_EMAIL = 'docudash.app@gmail.com';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTACT_PATTERN = /^\+?[0-9][0-9 -]{6,18}[0-9]$/;

function requireStringField(
  raw: unknown,
  label: string,
  minLength: number,
  maxLength: number
): string {
  if (typeof raw !== 'string') {
    throw new HttpError(400, 'invalid_payload', `${label} is required.`);
  }
  const trimmed = raw.trim();
  if (trimmed.length < minLength || trimmed.length > maxLength) {
    throw new HttpError(
      400,
      'invalid_payload',
      `${label} must be between ${minLength} and ${maxLength} characters.`
    );
  }
  return trimmed;
}

function optionalStringField(raw: unknown, maxLength: number): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

/**
 * POST /api/request-barangay-admin
 *
 * Public onboarding request endpoint allowing barangay officials to apply for
 * DocuDash Barangay Admin access. Records the application and automatically
 * emails `docudash.app@gmail.com`.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (applyCors(req, res, ['POST', 'OPTIONS'])) {
    return;
  }

  try {
    requireMethod(req, 'POST');
    const body = parseJsonBody<Record<string, unknown>>(req);

    const payload: BarangayAdminRequestPayload = {
      psgcCode: optionalStringField(body.psgcCode, 32),
      barangayName: requireStringField(body.barangayName, 'Barangay name', 2, 120),
      cityMunicipality: requireStringField(body.cityMunicipality, 'City / Municipality', 2, 120),
      province: optionalStringField(body.province, 120) ?? '',
      region: optionalStringField(body.region, 120) ?? '',
      hallAddress: requireStringField(body.hallAddress, 'Barangay Hall address', 5, 300),
      googleMapsUrl: optionalStringField(body.googleMapsUrl, 500),
      applicantName: requireStringField(body.applicantName, 'Official full name', 2, 120),
      applicantPosition: requireStringField(body.applicantPosition, 'Position / title', 2, 100),
      applicantEmail: requireStringField(body.applicantEmail, 'Work email', 5, 160).toLowerCase(),
      contactNumber: requireStringField(body.contactNumber, 'Contact number', 7, 25),
      notes: optionalStringField(body.notes, 800),
    };

    if (!EMAIL_PATTERN.test(payload.applicantEmail)) {
      throw new HttpError(400, 'invalid_email', 'Please enter a valid work email address.');
    }

    if (!CONTACT_PATTERN.test(payload.contactNumber)) {
      throw new HttpError(
        400,
        'invalid_contact_number',
        'Please enter a valid Philippine mobile or landline number.'
      );
    }

    if (payload.googleMapsUrl && !/^https?:\/\//i.test(payload.googleMapsUrl)) {
      throw new HttpError(
        400,
        'invalid_maps_url',
        'Google Maps link must start with https:// or http://.'
      );
    }

    let requestId: string | null = null;
    try {
      const supabaseAdmin = getSupabaseAdmin();
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from('barangay_admin_requests')
        .insert({
          psgc_code: payload.psgcCode ?? null,
          barangay_name: payload.barangayName,
          city_municipality: payload.cityMunicipality,
          province: payload.province ?? '',
          region: payload.region ?? '',
          hall_address: payload.hallAddress,
          google_maps_url: payload.googleMapsUrl ?? null,
          applicant_name: payload.applicantName,
          applicant_position: payload.applicantPosition,
          applicant_email: payload.applicantEmail,
          contact_number: payload.contactNumber,
          notes: payload.notes ?? null,
        })
        .select('id')
        .single();

      if (!insertError && inserted?.id) {
        requestId = inserted.id;
      } else if (insertError) {
        console.warn('[DocuDash request-barangay-admin] DB insert skipped:', insertError.code);
      }
    } catch {
      // Do not fail email dispatch if migration 005 has not been applied yet.
    }

    const targetEmail =
      process.env.ADMIN_REQUEST_EMAIL?.trim() || DEFAULT_ADMIN_REQUEST_EMAIL;

    const smtpResult = await sendBarangayAdminRequestEmail({
      to: targetEmail,
      requestId,
      barangayName: payload.barangayName,
      cityMunicipality: payload.cityMunicipality,
      province: payload.province ?? '',
      region: payload.region ?? '',
      psgcCode: payload.psgcCode ?? null,
      hallAddress: payload.hallAddress,
      googleMapsUrl: payload.googleMapsUrl ?? null,
      applicantName: payload.applicantName,
      applicantPosition: payload.applicantPosition,
      applicantEmail: payload.applicantEmail,
      contactNumber: payload.contactNumber,
      notes: payload.notes ?? null,
    });

    const response: BarangayAdminRequestResponse = {
      ok: true,
      requestId,
      emailedTo: targetEmail,
      deliveredVia: smtpResult.sent ? 'email' : 'recorded_only',
    };
    sendJson(res, 200, response);
  } catch (error) {
    handleRouteError(res, error);
  }
}
