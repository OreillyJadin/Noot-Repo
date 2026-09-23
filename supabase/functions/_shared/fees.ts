// Platform fee: how a session price splits between noot and the tutor (tracker T6 / D5).
//
// Pure (no imports) so it runs in Deno and in the node tests (scripts/…, pnpm test).
// The rate is decided when the booking is made and stored on the booking
// (platform_fee / tutor_payout_amount); complete-session pays out exactly that, so a tutor
// verified between booking and completion keeps the rate the booking was made at.

/** Grades verified by an admin (the Verified badge). */
export const VERIFIED_FEE_RATE = 0.175;
/** No verified transcript — 15 percentage points more (D5, decided 2026-09-23). */
export const UNVERIFIED_FEE_RATE = 0.325;

export function feeRateFor(gradesVerified: boolean): number {
  return gradesVerified ? VERIFIED_FEE_RATE : UNVERIFIED_FEE_RATE;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Split a session price (dollars) into the platform fee and the tutor's payout. The fee is
 * rounded to cents and the payout is the remainder, so the two always add up to the price.
 */
export function splitPrice(price: number, gradesVerified: boolean): { platformFee: number; tutorPayout: number } {
  const platformFee = round2(price * feeRateFor(gradesVerified));
  return { platformFee, tutorPayout: round2(price - platformFee) };
}
