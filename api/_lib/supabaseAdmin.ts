/**
 * Server-only Supabase admin client for Vercel Serverless Functions (`api/`).
 *
 * Uses `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, which bypass Row-Level
 * Security. This directory is blocked from Metro client bundles by
 * `metro.config.js` and must NEVER be imported from `app/`, `components/`, or
 * `services/`.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../types/database';

let cachedAdminClient: SupabaseClient<Database> | null = null;

export function getSupabaseAdmin(): SupabaseClient<Database> {
  if (cachedAdminClient) {
    return cachedAdminClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Server misconfiguration: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in Vercel Environment Variables.'
    );
  }

  cachedAdminClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return cachedAdminClient;
}
