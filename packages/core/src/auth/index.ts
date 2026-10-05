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


// ─── email + password ───────────────────────────────────────────────────────
// The account model is: sign UP is passwordless (magic-link verification only, so
// we know the .edu address is real), and the password is set DURING onboarding via
// setPassword() below. Sign IN is then email+password. The `.edu` gate is a
// `before insert on auth.users` trigger (migration 0003), enforced for OTP too.

/**
 * Send a sign-up verification magic link. The user's name is carried in the OTP's
 * user_metadata so the `handle_new_user` trigger populates public.users.first_name
 * /last_name on insert (migration 0003). `shouldCreateUser` is true — this is how a
 * brand-new account is provisioned. `redirectTo` is the app's /auth-callback deep
 * link (must be on the project's redirect allow-list).
 */
export async function sendSignupVerification(
  email: string,
  firstName: string,
  lastName: string,
  redirectTo?: string,
): Promise<SignInResult> {
  const { error } = await getSupabase().auth.signInWithOtp({
    email: email.trim(),
    options: {
      shouldCreateUser: true,
      data: { first_name: firstName.trim(), last_name: lastName.trim() },
      ...(redirectTo ? { emailRedirectTo: redirectTo } : {}),
    },
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Sign in an existing user with email + password. */
export async function signInWithPassword(email: string, password: string): Promise<SignInResult> {
  const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Set (or change) the current session's password. Works for both flows that land
 * here with a live session: a newly-verified sign-up choosing their first password
 * during onboarding, and a `?type=recovery` reset. Requires an active session —
 * the caller must have completed the magic-link / recovery exchange first.
 */
export async function setPassword(password: string): Promise<SignInResult> {
  const { error } = await getSupabase().auth.updateUser({ password });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Send a password-reset email. Points back at /auth-callback with a `flow=recovery`
 * marker so the callback routes into the set-password step (the recovery link
 * carries `?type=recovery`, handled by completeAuthFromUrl).
 */
export async function sendPasswordReset(email: string, redirectTo?: string): Promise<SignInResult> {
  const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim(), {
    ...(redirectTo ? { redirectTo } : {}),
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ─── the code in the email ──────────────────────────────────────────────────
// Every auth email carries a link AND a code (supabase/templates: {{ .Token }}). The link
// only works on the phone the app is installed on; the code is for someone reading the email
// anywhere else (ERR-023). Both come from the same request and either one spends it.

/** What a wrong, used or expired code gets told. */
export const BAD_EMAIL_CODE = 'That code is wrong or has expired. Check it, or send a new one.';

/**
 * The digits of a typed or pasted code ("123 456" → "123456"), or null if that can't be one.
 * The length is the project's setting (6 on the local stack, 8 in production), so a range is
 * accepted here and the server decides.
 */
export function normalizeEmailCode(input: string): string | null {
  const digits = input.replace(/[\s-]/g, '');
  return /^\d{6,10}$/.test(digits) ? digits : null;
}

/**
 * Finish a sign-up verification or a password reset with the emailed code instead of the
 * link. On success a session exists, exactly as after completeAuthFromUrl: route a sign-up
 * on to onboarding and a reset on to the set-password step. `email` must be the address the
 * code was sent to. Guessing is limited by the Auth server (per-IP verification rate limit
 * and the code's expiry), not here.
 */
export async function verifyEmailCode(
  email: string,
  code: string,
  kind: 'signup' | 'recovery',
): Promise<SignInResult> {
  const token = normalizeEmailCode(code);
  if (!token) return { ok: false, error: BAD_EMAIL_CODE };
  const { error } = await getSupabase().auth.verifyOtp({
    email: email.trim(),
    token,
    // sendSignupVerification sends through signInWithOtp, whose code verifies as 'email'.
    type: kind === 'recovery' ? 'recovery' : 'email',
  });
  if (!error) return { ok: true };
  // The server answers a wrong, used or expired code with this one code. Anything else it
  // refuses for (a suspended account, say) keeps its own message.
  if (error.code === 'otp_expired') return { ok: false, error: BAD_EMAIL_CODE };
  if (error.status === 429) return { ok: false, error: 'Too many tries. Wait a minute, then try again.' };
  // supabase-js returns a failed request rather than throwing it.
  if (error.name === 'AuthRetryableFetchError' || !error.status) {
    return { ok: false, error: "Couldn't reach noot. Check your connection and try again." };
  }
  return { ok: false, error: error.message };
}

/**
 * End the session on this device. The server is asked to revoke it first; if that request
 * fails (offline, or the Auth server is down) supabase-js reports the error and KEEPS the
 * session — for every scope, 'local' included — so the app would reopen signed in. Signing
 * out must not depend on the network, so the device's copy is then dropped directly.
 *
 * That last step uses the client's own session-removal routine, which is not part of its
 * public API (there is no public way to forget a session without the server).
 * scripts/verify_sign_out.mts fails if a supabase-js upgrade ever takes it away. The server
 * copy is left to expire; nothing on this device can use it any more.
 */
export async function signOut(): Promise<void> {
  const client = getSupabase().auth;
  const { error } = await client.signOut();
  if (!error) return;
  await (client as unknown as { _removeSession?: () => Promise<void> })._removeSession?.();
}

/**
 * The current session's user id, or null if signed out. supabase-js persists the
 * session (encrypted keystore on native — see LargeSecureStore) and auto-refreshes
 * it, so on a returning launch this resolves without any network round-trip — which
 * is what lets the biometric layer gate an already-valid session, not re-auth.
 */
export async function getSessionUserId(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.user.id ?? null;
}

/** The auth transitions the app reacts to. Token refreshes are deliberately not surfaced. */
export type AuthChange = 'signed_in' | 'signed_out' | 'user_updated';

/**
 * Subscribe to sign-in / sign-out / account updates (e.g. a password change). Lets the app
 * drop the previous user's cached state on sign-out and load the new one on sign-in, instead
 * of holding whatever it read at launch. Returns the unsubscribe function.
 */
export function onAuthChange(fn: (change: AuthChange) => void): () => void {
  const { data } = getSupabase().auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN') fn('signed_in');
    else if (event === 'SIGNED_OUT') fn('signed_out');
    else if (event === 'USER_UPDATED') fn('user_updated');
  });
  return () => data.subscription.unsubscribe();
}
