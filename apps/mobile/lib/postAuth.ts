// What to do once a session exists, regardless of HOW it was established
// (magic-link callback, email+password, or biometric unlock). Keeping this in one
// place means every auth path lands users in the same spot: accounts with a password go to
// their role's home, brand-new ones start the onboarding flow. The decision itself is
// lib/postAuthRoute.ts.
import type { ImperativeRouter } from 'expo-router';
import { api } from '@noot/core';
import { claimPendingInvite } from './pendingInvite';
import { decidePostAuthRoute, lookupWithRetry } from './postAuthRoute';
import type { Role } from './store';

export interface RouteAfterAuthResult {
  /** False if the account couldn't be read — nothing was navigated; let the user retry. */
  ok: boolean;
  /** The role we routed as (student unless the user's active role is tutor/ambassador). */
  role: Role;
  /** True if we sent them into onboarding (no password yet) rather than a home. */
  onboarding: boolean;
}

/** Shown by callers when routeAfterAuth returns ok: false. */
export const ACCOUNT_UNAVAILABLE = "Couldn't load your account. Check your connection and try again.";

/**
 * Read the signed-in account and navigate. One that has created its password lands on its
 * role's home; a new one starts onboarding at /verified. If the account can't be read (after
 * retries) it navigates NOWHERE and returns ok: false — a failed request must never put an
 * existing user back into onboarding (ERR-001). Uses router.replace so auth screens don't
 * linger in the back stack.
 */
export async function routeAfterAuth(router: ImperativeRouter, setRole: (r: Role) => void): Promise<RouteAfterAuthResult> {
  // A friend's code from the sign-up screen, if this is the account it was typed for. Not
  // awaited: it must never hold up or fail a sign-in.
  void claimPendingInvite();
  const read = await lookupWithRetry(async () => {
    const me = await api.getMe();
    return me ? { hasPassword: me.passwordSetAt != null, activeRole: me.activeRole } : null;
  });
  const route = decidePostAuthRoute(read.ok ? { ok: true, account: read.value } : { ok: false });
  if (route.kind === 'unavailable') return { ok: false, role: 'student', onboarding: false };
  if (route.kind === 'home') {
    setRole(route.role);
    router.replace(route.route);
    return { ok: true, role: route.role, onboarding: false };
  }
  router.replace('/verified');
  return { ok: true, role: 'student', onboarding: true };
}
