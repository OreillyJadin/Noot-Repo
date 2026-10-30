import type { Booking } from './models';

/** refundPercent applies to cancels, no-shows, and any booking refunded in Stripe. */
function refundedPercent(b: Pick<Booking, 'status' | 'refundStatus' | 'refundPercent'>): number {
  const applies = b.status === 'cancelled' || b.status === 'no_show' || b.refundStatus === 'refunded';
  return applies ? Math.min(100, Math.max(0, b.refundPercent)) : 0;
}

/** Tutor payout after applicable cancellation, no-show, or Stripe refunds. */
export function tutorEarnedAmount(
  b: Pick<Booking, 'status' | 'refundStatus' | 'tutorPayoutAmount' | 'refundPercent'>,
): number {
  const refunded = refundedPercent(b);
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

/** Student payment net of applicable cancellation, no-show, or Stripe refunds. */
export function studentPaidAmount(
  b: Pick<Booking, 'status' | 'refundStatus' | 'price' | 'studentFee' | 'creditApplied' | 'refundPercent'>,
): StudentPayment {
  const creditCents = Math.round(b.creditApplied * 100);
  const chargedCents = Math.max(0, Math.round(b.price * 100) + Math.round(b.studentFee * 100) - creditCents);
  const refunded = refundedPercent(b);
  const netCents = Math.round((chargedCents * (100 - refunded)) / 100);
  const creditReturnedCents = Math.round((creditCents * refunded) / 100);
  return {
    charged: chargedCents / 100,
    net: netCents / 100,
    refundedToCard: (chargedCents - netCents) / 100,
    creditReturned: creditReturnedCents / 100,
  };
}
