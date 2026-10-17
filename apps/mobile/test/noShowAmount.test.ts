// Run: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { studentFeeFor } from '@noot/core';
import { noShowAmount } from '../lib/noShowAmount.ts';

test('student refund includes the paid session price and fee', () => {
  assert.equal(noShowAmount('student', { price: 40, studentFee: 6.8, creditApplied: 0 }, 99), 46.8);
});

test('student refund subtracts applied credit', () => {
  assert.equal(noShowAmount('student', { price: 40, studentFee: 6.8, creditApplied: 5 }, 99), 41.8);
});

test('student refund uses the fallback gross and calculated fee without a price', () => {
  const fallbackGross = 40;
  assert.equal(
    noShowAmount('student', {}, fallbackGross),
    fallbackGross + studentFeeFor(fallbackGross),
  );
});

test('tutor payout uses the booking payout amount', () => {
  assert.equal(noShowAmount('tutor', { tutorPayoutAmount: 34 }, 40), 34);
});

test('tutor payout falls back to the gross amount', () => {
  assert.equal(noShowAmount('tutor', {}, 40), 40);
});
