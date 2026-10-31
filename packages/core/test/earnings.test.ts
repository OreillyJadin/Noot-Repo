import { test } from 'node:test';
import assert from 'node:assert/strict';
import { studentPaidAmount, tutorEarnedAmount } from '../src/earnings.ts';

test('completed bookings earn the full tutor payout', () => {
  assert.equal(tutorEarnedAmount({
    status: 'completed', refundStatus: 'not_applicable', tutorPayoutAmount: 20.25, refundPercent: 0,
  }), 20.25);
});

test('cancelled bookings earn the share not refunded to the student', () => {
  assert.equal(tutorEarnedAmount({
    status: 'cancelled', refundStatus: 'refunded', tutorPayoutAmount: 20.25, refundPercent: 100,
  }), 0);
  assert.equal(tutorEarnedAmount({
    status: 'cancelled', refundStatus: 'refunded', tutorPayoutAmount: 20.25, refundPercent: 50,
  }), 10.13);
  assert.equal(tutorEarnedAmount({
    status: 'cancelled', refundStatus: 'not_refunded', tutorPayoutAmount: 20.25, refundPercent: 0,
  }), 20.25);
});

test('no-show bookings earn the share not refunded to the student', () => {
  assert.equal(tutorEarnedAmount({
    status: 'no_show', refundStatus: 'refunded', tutorPayoutAmount: 20.25, refundPercent: 100,
  }), 0);
  assert.equal(tutorEarnedAmount({
    status: 'no_show', refundStatus: 'not_refunded', tutorPayoutAmount: 20.25, refundPercent: 0,
  }), 20.25);
});

test('other booking statuses earn the full tutor payout', () => {
  assert.equal(tutorEarnedAmount({
    status: 'confirmed', refundStatus: 'not_applicable', tutorPayoutAmount: 20.25, refundPercent: 50,
  }), 20.25);
});

test('Stripe-refunded completed bookings earn only the share not refunded', () => {
  assert.equal(tutorEarnedAmount({
    status: 'completed', refundStatus: 'refunded', tutorPayoutAmount: 20.25, refundPercent: 25,
  }), 15.19);
});

const paid = {
  price: 30, studentFee: 5.1, creditApplied: 0, refundPercent: 0, refundedCents: null, refundStatus: 'not_applicable' as const,
};

test('exact cents take precedence when applicable, capped at the card amount', () => {
  const b = { ...paid, status: 'completed' as const, refundStatus: 'refunded' as const, refundPercent: 28, refundedCents: 1000, tutorPayoutAmount: 20.25 };
  assert.deepEqual(studentPaidAmount(b), { charged: 35.1, net: 25.1, refundedToCard: 10, creditReturned: 0 });
  assert.equal(tutorEarnedAmount(b), 14.48);
  assert.deepEqual(studentPaidAmount({ ...b, refundedCents: null }), { charged: 35.1, net: 25.27, refundedToCard: 9.83, creditReturned: 0 });
  assert.equal(studentPaidAmount({ ...b, refundedCents: 9000 }).net, 0);
  assert.equal(studentPaidAmount({ ...b, refundStatus: 'not_applicable' }).net, 35.1);
  assert.equal(studentPaidAmount({ ...b, price: 40, creditApplied: 10 }).creditReturned, 2.85);
  assert.deepEqual(studentPaidAmount({ ...b, creditApplied: 35.1, refundPercent: 50 }), { charged: 0, net: 0, refundedToCard: 0, creditReturned: 17.55 });
  assert.equal(tutorEarnedAmount({ ...b, creditApplied: 35.1, refundPercent: 50 }), 10.13);
});

test('completed bookings: the student paid the full card amount', () => {
  assert.deepEqual(studentPaidAmount({ ...paid, status: 'completed' }), {
    charged: 35.1, net: 35.1, refundedToCard: 0, creditReturned: 0,
  });
});

test('refund percent only counts on cancelled and no-show bookings unless refunded in Stripe', () => {
  assert.deepEqual(studentPaidAmount({ ...paid, status: 'completed', refundPercent: 100 }), {
    charged: 35.1, net: 35.1, refundedToCard: 0, creditReturned: 0,
  });
});

test('a Stripe refund nets completed bookings by refundPercent', () => {
  assert.deepEqual(studentPaidAmount({
    ...paid, status: 'completed', refundStatus: 'refunded', refundPercent: 25,
  }), {
    charged: 35.1, net: 26.33, refundedToCard: 8.77, creditReturned: 0,
  });
});

test('a full refund returns the price and the service fee', () => {
  assert.deepEqual(studentPaidAmount({ ...paid, status: 'cancelled', refundStatus: 'refunded', refundPercent: 100 }), {
    charged: 35.1, net: 0, refundedToCard: 35.1, creditReturned: 0,
  });
  assert.deepEqual(studentPaidAmount({ ...paid, status: 'no_show', refundStatus: 'refunded', refundPercent: 100 }), {
    charged: 35.1, net: 0, refundedToCard: 35.1, creditReturned: 0,
  });
});

test('a 50% late cancel keeps half of the card amount, rounded like the capture', () => {
  assert.deepEqual(studentPaidAmount({
    price: 25, studentFee: 4.25, creditApplied: 0, refundPercent: 50, refundStatus: 'refunded', status: 'cancelled',
  }), {
    charged: 29.25, net: 14.63, refundedToCard: 14.62, creditReturned: 0,
  });
});

test('a 0% late cancel or student no-show refunds nothing', () => {
  assert.deepEqual(studentPaidAmount({ ...paid, status: 'cancelled', refundStatus: 'not_refunded', refundPercent: 0 }), {
    charged: 35.1, net: 35.1, refundedToCard: 0, creditReturned: 0,
  });
});

test('Noot credit comes back as credit in the same proportion as the card refund', () => {
  assert.deepEqual(studentPaidAmount({
    ...paid, creditApplied: 10, status: 'cancelled', refundStatus: 'refunded', refundPercent: 50,
  }), {
    charged: 25.1, net: 12.55, refundedToCard: 12.55, creditReturned: 5,
  });
  assert.deepEqual(studentPaidAmount({
    ...paid, creditApplied: 35.1, status: 'cancelled', refundStatus: 'refunded', refundPercent: 100,
  }), {
    charged: 0, net: 0, refundedToCard: 0, creditReturned: 35.1,
  });
});

test('out-of-range refund percents are clamped', () => {
  assert.equal(studentPaidAmount({
    ...paid, status: 'cancelled', refundStatus: 'refunded', refundPercent: 150,
  }).net, 0);
  assert.equal(studentPaidAmount({
    ...paid, status: 'cancelled', refundStatus: 'not_refunded', refundPercent: -5,
  }).net, 35.1);
});
