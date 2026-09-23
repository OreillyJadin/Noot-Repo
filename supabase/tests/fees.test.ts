// Run: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feeRateFor, splitPrice, VERIFIED_FEE_RATE, UNVERIFIED_FEE_RATE } from '../functions/_shared/fees.ts';

test('rates: 17.5% verified, 32.5% unverified (15 points more)', () => {
  assert.equal(feeRateFor(true), 0.175);
  assert.equal(feeRateFor(false), 0.325);
  assert.equal(Math.round((UNVERIFIED_FEE_RATE - VERIFIED_FEE_RATE) * 1000), 150);
});

test('the verified split matches the shipped, device-verified numbers ($28 → $4.90 / $23.10)', () => {
  assert.deepEqual(splitPrice(28, true), { platformFee: 4.9, tutorPayout: 23.1 });
});

test('unverified: $28 → $9.10 fee, $18.90 to the tutor', () => {
  assert.deepEqual(splitPrice(28, false), { platformFee: 9.1, tutorPayout: 18.9 });
});

test('fee and payout always add back up to the price, to the cent', () => {
  for (const verified of [true, false]) {
    for (let cents = 100; cents <= 30000; cents += 137) {
      const price = cents / 100;
      const { platformFee, tutorPayout } = splitPrice(price, verified);
      assert.equal(Math.round((platformFee + tutorPayout) * 100), cents, `${price} verified=${verified}`);
    }
  }
});

test('a 30-minute $25/hr session ($12.50)', () => {
  assert.deepEqual(splitPrice(12.5, true), { platformFee: 2.19, tutorPayout: 10.31 });
  assert.deepEqual(splitPrice(12.5, false), { platformFee: 4.06, tutorPayout: 8.44 });
});

test('the app’s display mirror (@noot/core pricing) matches the server exactly', async () => {
  const core = await import('../../packages/core/src/pricing.ts');
  assert.equal(core.VERIFIED_FEE_RATE, VERIFIED_FEE_RATE);
  assert.equal(core.UNVERIFIED_FEE_RATE, UNVERIFIED_FEE_RATE);
  for (const verified of [true, false]) {
    for (let cents = 100; cents <= 30000; cents += 211) {
      const price = cents / 100;
      assert.equal(core.tutorPayoutFor(price, verified), splitPrice(price, verified).tutorPayout, `${price}`);
    }
  }
});
