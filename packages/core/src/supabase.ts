// The ONE Supabase client for the whole app. Nothing outside packages/core may
// import '@supabase/supabase-js' (enforced by the ESLint guardrail). Swapping this
// file's internals is what makes the Phase 2 AWS/Cognito migration a swap, not a
// rewrite (ARCHITECTURE.md §9/§10).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

/** Initialize once at app startup (mobile _layout, web root). */
export function initSupabase(config: SupabaseConfig): SupabaseClient {
  client = createClient(config.url, config.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return client;
}

export function getSupabase(): SupabaseClient {
  if (!client) {
    throw new Error('Supabase not initialized — call initSupabase() at startup.');
  }
  return client;
}
