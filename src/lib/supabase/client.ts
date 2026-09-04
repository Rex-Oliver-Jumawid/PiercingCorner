import { createClient } from '@supabase/supabase-js'

import type { Database } from '../../types/database'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

/**
 * Creates the configured browser client on demand.
 *
 * Keeping this lazy lets the Phase 0A route scaffold run before a Supabase
 * project exists, while feature code gets a clear development error when it
 * actually requires a backend connection.
 */
export function getSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in a local .env file.',
    )
  }

  return createClient<Database>(supabaseUrl, supabaseAnonKey)
}
