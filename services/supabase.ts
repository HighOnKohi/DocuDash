import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient, type SupportedStorage } from '@supabase/supabase-js';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import type { ApiErrorResponse, Database } from '@/types/database';

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';

/** True when the required client Supabase environment variables are present. */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/**
 * Structured error thrown by all DocuDash service modules so UI screens can
 * display friendly messages and branch on error codes without inspecting raw
 * PostgREST or HTTP payloads.
 */
export class ServiceError extends Error {
  readonly code: string;
  readonly status?: number;
  override readonly cause?: unknown;

  constructor(message: string, options: { code?: string; status?: number; cause?: unknown } = {}) {
    super(message);
    this.name = 'ServiceError';
    this.code = options.code ?? 'service_error';
    this.status = options.status;
    this.cause = options.cause;
  }
}

export function toServiceError(
  error: unknown,
  fallbackMessage = 'Something went wrong. Please try again.'
): ServiceError {
  if (error instanceof ServiceError) {
    return error;
  }

  if (typeof error === 'object' && error !== null) {
    const record = error as { message?: unknown; code?: unknown; status?: unknown };
    const message =
      typeof record.message === 'string' && record.message.trim().length > 0
        ? record.message
        : fallbackMessage;
    const code = typeof record.code === 'string' ? record.code : 'supabase_error';
    const status = typeof record.status === 'number' ? record.status : undefined;
    return new ServiceError(message, { code, status, cause: error });
  }

  return new ServiceError(fallbackMessage, { cause: error });
}

/**
 * SSR/Node-safe web storage adapter (avoids ReferenceError if code is ever
 * evaluated where `window` is undefined).
 */
const webStorage: SupportedStorage = {
  getItem(key) {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return null;
    }
    return window.localStorage.getItem(key);
  },
  setItem(key, value) {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return;
    }
    window.localStorage.setItem(key, value);
  },
  removeItem(key) {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return;
    }
    window.localStorage.removeItem(key);
  },
};

const authStorage: SupportedStorage = Platform.OS === 'web' ? webStorage : AsyncStorage;

let cachedClient: SupabaseClient<Database> | null = null;
let appStateListenerRegistered = false;

function registerNativeAppStateRefresh(client: SupabaseClient<Database>): void {
  if (Platform.OS === 'web' || appStateListenerRegistered) {
    return;
  }
  appStateListenerRegistered = true;

  AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active') {
      void client.auth.startAutoRefresh();
    } else {
      void client.auth.stopAutoRefresh();
    }
  });
}

/**
 * Returns the singleton typed Supabase client configured with the public anon
 * key only. Lazily instantiated so importing services never crashes static
 * exports when environment variables are absent.
 */
export function getSupabaseClient(): SupabaseClient<Database> {
  if (cachedClient) {
    return cachedClient;
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new ServiceError(
      'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your environment.',
      { code: 'supabase_not_configured' }
    );
  }

  cachedClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: authStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === 'web',
    },
  });

  registerNativeAppStateRefresh(cachedClient);
  return cachedClient;
}

/**
 * Returns the current signed-in user's UUID or throws a `ServiceError` with
 * code `unauthenticated`.
 */
export async function requireAuthenticatedUserId(): Promise<string> {
  const supabase = getSupabaseClient();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw toServiceError(error, 'Unable to read authentication session.');
  }

  const userId = session?.user?.id;
  if (!userId) {
    throw new ServiceError('You must be signed in to perform this action.', {
      code: 'unauthenticated',
      status: 401,
    });
  }

  return userId;
}

/**
 * Resolves the base URL for Vercel `/api/*` endpoints.
 * On web, an empty `EXPO_PUBLIC_API_BASE_URL` defaults to the same origin.
 * On native (iOS / Android), an absolute URL is required.
 */
export function getApiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL?.trim().replace(/\/+$/, '') ?? '';

  if (configured) {
    return configured;
  }

  if (Platform.OS === 'web') {
    return '';
  }

  throw new ServiceError(
    'API base URL is not configured. Set EXPO_PUBLIC_API_BASE_URL to your Vercel deployment URL.',
    { code: 'api_not_configured' }
  );
}

/**
 * Sends an authenticated JSON request to a Vercel `/api/*` serverless function
 * using the current user's Supabase access token.
 */
export async function callApi<TResponse>(
  path: `/api/${string}`,
  options: { method?: 'POST' | 'GET'; body?: unknown } = {}
): Promise<TResponse> {
  const supabase = getSupabaseClient();
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw toServiceError(sessionError, 'Unable to read authentication session.');
  }

  const accessToken = session?.access_token;
  if (!accessToken) {
    throw new ServiceError('You must be signed in to call this endpoint.', {
      code: 'unauthenticated',
      status: 401,
    });
  }

  const url = `${getApiBaseUrl()}${path}`;
  const method = options.method ?? 'POST';

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch (networkError) {
    throw new ServiceError('Unable to reach the DocuDash server. Check your connection.', {
      code: 'network_error',
      cause: networkError,
    });
  }

  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    // Non-JSON response body (e.g. gateway error) handled below.
  }

  if (!response.ok) {
    const apiError = parsed as Partial<ApiErrorResponse> | null;
    throw new ServiceError(
      apiError?.error ?? `Request failed with status ${response.status}.`,
      {
        code: apiError?.code ?? 'api_error',
        status: response.status,
      }
    );
  }

  return parsed as TResponse;
}
