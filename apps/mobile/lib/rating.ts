import type { Booking } from '@noot/core';

/** Result of a successful rated-review lookup for the signed-in reviewer. */
export interface RatedLookup {
  checked: ReadonlySet<string>;
  rated: ReadonlySet<string>;
}

/** Offer a rating only for a completed booking the signed-in reviewer hasn't rated yet. */
export function canRateBooking(b: Pick<Booking, 'id' | 'status'>, lookup: RatedLookup | null): boolean {
  return b.status === 'completed' && lookup !== null && lookup.checked.has(b.id) && !lookup.rated.has(b.id);
}

export function isRatedBooking(b: Pick<Booking, 'id' | 'status'>, lookup: RatedLookup | null): boolean {
  return b.status === 'completed' && lookup !== null && lookup.rated.has(b.id);
}
