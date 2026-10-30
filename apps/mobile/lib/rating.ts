import type { Booking } from '@noot/core';

/** A student can rate a session once it's completed, and only until they've rated it. */
export function canRateBooking(b: Pick<Booking, 'id' | 'status'>, ratedIds: ReadonlySet<string>): boolean {
  return b.status === 'completed' && !ratedIds.has(b.id);
}
