import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chargeRefundPercent } from '../functions/_shared/refunds.ts';

test('full-capture refunds use cumulative refunded charge totals', () => {
  assert.equal(chargeRefundPercent({ amount: 2000, amount_captured: 2000, amount_refunded: 500 }), 25);
  assert.equal(chargeRefundPercent({ amount: 2000, amount_captured: 2000, amount_refunded: 1000 }), 50);
  assert.equal(chargeRefundPercent({ amount: 2000, amount_captured: 2000, amount_refunded: 2000 }), 100);
});

test('partial captures include the uncaptured share and all refunds', () => {
  assert.equal(chargeRefundPercent({ amount: 2000, amount_captured: 1000, amount_refunded: 0 }), 50);
  assert.equal(chargeRefundPercent({ amount: 2000, amount_captured: 1000, amount_refunded: 500 }), 75);
  assert.equal(chargeRefundPercent({ amount: 2000, amount_captured: 1000, amount_refunded: 1000 }), 100);
});

test('released holds and missing totals count as fully returned', () => {
  assert.equal(chargeRefundPercent({ amount: 2000, amount_captured: 0, amount_refunded: 2000 }), 100);
  assert.equal(chargeRefundPercent({ amount_captured: 1000, amount_refunded: 1000 }), 100);
  assert.equal(chargeRefundPercent({ amount: 0, amount_captured: 0, amount_refunded: 0 }), 100);
});

test('near-full partial refunds never round up to 100%', () => {
  assert.equal(chargeRefundPercent({ amount: 2000, amount_captured: 2000, amount_refunded: 1995 }), 99);
});
