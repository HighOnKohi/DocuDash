import { createHash, timingSafeEqual } from 'node:crypto';
import type { VercelRequest } from '@vercel/node';

import type { UserRole } from '../../types/database';
import { HttpError } from './http';
import { getSupabaseAdmin } from './supabaseAdmin';

export interface AuthenticatedUser {
  userId: string;
  email: string | null;
  role: UserRole;
  fullName: string;
}

export interface AuthenticatedStaff {
  userId: string;
  email: string | null;
  role: Extract<UserRole, 'staff' | 'admin'>;
  fullName: string;
}

export type MaintenanceCaller =
  | { kind: 'cron_secret'; actorId: null }
  | { kind: 'admin'; actorId: string; staff: AuthenticatedStaff };

const MIN_CRON_SECRET_LENGTH = 16;

function extractBearerToken(req: VercelRequest): string {
  const rawHeader = req.headers.authorization;
  const header = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  if (!header) {
    throw new HttpError(401, 'missing_auth', 'Missing Authorization header.');
  }

  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
  if (!token) {
    throw new HttpError(401, 'invalid_auth_header', 'Authorization header must use Bearer token.');
  }

  return token;
}

function constantTimeTokenMatch(provided: string, expected: string): boolean {
  const providedDigest = createHash('sha256').update(provided, 'utf8').digest();
  const expectedDigest = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

/**
 * Verifies the caller's Supabase JWT against Supabase Auth and loads their
 * `profiles` record for any signed-in role (`resident`, `staff`, or `admin`).
 */
export async function requireAuthenticatedUser(req: VercelRequest): Promise<AuthenticatedUser> {
  const token = extractBearerToken(req);
  const supabaseAdmin = getSupabaseAdmin();

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    throw new HttpError(401, 'invalid_token', 'Invalid or expired authentication token.');
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, role, full_name')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    throw new HttpError(500, 'profile_lookup_failed', 'Unable to verify user permissions.');
  }

  if (!profile) {
    throw new HttpError(404, 'profile_not_found', 'User account profile was not found.');
  }

  return {
    userId: profile.id,
    email: user.email ?? null,
    role: profile.role,
    fullName: profile.full_name,
  };
}

/**
 * Verifies the caller's Supabase JWT against Supabase Auth and ensures the
 * corresponding profile has role `staff` or `admin`.
 */
export async function requireStaff(req: VercelRequest): Promise<AuthenticatedStaff> {
  const user = await requireAuthenticatedUser(req);

  if (user.role !== 'staff' && user.role !== 'admin') {
    throw new HttpError(
      403,
      'forbidden',
      'Only barangay staff or administrators can perform this action.'
    );
  }

  return {
    userId: user.userId,
    email: user.email,
    role: user.role,
    fullName: user.fullName,
  };
}

/**
 * Authorizes automated maintenance calls (GitHub Actions, Supabase pg_cron +
 * pg_net, or any external scheduler) via `CRON_SECRET`, or manual runs by an
 * authenticated administrator (`profiles.role = 'admin'`).
 */
export async function requireCronOrAdmin(req: VercelRequest): Promise<MaintenanceCaller> {
  const token = extractBearerToken(req);
  const configuredSecret = process.env.CRON_SECRET?.trim() ?? '';

  if (
    configuredSecret.length >= MIN_CRON_SECRET_LENGTH &&
    constantTimeTokenMatch(token, configuredSecret)
  ) {
    return { kind: 'cron_secret', actorId: null };
  }

  const staff = await requireStaff(req);
  if (staff.role !== 'admin') {
    throw new HttpError(
      403,
      'forbidden',
      'Only administrators or scheduled maintenance jobs can run retention purges.'
    );
  }

  return { kind: 'admin', actorId: staff.userId, staff };
}
