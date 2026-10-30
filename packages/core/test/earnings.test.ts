import { test } from 'node:test';
import assert from 'node:assert/strict';
import { studentPaidAmount, tutorEarnedAmount } from '../src/earnings.ts';

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

const paid = { price: 30, studentFee: 5.1, creditApplied: 0, refundPercent: 0 };

test('completed bookings: the student paid the full card amount', () => {
  assert.deepEqual(studentPaidAmount({ ...paid, status: 'completed' }), {
    charged: 35.1, net: 35.1, refundedToCard: 0, creditReturned: 0,
  });
});

test('refund percent only counts on cancelled and no-show bookings', () => {
  assert.deepEqual(studentPaidAmount({ ...paid, status: 'completed', refundPercent: 100 }), {
    charged: 35.1, net: 35.1, refundedToCard: 0, creditReturned: 0,
  });
});

test('a full refund returns the price and the service fee', () => {
  assert.deepEqual(studentPaidAmount({ ...paid, status: 'cancelled', refundPercent: 100 }), {
    charged: 35.1, net: 0, refundedToCard: 35.1, creditReturned: 0,
  });
  assert.deepEqual(studentPaidAmount({ ...paid, status: 'no_show', refundPercent: 100 }), {
    charged: 35.1, net: 0, refundedToCard: 35.1, creditReturned: 0,
  });
});

test('a 50% late cancel keeps half of the card amount, rounded like the capture', () => {
  assert.deepEqual(studentPaidAmount({ price: 25, studentFee: 4.25, creditApplied: 0, refundPercent: 50, status: 'cancelled' }), {
    charged: 29.25, net: 14.63, refundedToCard: 14.62, creditReturned: 0,
  });
});

test('a 0% late cancel or student no-show refunds nothing', () => {
  assert.deepEqual(studentPaidAmount({ ...paid, status: 'cancelled', refundPercent: 0 }), {
    charged: 35.1, net: 35.1, refundedToCard: 0, creditReturned: 0,
  });
});

test('Noot credit comes back as credit in the same proportion as the card refund', () => {
  assert.deepEqual(studentPaidAmount({ ...paid, creditApplied: 10, status: 'cancelled', refundPercent: 50 }), {
    charged: 25.1, net: 12.55, refundedToCard: 12.55, creditReturned: 5,
  });
  assert.deepEqual(studentPaidAmount({ ...paid, creditApplied: 35.1, status: 'cancelled', refundPercent: 100 }), {
    charged: 0, net: 0, refundedToCard: 0, creditReturned: 35.1,
  });
});

test('out-of-range refund percents are clamped', () => {
  assert.equal(studentPaidAmount({ ...paid, status: 'cancelled', refundPercent: 150 }).net, 0);
  assert.equal(studentPaidAmount({ ...paid, status: 'cancelled', refundPercent: -5 }).net, 35.1);
});
