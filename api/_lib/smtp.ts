/**
 * Server-only SMTP email client for Vercel Serverless Functions (`api/`).
 *
 * Uses `nodemailer` (e.g. free Gmail App Password SMTP) so `/api/notify-resident`
 * can deliver status update emails to any resident without requiring a paid
 * custom domain on Resend. Renders an HTML layout matching `docudash-status-update`.
 */
import nodemailer from 'nodemailer';

import { HttpError } from './http';
import type {
  SendStatusEmailParams,
  SendStatusEmailResult,
  StatusEmailVariables,
} from './resend';

const DEFAULT_SMTP_HOST = 'smtp.gmail.com';
const DEFAULT_SMTP_PORT = 465;
const MAX_RETRY_ATTEMPTS = 1;
const RETRY_DELAY_MS = 300;
const SOCKET_TIMEOUT_MS = 10_000;

const RETRYABLE_NETWORK_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'ESOCKET',
  'EAI_AGAIN',
]);

export function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim());
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderStatusEmailHtml(vars: StatusEmailVariables): string {
  const statusLabel = escapeHtml(vars.STATUS_LABEL);
  const headline = escapeHtml(vars.HEADLINE);
  const residentName = escapeHtml(vars.RESIDENT_NAME);
  const bodyMessage = escapeHtml(vars.BODY_MESSAGE);
  const documentName = escapeHtml(vars.DOCUMENT_NAME);
  const pickupSlot = escapeHtml(vars.PICKUP_SLOT);
  const officeNote = escapeHtml(vars.OFFICE_NOTE);

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${headline}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0F172A;">
    <div style="background-color:#F8FAFC;padding:32px 16px;">
      <div style="max-width:560px;margin:0 auto;background-color:#FFFFFF;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;">
        <div style="background-color:#01227F;padding:24px 28px;border-bottom:4px solid #FBC128;">
          <div style="font-size:20px;font-weight:700;color:#FFFFFF;letter-spacing:-0.01em;">DocuDash</div>
          <div style="font-size:12px;color:#DCE5FF;margin-top:4px;">Barangay Document Pre-Processing &amp; Scheduled Pickup</div>
        </div>

        <div style="padding:28px;">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#01227F;">${statusLabel}</div>
          <h1 style="font-size:22px;font-weight:700;color:#0F172A;margin:8px 0 16px;line-height:1.3;">${headline}</h1>

          <p style="font-size:15px;line-height:1.6;color:#475569;margin:0 0 16px;">
            Hello ${residentName},
          </p>
          <p style="font-size:15px;line-height:1.6;color:#475569;margin:0 0 24px;">
            ${bodyMessage}
          </p>

          <div style="background-color:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:16px 18px;">
            <div style="font-size:12px;color:#64748B;margin-bottom:4px;">Document</div>
            <div style="font-size:15px;font-weight:700;color:#0F172A;margin-bottom:14px;">${documentName}</div>
            <div style="font-size:12px;color:#64748B;margin-bottom:4px;">Pickup Schedule</div>
            <div style="font-size:14px;font-weight:600;color:#0F172A;">${pickupSlot}</div>
          </div>

          <p style="font-size:13px;line-height:1.5;color:#64748B;margin:24px 0 0;">
            ${officeNote}
          </p>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

function renderStatusEmailText(vars: StatusEmailVariables): string {
  return [
    `DocuDash — ${vars.STATUS_LABEL}`,
    vars.HEADLINE,
    '',
    `Hello ${vars.RESIDENT_NAME},`,
    '',
    vars.BODY_MESSAGE,
    '',
    `Document: ${vars.DOCUMENT_NAME}`,
    `Pickup Schedule: ${vars.PICKUP_SLOT}`,
    '',
    vars.OFFICE_NOTE,
  ].join('\n');
}

function parseSmtpPort(raw: string | undefined): number {
  if (!raw?.trim()) {
    return DEFAULT_SMTP_PORT;
  }
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return DEFAULT_SMTP_PORT;
  }
  return parsed;
}

function getSmtpErrorDetails(caught: unknown): { code?: string; responseCode?: number } {
  if (typeof caught !== 'object' || caught === null) {
    return {};
  }
  const record = caught as Record<string, unknown>;
  const code = typeof record.code === 'string' ? record.code : undefined;
  const responseCode =
    typeof record.responseCode === 'number' ? record.responseCode : undefined;
  return { code, responseCode };
}

