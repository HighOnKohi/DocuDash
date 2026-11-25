import type { VercelRequest, VercelResponse } from '@vercel/node';

import type { NotifyResidentPayload, NotifyResidentResponse } from '../types/database';
import { requireStaff } from './_lib/auth';
import {
  applyCors,
  handleRouteError,
  HttpError,
  parseJsonBody,
  requireMethod,
  sendJson,
} from './_lib/http';
import { sendStatusNotificationEmail, type StatusEmailVariables } from './_lib/resend';
import { getSupabaseAdmin } from './_lib/supabaseAdmin';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_EVENTS: readonly NotifyResidentPayload['event'][] = [
  'reviewing',
  'ready',
  'rejected',
  'completed',
  'slot_reminder',
];

function isNotificationEvent(value: unknown): value is NotifyResidentPayload['event'] {
  return typeof value === 'string' && (ALLOWED_EVENTS as readonly string[]).includes(value);
}

function buildTemplatePayload(params: {
  event: NotifyResidentPayload['event'];
  residentName: string;
  documentName: string;
  slotText: string | null;
  rejectionReason: string | null;
  customMessage?: string;
}): { subject: string; variables: StatusEmailVariables } {
  const { event, residentName, documentName, slotText, rejectionReason, customMessage } = params;
  const pickupSlot = slotText ?? 'Not yet scheduled';
  const officeNote = customMessage
    ? `Note from the barangay office: ${customMessage}`
    : 'Please keep this email for your records.';

  switch (event) {
    case 'reviewing': {
      const headline = `Your ${documentName} request is under review`;
      return {
        subject: `DocuDash: ${headline}`,
        variables: {
          RESIDENT_NAME: residentName,
          HEADLINE: headline,
          DOCUMENT_NAME: documentName,
          STATUS_LABEL: 'Under Review',
          BODY_MESSAGE: `Barangay staff have started reviewing your request for ${documentName}. We will notify you once your document is ready for pickup.`,
          PICKUP_SLOT: pickupSlot,
          OFFICE_NOTE: officeNote,
        },
      };
    }
    case 'ready': {
      const headline = `Your ${documentName} is ready for pickup`;
      return {
        subject: `DocuDash: ${headline}`,
        variables: {
          RESIDENT_NAME: residentName,
          HEADLINE: headline,
          DOCUMENT_NAME: documentName,
          STATUS_LABEL: 'Ready for Pickup',
          BODY_MESSAGE: `Your ${documentName} has been approved and prepared. Bring a valid government ID and present your QR pickup pass in DocuDash at the barangay counter.`,
          PICKUP_SLOT: pickupSlot,
          OFFICE_NOTE: officeNote,
        },
      };
    }
    case 'rejected': {
      const headline = `Update on your ${documentName} request`;
      const reasonText = rejectionReason ? ` Reason: ${rejectionReason}` : '';
      return {
        subject: `DocuDash: ${headline}`,
        variables: {
          RESIDENT_NAME: residentName,
          HEADLINE: headline,
          DOCUMENT_NAME: documentName,
          STATUS_LABEL: 'Action Needed',
          BODY_MESSAGE: `Your request for ${documentName} could not be approved.${reasonText} You may submit a new request in DocuDash once the requirements are updated.`,
          PICKUP_SLOT: 'Released (no active booking)',
          OFFICE_NOTE: officeNote,
        },
      };
    }
    case 'completed': {
      const headline = `${documentName} pickup confirmed`;
      return {
        subject: `DocuDash: ${headline}`,
        variables: {
          RESIDENT_NAME: residentName,
          HEADLINE: headline,
          DOCUMENT_NAME: documentName,
          STATUS_LABEL: 'Completed',
          BODY_MESSAGE: `Thank you! Your ${documentName} has been released at the barangay counter and your request is now marked completed.`,
          PICKUP_SLOT: pickupSlot,
          OFFICE_NOTE: officeNote,
        },
      };
    }
    case 'slot_reminder': {
      const headline = `Pickup reminder for your ${documentName}`;
      return {
        subject: `DocuDash: ${headline}`,
        variables: {
          RESIDENT_NAME: residentName,
          HEADLINE: headline,
          DOCUMENT_NAME: documentName,
          STATUS_LABEL: 'Pickup Reminder',
          BODY_MESSAGE: `This is a reminder for your upcoming ${documentName} pickup. Please arrive within your booked window with your DocuDash QR pass and a valid ID.`,
          PICKUP_SLOT: pickupSlot,
          OFFICE_NOTE: officeNote,
        },
      };
    }
  }
}

