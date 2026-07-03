// @noot/core/auth — thin wrapper over Supabase Auth (.edu magic link).
//
// Screens call THIS, never the Supabase client. Keeping auth behind this wrapper
// is what makes the Phase 2 Cognito swap a wrapper change, not an app-wide rewrite
// (ARCHITECTURE.md §6/§10). `.edu` domain gating is enforced server-side (auth hook
// + campuses allowlist), not here.
import { getSupabase } from '../supabase';

export interface SignInResult {
  ok: boolean;
  error?: string;
}

/** Send a magic link to a campus email. Domain is validated server-side. */
export async function sendMagicLink(email: string): Promise<SignInResult> {
  const { error } = await getSupabase().auth.signInWithOtp({ email });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function signOut(): Promise<void> {
  await getSupabase().auth.signOut();
}

export async function getSessionUserId(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.user.id ?? null;
}
