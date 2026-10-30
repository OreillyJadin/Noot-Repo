import type { Booking } from './models';

/**
 * What the tutor earns from a booking, in dollars. Cancelled and no-show bookings pay the
 * tutor only the share the student wasn't refunded (cancel-booking / report-no-show, see
 * lateCancelTutorPayoutCents in supabase/functions/_shared/cancellation.ts), so a full
 * refund earns $0. Other statuses earn the booking's payout.
 */
export function tutorEarnedAmount(b: Pick<Booking, 'status' | 'tutorPayoutAmount' | 'refundPercent'>): number {
  if (b.status !== 'cancelled' && b.status !== 'no_show') return b.tutorPayoutAmount;
  const refunded = Math.min(100, Math.max(0, b.refundPercent));
  return Math.round((Math.round(b.tutorPayoutAmount * 100) * (100 - refunded)) / 100) / 100;
}

/** A student's payment for a booking, net of any cancellation or no-show refund, in dollars. */
export interface StudentPayment {
  /** Card amount before any refund: price + studentFee - creditApplied. */
  charged: number;
  /** Card amount the student actually paid after the refund. */
  net: number;
  /** Returned to the card (or released from the hold). */
  refundedToCard: number;
  /** Noot credit the booking used that came back as credit. */
  creditReturned: number;
}

/**
 * What the student paid for a booking. Cancelled and no-show bookings refund refundPercent of
 * both the session price and the service fee: the card share goes back to the card (cancel-booking
 * captures only the non-refunded share, a full refund releases the hold) and the Noot-credit share
 * comes back as credit in the same proportion (return_booking_credit). Other statuses are unrefunded.
 */
export function studentPaidAmount(
  b: Pick<Booking, 'status' | 'price' | 'studentFee' | 'creditApplied' | 'refundPercent'>,
): StudentPayment {
  const creditCents = Math.round(b.creditApplied * 100);
  const chargedCents = Math.max(0, Math.round(b.price * 100) + Math.round(b.studentFee * 100) - creditCents);
  const refunded =
    b.status === 'cancelled' || b.status === 'no_show' ? Math.min(100, Math.max(0, b.refundPercent)) : 0;
  const netCents = Math.round((chargedCents * (100 - refunded)) / 100);
  const creditReturnedCents = Math.round((creditCents * refunded) / 100);
  return {
    charged: chargedCents / 100,
    net: netCents / 100,
    refundedToCard: (chargedCents - netCents) / 100,
    creditReturned: creditReturnedCents / 100,
  };
}
