// Run: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bookingQuote, creditToApply, MIN_CHARGE_CENTS, MIN_HOURLY_RATE } from '../src/pricing.ts';
import * as server from '../../../supabase/functions/_shared/credits.ts';

test('the card is always charged at least $1', () => {
  assert.equal(MIN_CHARGE_CENTS, 100);
  assert.equal(creditToApply(100000, 2800), 2700);
  assert.equal(creditToApply(2800, 2800), 2700);
});

test('a session at or under $1 takes no credit', () => {
  assert.equal(creditToApply(500, 100), 0);
  assert.equal(creditToApply(500, 99), 0);
  assert.equal(creditToApply(500, 0), 0);
});

test('a balance smaller than the room applies in full', () => {
  assert.equal(creditToApply(500, 2800), 500);
  assert.equal(creditToApply(0, 2800), 0);
});

test('fractions of a cent round down, and a negative balance applies nothing', () => {
  assert.equal(creditToApply(500.9, 2800), 500);
  assert.equal(creditToApply(5000, 1170.7), 1070);
  assert.equal(creditToApply(-500, 2800), 0);
});

test('the app shows the same credit the server charges', () => {
  assert.equal(MIN_CHARGE_CENTS, server.MIN_CHARGE_CENTS);
  for (const balance of [-100, 0, 1, 99, 100, 101, 500, 2699, 2700, 2701, 99999, 500.5]) {
    for (const amount of [0, 50, 99, 100, 101, 170, 1170, 2800, 10000, 2800.4]) {
      assert.equal(creditToApply(balance, amount), server.creditToApply(balance, amount), `${balance} of ${amount}`);
    }
  }
});

test('the checkout quote matches the server: price, 17% fee, credit, due', () => {
  const q = bookingQuote({ hourlyRate: 28, durationMinutes: 60, creditBalanceCents: 500 });
  assert.deepEqual(q, { priceCents: 2800, feeCents: 476, creditCents: 500, dueCents: 2776, free: false });
  const half = bookingQuote({ hourlyRate: 28, durationMinutes: 30 });
  assert.deepEqual(half, { priceCents: 1400, feeCents: 238, creditCents: 0, dueCents: 1638, free: false });
});

test('an admin booking is quoted at $0 with no fee, credit or charge', () => {
  const q = bookingQuote({ hourlyRate: 28, durationMinutes: 60, creditBalanceCents: 5000, adminFree: true });
  assert.deepEqual(q, { priceCents: 0, feeCents: 0, creditCents: 0, dueCents: 0, free: true });
});

test('the rate floor the server enforces is the one the app shows', () => {
  assert.equal(MIN_HOURLY_RATE, 10);
});
