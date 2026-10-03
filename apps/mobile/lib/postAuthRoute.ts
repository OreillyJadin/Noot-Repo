// Where a signed-in user belongs — the decision behind lib/postAuth.ts, kept pure so it can
// be tested (test/postAuthRoute.test.ts).
//
// ERR-001: an account that had long since created its password kept landing back on "Create
// your password" (and from there Face ID → role → tutor onboarding) after the app was quit.
// Two causes, both answered here from what the SERVER says about the account rather than
// from anything remembered on the phone:
//   • a failed lookup used to mean "treat as a new account". It now means 'unavailable' —
//     the caller retries; nobody is sent into onboarding because a request failed.
//   • the emailed sign-up link reaching /auth-callback again (the platform re-delivers the
//     launch URL on a reopen) used to restart onboarding whenever the device's link ledger
//     didn't know the link. An account that already finished the password step goes home.
import type { Role } from './store';

/** The fields of the signed-in user this decision reads. */
export interface RoutedUser {
  firstName: string;
  activeRole: string;
  termsAcceptedAt: string | null;
}

/** The result of reading the signed-in user: found (or no row yet), or the read failed. */
export type MeLookup = { ok: true; me: RoutedUser | null } | { ok: false };

/**
 * How the session got here. 'signup_link' is the emailed verification link, whose only
 * legitimate next step for a NEW account is creating a password.
 */
export type AuthEntry = 'session' | 'signup_link';

export type PostAuthRoute =
  | { kind: 'home'; role: Role; route: '/home' | '/tutor_home' | '/ambassador_home' }
  | { kind: 'onboarding' }
  | { kind: 'unavailable' };

/** The home for the user's persisted mode. Admin is not a mode, so it lands as a student. */
function homeFor(activeRole: string): PostAuthRoute {
  if (activeRole === 'tutor') return { kind: 'home', role: 'tutor', route: '/tutor_home' };
  if (activeRole === 'ambassador') return { kind: 'home', role: 'ambassador', route: '/ambassador_home' };
  return { kind: 'home', role: 'student', route: '/home' };
}

export function decidePostAuthRoute(lookup: MeLookup, entry: AuthEntry): PostAuthRoute {
  if (!lookup.ok) return { kind: 'unavailable' };
  const me = lookup.me;
  // No users row yet (it can lag a fresh sign-up) → a new account.
  if (!me) return { kind: 'onboarding' };
  if (entry === 'signup_link') {
    // Terms are accepted on the same tap that saves the first password, so a recorded
    // acceptance means that step is behind them — this link is a replay, not a sign-up.
    return me.termsAcceptedAt ? homeFor(me.activeRole) : { kind: 'onboarding' };
  }
  return me.firstName.trim() ? homeFor(me.activeRole) : { kind: 'onboarding' };
}

/**
 * Read with a couple of quick retries. A cold launch can ask before the network is back,
 * and one failed request shouldn't decide where someone lands.
 */
export async function lookupWithRetry<T>(
  read: () => Promise<T>,
  delaysMs: number[] = [400, 1200],
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<{ ok: true; value: T } | { ok: false }> {
  for (let attempt = 0; ; attempt++) {
    try {
      return { ok: true, value: await read() };
    } catch {
      const wait = delaysMs[attempt];
      if (wait === undefined) return { ok: false };
      await sleep(wait);
    }
  }
}
