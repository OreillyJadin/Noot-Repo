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
