import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, validateSupabaseConfig } from './supabase-config';

let supabaseClient: SupabaseClient | null = null;

/**
 * Get the Supabase client instance.
 * Returns null if Supabase is not configured (offline-only mode).
 */
export function getSupabase(): SupabaseClient | null {
  if (!validateSupabaseConfig()) {
    return null;
  }

  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        // Don't persist session in localStorage - we use SQLite
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return supabaseClient;
}

/**
 * Check if Supabase is available (configured).
 */
export function isSupabaseConfigured(): boolean {
  return validateSupabaseConfig();
}
