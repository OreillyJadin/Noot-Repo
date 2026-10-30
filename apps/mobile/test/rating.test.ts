import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canRateBooking, isRatedBooking, type RatedLookup } from '../lib/rating.ts';

const booking = { id: 'booking-1', status: 'completed' as const };
const checkedUnrated: RatedLookup = { checked: new Set(['booking-1']), rated: new Set() };
const checkedRated: RatedLookup = { checked: new Set(['booking-1']), rated: new Set(['booking-1']) };

test('a null lookup does not offer rating or show rated state', () => {
  assert.equal(canRateBooking(booking, null), false);
  assert.equal(isRatedBooking(booking, null), false);
});

test('a completed booking outside the checked set is not rateable', () => {
  assert.equal(canRateBooking(booking, { checked: new Set(), rated: new Set() }), false);
});

test('a checked completed booking without a review can be rated', () => {
  assert.equal(canRateBooking(booking, checkedUnrated), true);
  assert.equal(isRatedBooking(booking, checkedUnrated), false);
});

test('a checked completed booking with a review is rated and cannot be rated again', () => {
  assert.equal(canRateBooking(booking, checkedRated), false);
  assert.equal(isRatedBooking(booking, checkedRated), true);
});

test('only completed bookings can be rated', () => {
  for (const status of ['confirmed', 'cancelled', 'no_show', 'pending'] as const) {
    assert.equal(canRateBooking({ id: 'booking-1', status }, checkedUnrated), false, status);
  }
});
