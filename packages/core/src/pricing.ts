// What the app SHOWS about fees. Display only: the server computes every real amount
// (supabase/functions/_shared/fees.ts), and these must match it. The tutor-side fee is
// locked onto each booking (bookings.platform_fee / tutor_payout_amount).
export const VERIFIED_FEE_RATE = 0.175;
export const UNVERIFIED_FEE_RATE = 0.325;
export const STUDENT_FEE_RATE = 0.17;

const round2 = (n: number) => Math.round(n * 100) / 100;

export function studentFeeFor(price: number): number {
  return round2(price * STUDENT_FEE_RATE);
}

export function feeRateFor(gradesVerified: boolean): number {
  return gradesVerified ? VERIFIED_FEE_RATE : UNVERIFIED_FEE_RATE;
}

/** The tutor's take-home for `gross` dollars, rounded to cents — same rounding as the server. */
export function tutorPayoutFor(gross: number, gradesVerified: boolean): number {
  const fee = Math.round(gross * feeRateFor(gradesVerified) * 100) / 100;
  return Math.round((gross - fee) * 100) / 100;
}

/** Allowed hourly rate, in whole dollars. Same bounds as the Courses & rates stepper. */
export const MIN_HOURLY_RATE = 10;
export const MAX_HOURLY_RATE = 120;

/**
 * Noot credit at checkout — display only, mirrors supabase/functions/_shared/credits.ts.
 * The card is always charged at least MIN_CHARGE_CENTS; the rest can be credit.
 */
export const MIN_CHARGE_CENTS = 100;
export function creditToApply(balanceCents: number, amountCents: number): number {
  const room = Math.max(0, Math.floor(amountCents) - MIN_CHARGE_CENTS);
  return Math.max(0, Math.min(Math.floor(balanceCents), room));
}
