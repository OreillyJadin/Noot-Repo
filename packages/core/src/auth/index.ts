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
 * link (must be on the project's redirect allow-list). `referralCode` is a friend's invite
 * code; handle_new_user records the referral when the account is created (0040).
 */
export async function sendSignupVerification(
  email: string,
  firstName: string,
  lastName: string,
  redirectTo?: string,
  referralCode?: string,
): Promise<SignInResult> {
  const code = referralCode?.trim();
  const { error } = await getSupabase().auth.signInWithOtp({
    email: email.trim(),
    options: {
      shouldCreateUser: true,
      data: { first_name: firstName.trim(), last_name: lastName.trim(), ...(code ? { referral_code: code } : {}) },
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

export async function signOut(): Promise<void> {
  await getSupabase().auth.signOut();
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
