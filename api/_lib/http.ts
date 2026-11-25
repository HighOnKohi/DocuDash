import type { VercelRequest, VercelResponse } from '@vercel/node';

import type { ApiErrorResponse } from '../../types/database';

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

function getAllowedOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGINS ?? '';
  return raw
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

function isSameOriginRequest(req: VercelRequest, origin: string): boolean {
  const host = req.headers.host;
  if (!host) return false;
  try {
    const parsed = new URL(origin);
    return parsed.host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

function applySecurityHeaders(res: VercelResponse): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Vary', 'Origin');
}

/**
 * Applies strict CORS headers based on `ALLOWED_ORIGINS` (plus exact same-origin
 * requests) and handles `OPTIONS` preflight.
 *
 * Returns `true` if the response has already been sent (preflight or rejected
 * origin), meaning the caller should return immediately.
 */
export function applyCors(
  req: VercelRequest,
  res: VercelResponse,
  allowedMethods: string[] = ['POST', 'OPTIONS']
): boolean {
  applySecurityHeaders(res);

  const originHeader = req.headers.origin;
  const origin =
    typeof originHeader === 'string' ? originHeader.trim().replace(/\/+$/, '') : undefined;

  if (origin) {
    const allowedOrigins = getAllowedOrigins();
    const isAllowed = allowedOrigins.includes(origin) || isSameOriginRequest(req, origin);

    if (!isAllowed) {
      sendError(res, 403, 'origin_not_allowed', 'Request origin is not permitted.');
      return true;
    }

    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', allowedMethods.join(', '));
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');
    res.setHeader('Access-Control-Max-Age', '600');
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }

  return false;
}

export function requireMethod(req: VercelRequest, method: 'POST' | 'GET'): void {
  if (req.method !== method) {
    throw new HttpError(405, 'method_not_allowed', `Only ${method} requests are accepted.`);
  }
}

export function parseJsonBody<T extends Record<string, unknown>>(req: VercelRequest): T {
  const { body } = req;

  if (body == null) {
    throw new HttpError(400, 'invalid_body', 'Request body is required.');
  }

  if (typeof body === 'string') {
    try {
      const parsed: unknown = JSON.parse(body);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new HttpError(400, 'invalid_body', 'Request body must be a JSON object.');
      }
      return parsed as T;
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(400, 'invalid_json', 'Request body contains invalid JSON.');
    }
  }

  if (typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'invalid_body', 'Request body must be a JSON object.');
  }

  return body as T;
}

export function sendJson<T>(res: VercelResponse, status: number, payload: T): void {
  applySecurityHeaders(res);
  res.status(status).json(payload);
}

export function sendError(
  res: VercelResponse,
  status: number,
  code: string,
  message: string
): void {
  const payload: ApiErrorResponse = { ok: false, code, error: message };
  sendJson(res, status, payload);
}

export function handleRouteError(res: VercelResponse, error: unknown): void {
  if (error instanceof HttpError) {
    sendError(res, error.status, error.code, error.message);
    return;
  }

  // Log server error details internally without leaking secrets or stack traces to clients.
  console.error('[DocuDash API error]', error);
  sendError(res, 500, 'internal_error', 'An unexpected server error occurred.');
}
