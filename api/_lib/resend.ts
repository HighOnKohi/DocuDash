/**
 * Server-only Resend email client for Vercel Serverless Functions (`api/`).
 *
 * Uses the official `resend` Node.js SDK with a sending-only `RESEND_API_KEY`,
 * published Resend template (`docudash-status-update`), idempotency keys, and
 * bounded retries on 429 / 5xx / transient network failures.
 */
import { Resend } from 'resend';

import { HttpError } from './http';

const DEFAULT_TEMPLATE_ID = 'docudash-status-update';
const MAX_RETRY_ATTEMPTS = 2;

let cachedResend: Resend | null = null;

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  if (!cachedResend) {
    cachedResend = new Resend(apiKey);
  }
  return cachedResend;
}

export interface StatusEmailVariables {
  RESIDENT_NAME: string;
  HEADLINE: string;
  DOCUMENT_NAME: string;
  STATUS_LABEL: string;
  BODY_MESSAGE: string;
  PICKUP_SLOT: string;
  OFFICE_NOTE: string;
}

export interface SendStatusEmailParams {
  to: string;
  subject: string;
  idempotencyKey: string;
  variables: StatusEmailVariables;
}

export interface SendStatusEmailResult {
  sent: boolean;
  emailId?: string;
}

function isRetryableResendError(error: { statusCode?: number | null; name?: string }): boolean {
  if (typeof error.statusCode === 'number') {
    return error.statusCode === 429 || error.statusCode >= 500;
  }
  return error.name === 'rate_limit_exceeded' || error.name === 'application_error';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sends a DocuDash status notification using the published Resend template.
 * Returns `{ sent: false }` when Resend env vars are not configured so callers
 * can fall back to in-app Realtime + audit logging.
 */
export async function sendStatusNotificationEmail(
  params: SendStatusEmailParams
): Promise<SendStatusEmailResult> {
  const resend = getResendClient();
  const from = process.env.NOTIFICATION_FROM_EMAIL?.trim();
  if (!resend || !from) {
    return { sent: false };
  }

  const templateId = process.env.RESEND_TEMPLATE_ID?.trim() || DEFAULT_TEMPLATE_ID;

  for (let attempt = 0; attempt <= MAX_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const { data, error } = await resend.emails.send(
        {
          from,
          to: [params.to],
          subject: params.subject,
          template: {
            id: templateId,
            variables: {
              RESIDENT_NAME: params.variables.RESIDENT_NAME,
              HEADLINE: params.variables.HEADLINE,
              DOCUMENT_NAME: params.variables.DOCUMENT_NAME,
              STATUS_LABEL: params.variables.STATUS_LABEL,
              BODY_MESSAGE: params.variables.BODY_MESSAGE,
              PICKUP_SLOT: params.variables.PICKUP_SLOT,
              OFFICE_NOTE: params.variables.OFFICE_NOTE,
            },
          },
        },
        { idempotencyKey: params.idempotencyKey }
      );

      if (!error && data?.id) {
        console.info('[DocuDash Resend email sent]', {
          emailId: data.id,
          templateId,
          idempotencyKey: params.idempotencyKey,
        });
        return { sent: true, emailId: data.id };
      }

      const retryable = error ? isRetryableResendError(error) : true;
      if (retryable && attempt < MAX_RETRY_ATTEMPTS) {
        await sleep(300 * 2 ** attempt);
        continue;
      }

      console.error('[DocuDash Resend error]', {
        name: error?.name,
        statusCode: error?.statusCode,
        message: error?.message,
      });
      throw new HttpError(
        502,
        'notification_provider_error',
        error?.message || 'Email notification provider rejected the dispatch request.'
      );
    } catch (caught) {
      if (caught instanceof HttpError) {
        throw caught;
      }
      if (attempt < MAX_RETRY_ATTEMPTS) {
        await sleep(300 * 2 ** attempt);
        continue;
      }
      console.error('[DocuDash Resend network error]', caught);
      throw new HttpError(
        502,
        'notification_provider_error',
        'Unable to reach email notification provider.'
      );
    }
  }

  return { sent: false };
}
