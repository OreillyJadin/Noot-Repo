// Each emailed auth link is exchanged once per app process (tracker T2).
//
// A cold launch from a link can deliver that link twice — as the launch URL and again as a
// "url" event — so /auth-callback mounts twice. completeAuthFromUrl treats "already signed
// in" as success, so the second pass sent the user to "Set a new password" again after they
// had already set it.
//
// Now every mount for the same link shares ONE exchange (so neither copy can race the other
// or be left waiting on a cancelled one), and a recovery link only leads to the reset screen
// until the reset has actually been completed.
type Result = { ok: boolean; error?: string };

const exchanges = new Map<string, Promise<Result>>();
let resetDone = false;

/** The link's one-time key (`code`, or `token_hash`), if it has one. */
function keyOf(params: Record<string, unknown>): string | null {
  const key = [params.code, params.token_hash].find((v) => typeof v === 'string' && v);
  return typeof key === 'string' ? key : null;
}

/**
 * Run `exchange` for this link at most once per process; later calls for the same link get
 * the same result. A link without a one-time key can't be deduplicated and always runs.
 */
export function exchangeOnce(params: Record<string, unknown>, exchange: () => Promise<Result>): Promise<Result> {
  const key = keyOf(params);
  if (!key) return exchange();
  let p = exchanges.get(key);
  if (!p) {
    p = exchange();
    exchanges.set(key, p);
  }
  return p;
}

/** Called by set_password once a reset has gone through. */
export function markPasswordResetDone(): void {
  resetDone = true;
}

/** Whether a password reset has been completed in this app process. */
export function passwordResetDone(): boolean {
  return resetDone;
}
