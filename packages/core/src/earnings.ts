import type { Booking } from './models';

type RefundInput = Pick<Booking, 'status' | 'refundStatus' | 'refundPercent' | 'price' | 'studentFee' | 'creditApplied' | 'refundedCents'>;

function chargedCents(b: Pick<Booking, 'price' | 'studentFee' | 'creditApplied'>): number {
  return Math.max(0, Math.round(b.price * 100) + Math.round(b.studentFee * 100) - Math.round(b.creditApplied * 100));
}

function exactRefund(b: RefundInput, charged: number): number | null {
  const applies = b.status === 'cancelled' || b.status === 'no_show' || b.refundStatus === 'refunded';
  return applies && b.refundedCents != null && charged > 0 ? Math.min(charged, Math.max(0, b.refundedCents)) : null;
}

/** refundPercent applies to cancels, no-shows, and any booking refunded in Stripe. */
function refundedPercent(b: Pick<Booking, 'status' | 'refundStatus' | 'refundPercent'>): number {
  const applies = b.status === 'cancelled' || b.status === 'no_show' || b.refundStatus === 'refunded';
  return applies ? Math.min(100, Math.max(0, b.refundPercent)) : 0;
}

/** Tutor payout after applicable cancellation, no-show, or Stripe refunds. */
export function tutorEarnedAmount(
  b: RefundInput & Pick<Booking, 'tutorPayoutAmount'>,
): number {
  const charged = chargedCents(b);
  const exact = exactRefund(b, charged);
  if (exact != null) return Math.round((Math.round(b.tutorPayoutAmount * 100) * (charged - exact)) / charged) / 100;
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
  b: RefundInput,
): StudentPayment {
  const creditCents = Math.round(b.creditApplied * 100);
  const charged = chargedCents(b);
  const exact = exactRefund(b, charged);
  const refunded = refundedPercent(b);
  const netCents = exact == null ? Math.round((charged * (100 - refunded)) / 100) : charged - exact;
  const creditReturnedCents = exact == null ? Math.round((creditCents * refunded) / 100) : Math.round((creditCents * exact) / charged);
  return {
    charged: charged / 100,
    net: netCents / 100,
    refundedToCard: (charged - netCents) / 100,
    creditReturned: creditReturnedCents / 100,
  };
}
