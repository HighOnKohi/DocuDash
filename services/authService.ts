import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';

import type { DeleteAccountResponse, Profile, ProfileUpdate, UserRole } from '@/types/database';

import {
  callApi,
  getAppOrigin,
  getSupabaseClient,
  requireAuthenticatedUserId,
  ServiceError,
  toServiceError,
} from './supabase';

export interface RegisterInput {
  email: string;
  password: string;
  fullName: string;
  address: string;
  contactNumber: string;
  /** Explicit Data Privacy Act (RA 10173) consent checkbox value. Must be `true`. */
  privacyConsentAccepted: boolean;
  /** Explicit Terms & Conditions acceptance checkbox value. Must be `true`. */
  termsAccepted: boolean;
}

export interface RegisterResult {
  user: User | null;
  session: Session | null;
  needsEmailConfirmation: boolean;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginResult {
  user: User;
  session: Session;
  profile: Profile;
}

const CONTACT_NUMBER_PATTERN = /^\+?[0-9][0-9 -]{6,18}[0-9]$/;

export function isStaffRole(role?: UserRole | null): boolean {
  return role === 'staff' || role === 'admin';
}

export function isAdminRole(role?: UserRole | null): boolean {
  return role === 'admin';
}

/**
 * Registers a new resident account. Enforces explicit RA 10173 consent both
 * client-side and via the `on_auth_user_created` Postgres trigger (which also
 * forces `role = 'resident'`).
 */
export async function register(input: RegisterInput): Promise<RegisterResult> {
  if (!input.privacyConsentAccepted) {
    throw new ServiceError(
      'You must accept the Data Privacy Act (RA 10173) notice before creating an account.',
      { code: 'privacy_consent_required' }
    );
  }
  if (!input.termsAccepted) {
    throw new ServiceError(
      'You must agree to the Terms & Conditions before creating an account.',
      { code: 'terms_required' }
    );
  }

  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  const address = input.address.trim();
  const contactNumber = input.contactNumber.trim();

  if (!email) {
    throw new ServiceError('Email address is required.', { code: 'invalid_email' });
  }
  if (input.password.length < 8) {
    throw new ServiceError('Password must be at least 8 characters long.', {
      code: 'weak_password',
    });
  }
  if (fullName.length < 2 || fullName.length > 120) {
    throw new ServiceError('Full name must be between 2 and 120 characters.', {
      code: 'invalid_full_name',
    });
  }
  if (address.length < 5 || address.length > 300) {
    throw new ServiceError('Address must be between 5 and 300 characters.', {
      code: 'invalid_address',
    });
  }
  if (!CONTACT_NUMBER_PATTERN.test(contactNumber)) {
    throw new ServiceError(
      'Enter a valid Philippine mobile or landline number (e.g. 09171234567 or +639171234567).',
      { code: 'invalid_contact_number' }
    );
  }

  const nowIso = new Date().toISOString();
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: {
      emailRedirectTo: `${getAppOrigin()}/login`,
      data: {
        full_name: fullName,
        address,
        contact_number: contactNumber,
        privacy_consent_at: nowIso,
        terms_accepted_at: nowIso,
      },
    },
  });

  if (error) {
    throw toServiceError(error, 'Unable to create your account.');
  }

  return {
    user: data.user,
    session: data.session,
    needsEmailConfirmation: Boolean(data.user && !data.session),
  };
}

/** Signs in with email/password and loads the corresponding `profiles` row. */
export async function login(input: LoginInput): Promise<LoginResult> {
  const email = input.email.trim().toLowerCase();
  if (!email || !input.password) {
    throw new ServiceError('Email and password are required.', { code: 'invalid_credentials' });
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: input.password,
  });

  if (error) {
    throw toServiceError(error, 'Invalid email or password.');
  }

  if (!data.session || !data.user) {
    throw new ServiceError('Sign-in succeeded but no active session was returned.', {
      code: 'missing_session',
    });
  }

  const profile = await getCurrentProfile(data.user.id);
  if (!profile) {
    throw new ServiceError(
      'Account profile was not found. Please contact the barangay office for assistance.',
      { code: 'profile_not_found' }
    );
  }

  return {
    user: data.user,
    session: data.session,
    profile,
  };
}

/** Signs out the current user and clears persisted session tokens. */
export async function logout(): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw toServiceError(error, 'Unable to sign out.');
  }
}

/**
 * Permanently erases the current resident account, uploaded requirement files,
 * requests, and reserved pickup slots via Vercel `POST /api/delete-account`.
 */
export async function deleteAccount(confirmation: string): Promise<DeleteAccountResponse> {
  if (confirmation.trim() !== 'DELETE') {
    throw new ServiceError('Type DELETE in uppercase to confirm permanent account deletion.', {
      code: 'confirmation_required',
    });
  }

  const result = await callApi<DeleteAccountResponse>('/api/delete-account', {
    method: 'POST',
    body: { confirmation: 'DELETE' },
  });

  await getSupabaseClient()
    .auth.signOut({ scope: 'local' })
    .catch(() => {});

  return result;
}

/** Sends a password reset link to the specified email address. */
export async function sendPasswordReset(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    throw new ServiceError('Please enter your email address.', { code: 'invalid_email' });
  }

  const supabase = getSupabaseClient();
  const redirectTo = `${getAppOrigin()}/reset-password`;

  const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo });
  if (error) {
    throw toServiceError(error, 'Unable to send password reset email.');
  }
}

export interface RecoveryUrlParams {
  tokenHash: string | null;
  code: string | null;
  type: string | null;
  errorDescription: string | null;
}

/**
 * Returns `true` when running on web at the `/reset-password` route or with
 * `type=recovery` in query/hash params so AuthContext can keep the user on the
 * password reset screen instead of redirecting to a dashboard.
 */
