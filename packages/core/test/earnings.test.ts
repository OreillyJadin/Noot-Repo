import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tutorEarnedAmount } from '../src/earnings.ts';

test('completed bookings earn the full tutor payout', () => {
  assert.equal(tutorEarnedAmount({ status: 'completed', tutorPayoutAmount: 20.25, refundPercent: 0 }), 20.25);
});

test('cancelled bookings earn the share not refunded to the student', () => {
  assert.equal(tutorEarnedAmount({ status: 'cancelled', tutorPayoutAmount: 20.25, refundPercent: 100 }), 0);
  assert.equal(tutorEarnedAmount({ status: 'cancelled', tutorPayoutAmount: 20.25, refundPercent: 50 }), 10.13);
  assert.equal(tutorEarnedAmount({ status: 'cancelled', tutorPayoutAmount: 20.25, refundPercent: 0 }), 20.25);
});

test('no-show bookings earn the share not refunded to the student', () => {
  assert.equal(tutorEarnedAmount({ status: 'no_show', tutorPayoutAmount: 20.25, refundPercent: 100 }), 0);
  assert.equal(tutorEarnedAmount({ status: 'no_show', tutorPayoutAmount: 20.25, refundPercent: 0 }), 20.25);
});

test('other booking statuses earn the full tutor payout', () => {
  assert.equal(tutorEarnedAmount({ status: 'confirmed', tutorPayoutAmount: 20.25, refundPercent: 50 }), 20.25);
});
