// Which screens can be open without a session. Everything else belongs to a signed-in
// account: SignedOutGuard sends anyone on one of those screens without a session back to the
// landing, and signing out clears the whole back stack (resetToSignedOut), so nothing from the
// previous account can be reached with Back or a swipe (STU-07).
//
// An allowlist on purpose: a new screen is protected unless it is added here.
export const SIGNED_OUT_ROUTES: readonly string[] = [
  '', // the landing (index)
  'signin',
  'signup',
  'forgot_password',
  'auth-callback',
];

/** The top-level route name of an expo-router pathname: '/sessions?tab=past' → 'sessions'. */
export function routeName(pathname: string): string {
  const path = pathname.split(/[?#]/)[0] ?? '';
  return path.replace(/^\/+/, '').split('/')[0] ?? '';
}

/** True when this pathname may be shown without a session. */
export function isSignedOutRoute(pathname: string): boolean {
  return SIGNED_OUT_ROUTES.includes(routeName(pathname));
}

/** True when the screen at `pathname` must not stay open: it needs a session and there is none. */
export function needsSignedOutRedirect(pathname: string, hasSession: boolean): boolean {
  return !hasSession && !isSignedOutRoute(pathname);
}