export function isRecoveryUrl(): boolean {
  if (typeof window === 'undefined' || !window.location) {
    return false;
  }

  const { pathname, search, hash } = window.location;
  if (pathname === '/reset-password') {
    return true;
  }

  return /(?:^|[?&#])type=recovery(?:&|$)/i.test(`${search}&${hash}`);
}

/** Reads recovery parameters from both query string and URL fragment on web. */
export function parseRecoveryUrlParams(): RecoveryUrlParams {
  if (typeof window === 'undefined' || !window.location) {
    return { tokenHash: null, code: null, type: null, errorDescription: null };
  }

  const searchParams = new URLSearchParams(window.location.search ?? '');
  const hashRaw = (window.location.hash ?? '').replace(/^#/, '');
  const hashParams = new URLSearchParams(hashRaw);

  return {
    tokenHash: searchParams.get('token_hash') ?? hashParams.get('token_hash'),
    code: searchParams.get('code') ?? hashParams.get('code'),
    type: searchParams.get('type') ?? hashParams.get('type'),
    errorDescription: searchParams.get('error_description') ?? hashParams.get('error_description'),
  };
}

/**
 * Verifies a Supabase password recovery link via `token_hash` (cross-device
 * safe), PKCE `code`, or an already-parsed fragment recovery session.
 */
export async function establishPasswordRecoverySession(params?: {
  tokenHash?: string | null;
  code?: string | null;
  errorDescription?: string | null;
}): Promise<Session> {
  if (params?.errorDescription?.trim()) {
    throw new ServiceError(params.errorDescription.trim(), {
      code: 'recovery_link_error',
    });
  }

  const supabase = getSupabaseClient();
  const tokenHash = params?.tokenHash?.trim() ?? '';
  const code = params?.code?.trim() ?? '';

  if (tokenHash) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'recovery',
    });
    if (error) {
      throw toServiceError(
        error,
        'This password reset link is invalid or has expired. Please request a new reset email.'
      );
    }
    if (data.session) {
      return data.session;
    }
  }

  if (code) {
    const existing = await getSession();
    if (existing) {
      return existing;
    }

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      throw toServiceError(
        error,
        'This password reset link is invalid or has expired. Please request a new reset email.'
      );
    }
    if (data.session) {
      return data.session;
    }
  }

  const existing = await getSession();
  if (existing) {
    return existing;
  }

  throw new ServiceError(
    'This password reset link is invalid or has expired. Please request a new reset email.',
    { code: 'invalid_recovery_link' }
  );
}

/** Updates the currently authenticated user's password after recovery verification. */
export async function updateAccountPassword(newPassword: string): Promise<void> {
  if (newPassword.length < 8) {
    throw new ServiceError('Password must be at least 8 characters long.', {
      code: 'weak_password',
    });
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    throw toServiceError(error, 'Unable to update your password.');
  }
}

export async function getSession(): Promise<Session | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw toServiceError(error, 'Unable to retrieve session.');
  }
  return data.session;
}

export async function getCurrentUser(): Promise<User | null> {
  const session = await getSession();
  return session?.user ?? null;
}

/**
 * Fetches the profile for `userId`, or for the currently signed-in user when
 * omitted. Returns `null` if no user is signed in or no profile row exists.
 */
export async function getCurrentProfile(userId?: string): Promise<Profile | null> {
  const supabase = getSupabaseClient();
  const targetId = userId ?? (await getCurrentUser())?.id;
  if (!targetId) {
    return null;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', targetId)
    .maybeSingle();

  if (error) {
    throw toServiceError(error, 'Unable to load user profile.');
  }

  return data;
}

/**
 * Updates editable contact fields on the current user's profile. Role and
 * consent timestamps are immutable from the client (enforced by DB trigger).
 */
export async function updateProfile(updates: ProfileUpdate): Promise<Profile> {
  const userId = await requireAuthenticatedUserId();
  const payload: ProfileUpdate = {};

  if (updates.full_name !== undefined) {
    const trimmed = updates.full_name.trim();
    if (trimmed.length < 2 || trimmed.length > 120) {
      throw new ServiceError('Full name must be between 2 and 120 characters.', {
        code: 'invalid_full_name',
      });
    }
    payload.full_name = trimmed;
  }

  if (updates.address !== undefined) {
    const trimmed = updates.address.trim();
    if (trimmed.length < 5 || trimmed.length > 300) {
      throw new ServiceError('Address must be between 5 and 300 characters.', {
        code: 'invalid_address',
      });
    }
    payload.address = trimmed;
  }

  if (updates.contact_number !== undefined) {
    const trimmed = updates.contact_number.trim();
    if (!CONTACT_NUMBER_PATTERN.test(trimmed)) {
      throw new ServiceError(
        'Enter a valid Philippine mobile or landline number (e.g. 09171234567 or +639171234567).',
        { code: 'invalid_contact_number' }
      );
    }
    payload.contact_number = trimmed;
  }

  if (Object.keys(payload).length === 0) {
    const existing = await getCurrentProfile(userId);
    if (!existing) {
      throw new ServiceError('Profile not found.', { code: 'profile_not_found' });
    }
    return existing;
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('profiles')
    .update(payload)
    .eq('id', userId)
    .select('*')
    .single();

  if (error) {
    throw toServiceError(error, 'Unable to update profile.');
  }

  return data;
}

/**
 * Subscribes to Supabase auth session changes. Returns an unsubscribe callback.
 */
export function onAuthStateChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void
): () => void {
  const supabase = getSupabaseClient();
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(callback);

  return () => {
    subscription.unsubscribe();
  };
}
