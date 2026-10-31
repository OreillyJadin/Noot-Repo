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

/** Display-only hourly estimate; currently-taking courses never get the verified fee. */
export function tutorHourlyEstimate(hourlyRate: number, gradesVerified: boolean, currentlyTaking: boolean) {
  if (!Number.isFinite(hourlyRate) || hourlyRate < MIN_HOURLY_RATE || hourlyRate > MAX_HOURLY_RATE) return null;
  const verifiedCourse = gradesVerified && !currentlyTaking;
  const gross = round2(hourlyRate);
  return {
    gross,
    net: tutorPayoutFor(gross, verifiedCourse),
    feeRate: feeRateFor(verifiedCourse),
  };
}

/**
 * Noot credit at checkout — display only, mirrors supabase/functions/_shared/credits.ts.
 * The card is always charged at least MIN_CHARGE_CENTS; the rest can be credit.
 */
export const MIN_CHARGE_CENTS = 100;
export function creditToApply(balanceCents: number, amountCents: number): number {
  const room = Math.max(0, Math.floor(amountCents) - MIN_CHARGE_CENTS);
  return Math.max(0, Math.min(Math.floor(balanceCents), room));
}

/** What the checkout screen shows, in cents. Display only — the server recomputes all of it. */
export type BookingQuote = {
  priceCents: number;
  feeCents: number;
  creditCents: number;
  /** What the card is charged: price + fee − credit. */
  dueCents: number;
  /** An admin's booking: $0 across the board, no card and no credit involved. */
  free: boolean;
};

/**
 * The checkout numbers for a session, mirroring the server (resolveBooking + creditToApply,
 * and freeBookingFor for admins). `adminFree` must come from the signed-in user's roles; the
 * server decides it again from public.is_admin() and ignores anything the client claims.
 */
export function bookingQuote(input: {
  hourlyRate: number;
  durationMinutes: number;
  creditBalanceCents?: number;
  adminFree?: boolean;
}): BookingQuote {
  if (input.adminFree) return { priceCents: 0, feeCents: 0, creditCents: 0, dueCents: 0, free: true };
  const priceCents = Math.round(round2((input.hourlyRate * input.durationMinutes) / 60) * 100);
  const feeCents = Math.round(studentFeeFor(priceCents / 100) * 100);
  const creditCents = creditToApply(input.creditBalanceCents ?? 0, priceCents + feeCents);
  return { priceCents, feeCents, creditCents, dueCents: priceCents + feeCents - creditCents, free: false };
}
