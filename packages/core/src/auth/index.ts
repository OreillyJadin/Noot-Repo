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

/**
 * Send a magic link to a campus email. Domain is validated server-side.
 * `redirectTo` is where the emailed link returns (the app's auth-callback deep
 * link — build it with expo-linking `createURL('/auth-callback')`). It must be on
 * the Supabase project's redirect allow-list (config.toml `additional_redirect_urls`
 * locally; dashboard → Auth → URL Configuration on cloud).
 */
export async function sendMagicLink(email: string, redirectTo?: string): Promise<SignInResult> {
  const { error } = await getSupabase().auth.signInWithOtp({
    email,
    options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Complete sign-in from the magic-link redirect. Call this from the auth-callback
 * screen with the full inbound URL. Handles the PKCE `?code=` exchange and the
 * `?token_hash=&type=` (verifyOtp) fallback, and is idempotent — if a session is
 * already live (re-mount / StrictMode double-run) it just reports success.
 */
export async function completeAuthFromUrl(url: string): Promise<SignInResult> {
  const sb = getSupabase();
  // Already signed in (e.g. this effect ran twice) — nothing to exchange.
  const existing = await sb.auth.getSession();
  if (existing.data.session) return { ok: true };

  let params: URLSearchParams;
  try {
    const u = new URL(url);
    // Errors and (rarely) tokens can arrive in the fragment — fold it in.
    params = new URLSearchParams(u.search || (u.hash ? u.hash.replace(/^#/, '') : ''));
    if (u.search && u.hash) {
      new URLSearchParams(u.hash.replace(/^#/, '')).forEach((v, k) => {
        if (!params.has(k)) params.append(k, v);
      });
    }
  } catch {
    return { ok: false, error: 'Malformed sign-in link.' };
  }

  const errDesc = params.get('error_description') || params.get('error');

  const code = params.get('code');
  if (code) {
    const { error } = await sb.auth.exchangeCodeForSession(code);
    return error ? { ok: false, error: error.message } : { ok: true };
  }

  const tokenHash = params.get('token_hash');
  const type = params.get('type');
  if (tokenHash && type) {
    const { error } = await sb.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as 'magiclink' | 'signup' | 'email' | 'recovery' | 'invite',
    });
    return error ? { ok: false, error: error.message } : { ok: true };
  }

  return { ok: false, error: errDesc || 'This sign-in link is invalid or expired.' };
}

/**
 * DEV ONLY — establish a session with email+password (no magic-link round-trip).
 * Signs in if the user exists, otherwise signs up (locally `enable_confirmations`
 * is off, so signUp returns a session immediately). Gated by `__DEV__` at the call
 * site; real auth is magic-link only (see `sendMagicLink`).
 */
export async function devSignIn(email: string, password: string): Promise<SignInResult> {
  const sb = getSupabase();
  const signedIn = await sb.auth.signInWithPassword({ email, password });
  if (!signedIn.error) return { ok: true };
  const signedUp = await sb.auth.signUp({ email, password });
  if (signedUp.error) return { ok: false, error: signedUp.error.message };
  if (!signedUp.data.session) {
    return { ok: false, error: 'Signed up but no session — is email confirmation on?' };
  }
  return { ok: true };
}

export async function signOut(): Promise<void> {
  await getSupabase().auth.signOut();
}

export async function getSessionUserId(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.user.id ?? null;
}
