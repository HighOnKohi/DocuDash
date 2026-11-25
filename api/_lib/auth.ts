import type { VercelRequest } from '@vercel/node';

import type { UserRole } from '../../types/database';
import { HttpError } from './http';
import { getSupabaseAdmin } from './supabaseAdmin';

export interface AuthenticatedStaff {
  userId: string;
  email: string | null;
  role: Extract<UserRole, 'staff' | 'admin'>;
  fullName: string;
}

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

/**
 * Verifies the caller's Supabase JWT against Supabase Auth and ensures the
 * corresponding profile has role `staff` or `admin`.
 */
export async function requireStaff(req: VercelRequest): Promise<AuthenticatedStaff> {
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
    throw new HttpError(500, 'profile_lookup_failed', 'Unable to verify staff permissions.');
  }

  if (!profile || (profile.role !== 'staff' && profile.role !== 'admin')) {
    throw new HttpError(
      403,
      'forbidden',
      'Only barangay staff or administrators can perform this action.'
    );
  }

  return {
    userId: profile.id,
    email: user.email ?? null,
    role: profile.role,
    fullName: profile.full_name,
  };
}