/**
 * POST /api/notify-resident
 *
 * Staff-only serverless endpoint that dispatches a status or pickup reminder
 * alert to a resident via the official Resend SDK + published template when
 * configured (with idempotency key per event/request), otherwise records an
 * in-app Realtime dispatch in `public.audit_logs`.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (applyCors(req, res, ['POST', 'OPTIONS'])) {
    return;
  }

  try {
    requireMethod(req, 'POST');
    const staff = await requireStaff(req);
    const body = parseJsonBody<{ requestId?: unknown; event?: unknown; message?: unknown }>(req);

    const requestId = typeof body.requestId === 'string' ? body.requestId.trim() : '';
    if (!UUID_PATTERN.test(requestId)) {
      throw new HttpError(400, 'invalid_request_id', 'A valid requestId UUID is required.');
    }

    if (!isNotificationEvent(body.event)) {
      throw new HttpError(
        400,
        'invalid_event',
        'event must be one of reviewing, ready, rejected, completed, or slot_reminder.'
      );
    }

    let customMessage: string | undefined;
    if (body.message !== undefined) {
      if (typeof body.message !== 'string') {
        throw new HttpError(400, 'invalid_message', 'message must be a string.');
      }
      const trimmed = body.message.trim();
      if (trimmed.length > 500) {
        throw new HttpError(400, 'message_too_long', 'message must be 500 characters or fewer.');
      }
      if (trimmed.length > 0) {
        customMessage = trimmed;
      }
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: requestRow, error: requestError } = await supabaseAdmin
      .from('requests')
      .select('id, resident_id, document_type_id, pickup_slot_id, status, rejection_reason')
      .eq('id', requestId)
      .maybeSingle();

    if (requestError) {
      throw new HttpError(500, 'request_lookup_failed', 'Unable to load request.');
    }
    if (!requestRow) {
      throw new HttpError(404, 'request_not_found', 'Document request not found.');
    }

    const [residentResult, docTypeResult, slotResult, authUserResult] = await Promise.all([
      supabaseAdmin
        .from('profiles')
        .select('id, full_name')
        .eq('id', requestRow.resident_id)
        .single(),
      supabaseAdmin
        .from('document_types')
        .select('name')
        .eq('id', requestRow.document_type_id)
        .single(),
      requestRow.pickup_slot_id
        ? supabaseAdmin
            .from('pickup_slots')
            .select('slot_date, time_window')
            .eq('id', requestRow.pickup_slot_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabaseAdmin.auth.admin.getUserById(requestRow.resident_id),
    ]);

    if (residentResult.error || !residentResult.data || docTypeResult.error || !docTypeResult.data) {
      throw new HttpError(500, 'resident_lookup_failed', 'Unable to resolve notification details.');
    }

    const slotText = slotResult.data
      ? `${slotResult.data.slot_date} (${slotResult.data.time_window})`
      : null;

    const templatePayload = buildTemplatePayload({
      event: body.event,
      residentName: residentResult.data.full_name,
      documentName: docTypeResult.data.name,
      slotText,
      rejectionReason: requestRow.rejection_reason,
      customMessage,
    });

    const idempotencyKey =
      body.event === 'slot_reminder'
        ? `slot-reminder/${requestRow.id}/${slotResult.data?.slot_date ?? 'unscheduled'}`
        : `notify-${body.event}/${requestRow.id}`;

    const recipientEmail = authUserResult.data?.user?.email ?? null;
    const emailResult = recipientEmail
      ? await sendStatusNotificationEmail({
          to: recipientEmail,
          subject: templatePayload.subject,
          idempotencyKey,
          variables: templatePayload.variables,
        })
      : { sent: false };

    const deliveredVia: NotifyResidentResponse['deliveredVia'] = emailResult.sent
      ? 'email'
      : 'in_app_logged';

    // Audit without storing PII (email/phone) in metadata (RA 10173 data minimization).
    const { error: auditError } = await supabaseAdmin.from('audit_logs').insert({
      actor_id: staff.userId,
      action: 'notification_dispatched',
      request_id: requestRow.id,
      metadata: {
        event: body.event,
        channel: deliveredVia,
        recipient_id: requestRow.resident_id,
        has_custom_message: Boolean(customMessage),
        ...(emailResult.emailId ? { email_id: emailResult.emailId } : {}),
      },
    });

    if (auditError) {
      throw new HttpError(500, 'audit_log_failed', 'Notification handled, but audit logging failed.');
    }

    const payload: NotifyResidentResponse = {
      ok: true,
      requestId: requestRow.id,
      event: body.event,
      deliveredVia,
      ...(emailResult.emailId ? { emailId: emailResult.emailId } : {}),
      auditLogged: true,
    };

    sendJson(res, 200, payload);
  } catch (error) {
    handleRouteError(res, error);
  }
}