function isRetryableSmtpError(caught: unknown): boolean {
  const { code, responseCode } = getSmtpErrorDetails(caught);
  if (typeof responseCode === 'number' && responseCode >= 400 && responseCode < 500) {
    return true;
  }
  return typeof code === 'string' && RETRYABLE_NETWORK_CODES.has(code);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sends a DocuDash status notification via configured SMTP credentials.
 * Returns `{ sent: false }` when `SMTP_USER` or `SMTP_PASS` is not set.
 */
export async function sendStatusNotificationViaSmtp(
  params: SendStatusEmailParams
): Promise<SendStatusEmailResult> {
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  if (!user || !pass) {
    return { sent: false };
  }

  const host = process.env.SMTP_HOST?.trim() || DEFAULT_SMTP_HOST;
  const port = parseSmtpPort(process.env.SMTP_PORT);
  const from = process.env.SMTP_FROM?.trim() || `DocuDash <${user}>`;
  const html = renderStatusEmailHtml(params.variables);
  const text = renderStatusEmailText(params.variables);

  for (let attempt = 0; attempt <= MAX_RETRY_ATTEMPTS; attempt += 1) {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      connectionTimeout: SOCKET_TIMEOUT_MS,
      greetingTimeout: SOCKET_TIMEOUT_MS,
      socketTimeout: SOCKET_TIMEOUT_MS,
    });

    try {
      const info = await transporter.sendMail({
        from,
        to: params.to,
        subject: params.subject,
        html,
        text,
      });

      const emailId = info.messageId || undefined;
      console.info('[DocuDash SMTP email sent]', {
        messageId: emailId,
        idempotencyKey: params.idempotencyKey,
      });
      return { sent: true, emailId };
    } catch (caught) {
      if (isRetryableSmtpError(caught) && attempt < MAX_RETRY_ATTEMPTS) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }

      const { code, responseCode } = getSmtpErrorDetails(caught);
      console.error('[DocuDash SMTP error]', {
        code,
        responseCode,
        idempotencyKey: params.idempotencyKey,
      });
      throw new HttpError(
        502,
        'notification_provider_error',
        'Email notification provider rejected the dispatch request.'
      );
    } finally {
      transporter.close();
    }
  }

  return { sent: false };
}

export interface BarangayAdminEmailParams {
  to: string;
  requestId: string | null;
  barangayName: string;
  cityMunicipality: string;
  province: string;
  region: string;
  psgcCode: string | null;
  hallAddress: string;
  googleMapsUrl: string | null;
  applicantName: string;
  applicantPosition: string;
  applicantEmail: string;
  contactNumber: string;
  notes: string | null;
}

