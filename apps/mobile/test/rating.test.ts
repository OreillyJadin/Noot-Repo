import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canRateBooking } from '../lib/rating.ts';

const booking = { id: 'booking-1', status: 'completed' as const };

test('a completed booking can be rated when the student has not rated it', () => {
  assert.equal(canRateBooking(booking, new Set()), true);
});

test('a completed booking cannot be rated again by the student', () => {
  assert.equal(canRateBooking(booking, new Set(['booking-1'])), false);
});

test('only completed bookings can be rated', () => {
  for (const status of ['confirmed', 'cancelled', 'no_show', 'pending'] as const) {
    assert.equal(canRateBooking({ id: 'booking-1', status }, new Set()), false, status);
  }
});
