// The ONE Supabase client for the whole app. Nothing outside packages/core may
// import '@supabase/supabase-js' (enforced by the ESLint guardrail). Swapping this
// file's internals is what makes the Phase 2 AWS/Cognito migration a swap, not a
// rewrite (ARCHITECTURE.md §9/§10).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  /**
   * Platform storage adapter for the persisted session + PKCE verifier. Pass
   * AsyncStorage on native so the session (and the magic-link code verifier)
   * survive an app restart. Omit on web — supabase-js falls back to localStorage.
   */
  storage?: {
    getItem: (key: string) => Promise<string | null> | string | null;
    setItem: (key: string, value: string) => Promise<void> | void;
    removeItem: (key: string) => Promise<void> | void;
  };
}

/** Initialize once at app startup (mobile _layout, web root). */
export function initSupabase(config: SupabaseConfig): SupabaseClient {
  client = createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // PKCE so the magic link carries a short `?code=` we exchange for a session
      // (auth.completeAuthFromUrl), instead of long-lived tokens in the URL.
      flowType: 'pkce',
      // We parse the redirect URL ourselves in the auth-callback screen (works the
      // same on web + native), so don't let the client race us to it on web.
      detectSessionInUrl: false,
      ...(config.storage ? { storage: config.storage } : {}),
    },
  });
  return client;
}

export function getSupabase(): SupabaseClient {
  if (!client) {
    throw new Error('Supabase not initialized — call initSupabase() at startup.');
  }
  return client;
}
