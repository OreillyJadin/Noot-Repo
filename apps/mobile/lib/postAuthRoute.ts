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
//     didn't know the link. Onboarding starts by creating a password, so an account that
//     has chosen one (users.password_set_at, 0041) is past it and goes home — however it
//     got here.
//
// It also holds the door on the Terms of Use: no sign-in or launch ends at a home for an
// account that has not accepted them.
import type { Role } from './store';

/** What the decision reads about the signed-in account. */
export interface AccountState {
  /** The user has chosen a password (not the random one a link-only sign-up starts with). */
  hasPassword: boolean;
  /** The user has accepted the Terms of Use (users.terms_accepted_at, 0030). */
  acceptedTerms: boolean;
  activeRole: string;
}

/** The result of reading the account: found (or no users row yet), or the read failed. */
export type AccountLookup = { ok: true; account: AccountState | null } | { ok: false };

export type PostAuthRoute =
  | { kind: 'home'; role: Role; route: '/home' | '/tutor_home' | '/ambassador_home' }
  | { kind: 'onboarding' }
  | { kind: 'terms' }
  | { kind: 'unavailable' };

export function decidePostAuthRoute(lookup: AccountLookup): PostAuthRoute {
  if (!lookup.ok) return { kind: 'unavailable' };
  const account = lookup.account;
  // No users row yet (it can lag a fresh sign-up), or no password → still signing up.
  if (!account || !account.hasPassword) return { kind: 'onboarding' };
  // Onboarding is where the Terms are accepted, on the same screen as the password. An
  // account can end up with a password without it: Forgot password after abandoning
  // onboarding, an acceptance that failed to save, or an account older than the Terms. None
  // of them gets into the app until it has accepted.
  if (!account.acceptedTerms) return { kind: 'terms' };
  // The home for the user's persisted mode. Admin is not a mode — an admin still browses
  // as student/tutor, so it lands on the student home.
  if (account.activeRole === 'tutor') return { kind: 'home', role: 'tutor', route: '/tutor_home' };
  if (account.activeRole === 'ambassador') return { kind: 'home', role: 'ambassador', route: '/ambassador_home' };
  return { kind: 'home', role: 'student', route: '/home' };
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