function renderBarangayAdminEmailHtml(params: BarangayAdminEmailParams): string {
  const esc = escapeHtml;
  const locationLine = [params.barangayName, params.cityMunicipality, params.province, params.region]
    .filter(Boolean)
    .map(esc)
    .join(', ');

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>New Barangay Admin Request</title>
  </head>
  <body style="margin:0;padding:0;background-color:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0F172A;">
    <div style="background-color:#F8FAFC;padding:32px 16px;">
      <div style="max-width:580px;margin:0 auto;background-color:#FFFFFF;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;">
        <div style="background-color:#01227F;padding:24px 28px;border-bottom:4px solid #FBC128;">
          <div style="font-size:20px;font-weight:700;color:#FFFFFF;letter-spacing:-0.01em;">DocuDash</div>
          <div style="font-size:12px;color:#DCE5FF;margin-top:4px;">Barangay Onboarding &amp; Admin Access Request</div>
        </div>

        <div style="padding:28px;">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#01227F;">Barangay Admin Request</div>
          <h1 style="font-size:22px;font-weight:700;color:#0F172A;margin:8px 0 16px;line-height:1.3;">${esc(params.barangayName)}, ${esc(params.cityMunicipality)}</h1>

          <div style="background-color:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:16px 18px;margin-bottom:20px;">
            <div style="font-size:12px;color:#64748B;margin-bottom:2px;">Barangay Location</div>
            <div style="font-size:14px;font-weight:600;color:#0F172A;margin-bottom:10px;">${locationLine}${params.psgcCode ? ` (PSGC: ${esc(params.psgcCode)})` : ''}</div>
            <div style="font-size:12px;color:#64748B;margin-bottom:2px;">Barangay Hall Address</div>
            <div style="font-size:14px;font-weight:600;color:#0F172A;margin-bottom:${params.googleMapsUrl ? '10px' : '0'};">${esc(params.hallAddress)}</div>
            ${params.googleMapsUrl ? `<div style="font-size:12px;color:#64748B;margin-bottom:2px;">Google Maps Link</div><div style="font-size:13px;color:#01227F;word-break:break-all;">${esc(params.googleMapsUrl)}</div>` : ''}
          </div>

          <div style="background-color:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:16px 18px;">
            <div style="font-size:12px;color:#64748B;margin-bottom:2px;">Official / Applicant</div>
            <div style="font-size:14px;font-weight:600;color:#0F172A;margin-bottom:10px;">${esc(params.applicantName)} — ${esc(params.applicantPosition)}</div>
            <div style="font-size:12px;color:#64748B;margin-bottom:2px;">Email &amp; Contact</div>
            <div style="font-size:14px;font-weight:600;color:#0F172A;margin-bottom:${params.notes ? '10px' : '0'};">${esc(params.applicantEmail)} · ${esc(params.contactNumber)}</div>
            ${params.notes ? `<div style="font-size:12px;color:#64748B;margin-bottom:2px;">Notes</div><div style="font-size:13px;color:#334155;">${esc(params.notes)}</div>` : ''}
          </div>

          <p style="font-size:12px;line-height:1.5;color:#64748B;margin:20px 0 0;">
            Request ID: ${esc(params.requestId ?? 'N/A')} · Reply directly to this email to contact ${esc(params.applicantName)}.
          </p>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

/**
 * Emails a Barangay Admin onboarding application to DocuDash administrators
 * (default `docudash.app@gmail.com`). Falls back to `{ sent: false }` if SMTP
 * credentials are not configured.
 */
export async function sendBarangayAdminRequestEmail(
  params: BarangayAdminEmailParams
): Promise<SendStatusEmailResult> {
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  if (!user || !pass) {
    return { sent: false };
  }

  const host = process.env.SMTP_HOST?.trim() || DEFAULT_SMTP_HOST;
  const port = parseSmtpPort(process.env.SMTP_PORT);
  const from = process.env.SMTP_FROM?.trim() || `DocuDash <${user}>`;
  const html = renderBarangayAdminEmailHtml(params);
  const text = [
    `DocuDash Barangay Admin Request`,
    `Barangay: ${params.barangayName}, ${params.cityMunicipality}${params.province ? `, ${params.province}` : ''}`,
    `Hall Address: ${params.hallAddress}`,
    params.googleMapsUrl ? `Google Maps: ${params.googleMapsUrl}` : '',
    `Applicant: ${params.applicantName} (${params.applicantPosition})`,
    `Email: ${params.applicantEmail}`,
    `Contact: ${params.contactNumber}`,
    params.notes ? `Notes: ${params.notes}` : '',
    `Request ID: ${params.requestId ?? 'N/A'}`,
  ]
    .filter(Boolean)
    .join('\n');

  for (let attempt = 0; attempt <= MAX_RETRY_ATTEMPTS; attempt += 1) {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      connectionTimeout: SOCKET_TIMEOUT_MS,
      greetingTimeout: SOCKET_TIMEOUT_MS,
      socketTimeout: SOCKET_TIMEOUT_MS,
    });

    try {
      const info = await transporter.sendMail({
        from,
        to: params.to,
        replyTo: params.applicantEmail,
        subject: `[DocuDash Admin Request] ${params.barangayName}, ${params.cityMunicipality}`,
        html,
        text,
      });

      return { sent: true, emailId: info.messageId || undefined };
    } catch (caught) {
      if (isRetryableSmtpError(caught) && attempt < MAX_RETRY_ATTEMPTS) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }

      const { code, responseCode } = getSmtpErrorDetails(caught);
      console.error('[DocuDash SMTP barangay admin email error]', { code, responseCode });
      throw new HttpError(
        502,
        'email_delivery_failed',
        'Unable to email docudash.app@gmail.com right now. Please try again shortly.'
      );
    } finally {
      transporter.close();
    }
  }

  return { sent: false };
}
