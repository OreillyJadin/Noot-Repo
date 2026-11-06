export const FULL_REFUND_HOURS = 12;
export const HALF_REFUND_HOURS = 2;

/** Student-cancel refund tier from hours until start. */
export function studentCancelRefundPercent(hoursUntilStart: number): 0 | 50 | 100 {
  return hoursUntilStart >= FULL_REFUND_HOURS ? 100 : hoursUntilStart >= HALF_REFUND_HOURS ? 50 : 0;
}

export function lockedRefundPercentOnAccept(
  originalScheduledAt: string,
  now: number,
  existingLock: 0 | 50 | null,
  waived: boolean,
): 0 | 50 | null {
  if (waived) return null;
  const refund = studentCancelRefundPercentWithLock(
    (new Date(originalScheduledAt).getTime() - now) / 3600_000,
    existingLock,
  );
  return refund === 100 ? null : refund;
}

export function studentCancelRefundPercentWithLock(
  hoursUntilStart: number,
  lock: 0 | 50 | null,
): 0 | 50 | 100 {
  return Math.min(studentCancelRefundPercent(hoursUntilStart), lock ?? 100) as 0 | 50 | 100;
}

/** Tutor's share (cents) of a late student cancel: the non-refunded share of the booking's stored payout. */
export function lateCancelTutorPayoutCents(tutorPayoutAmount: number, refundPercent: number): number {
  return Math.round((Math.round(tutorPayoutAmount * 100) * (100 - refundPercent)) / 100);
}

/** bookings.cancellation_deadline: the last moment a student cancel is fully refunded. */
export function cancellationDeadlineFor(scheduledAt: Date): Date {
  return new Date(scheduledAt.getTime() - FULL_REFUND_HOURS * 3600_000);
}
