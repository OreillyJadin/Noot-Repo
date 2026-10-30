import type { Booking } from '@noot/core';

/** Result of a successful rated-review lookup: which bookings were checked, and which of those the student has rated. */
export interface RatedLookup {
  checked: ReadonlySet<string>;
  rated: ReadonlySet<string>;
}

/** Offer "Rate session" only for a completed booking we've confirmed the student hasn't rated yet. */
export function canRateBooking(b: Pick<Booking, 'id' | 'status'>, lookup: RatedLookup | null): boolean {
  return b.status === 'completed' && lookup !== null && lookup.checked.has(b.id) && !lookup.rated.has(b.id);
}

export function isRatedBooking(b: Pick<Booking, 'id' | 'status'>, lookup: RatedLookup | null): boolean {
  return b.status === 'completed' && lookup !== null && lookup.rated.has(b.id);
}
