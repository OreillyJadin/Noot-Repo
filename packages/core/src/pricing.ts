// What the app SHOWS about the platform fee. Display only: the server computes every real
// amount (supabase/functions/_shared/booking.ts FEE_RATE), and this must match it.
export const PLATFORM_FEE_RATE = 0.175;

/** The tutor's take-home for `gross` dollars, rounded to cents. */
export function tutorPayoutFor(gross: number): number {
  return Math.round(gross * (1 - PLATFORM_FEE_RATE) * 100) / 100;
}

/** Allowed hourly rate, in whole dollars. Same bounds as the Courses & rates stepper. */
export const MIN_HOURLY_RATE = 10;
export const MAX_HOURLY_RATE = 120;
