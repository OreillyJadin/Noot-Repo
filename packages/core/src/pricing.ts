// What the app SHOWS about the platform fee. Display only: the server computes every real
// amount (supabase/functions/_shared/fees.ts), and these must match it. The fee is locked
// onto each booking when it's made (bookings.platform_fee / tutor_payout_amount); prefer
// those stored numbers wherever a booking exists.
export const VERIFIED_FEE_RATE = 0.175;
export const UNVERIFIED_FEE_RATE = 0.325;

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
