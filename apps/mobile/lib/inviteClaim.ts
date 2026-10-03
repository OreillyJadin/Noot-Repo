// The decisions behind lib/pendingInvite, kept pure so they're unit-tested
// (test/inviteClaim.test.ts) without AsyncStorage or a network.

/** A friend's code typed at sign-up, and the address it was typed for. */
export interface PendingInvite {
  code: string;
  email: string;
  savedAt: number;
}

/** Saved codes older than this are dropped: the sign-up was abandoned. */
export const PENDING_INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

const norm = (email: string) => email.trim().toLowerCase();

export function makePending(code: string, email: string, now: number): PendingInvite {
  return { code: code.trim(), email: norm(email), savedAt: now };
}

export function parsePending(raw: string | null): PendingInvite | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<PendingInvite>;
    return typeof p.code === 'string' && typeof p.email === 'string' && typeof p.savedAt === 'number' && p.code
      ? { code: p.code, email: p.email, savedAt: p.savedAt }
      : null;
  } catch {
    return null;
  }
}

/**
 * What to do with a saved code now that `signedInEmail` is signed in:
 *   'claim'  — it was typed for this account;
 *   'keep'   — it's someone else's (another account on this phone); leave it for them;
 *   'forget' — it has expired.
 */
export function pendingAction(p: PendingInvite, signedInEmail: string, now: number): 'claim' | 'keep' | 'forget' {
  if (now - p.savedAt > PENDING_INVITE_TTL_MS) return 'forget';
  return norm(signedInEmail) === p.email ? 'claim' : 'keep';
}

/**
 * Did the server refuse the code for good? Only claim_invite's own refusals (a plain
 * `raise exception` = P0001) count. A dropped connection, an expired session (PGRST…,
 * 42501) or a timeout (57014) must NOT lose the code — it's retried at the next sign-in.
 */
export function isFinalRefusal(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'P0001';
}
