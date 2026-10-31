import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capturedRefundCents, chargeRefundPercent, type RefundReader } from '../functions/_shared/refunds.ts';

test('full-capture refunds use cumulative refunded charge totals', () => {
  for (const [refunded, expected] of [[500, 25], [1000, 50], [2000, 100]]) {
    assert.equal(chargeRefundPercent({ amount: 2000, amount_captured: 2000 }, refunded), expected);
  }
});

test('partial captures include the uncaptured share and only refunds of captured funds', () => {
  for (const [refunded, expected] of [[0, 50], [500, 75], [1000, 100]]) {
    assert.equal(chargeRefundPercent({ amount: 2000, amount_captured: 1000 }, refunded), expected);
  }
  for (const amount_refunded of [1000, 2755]) {
    assert.equal(chargeRefundPercent({ amount: 3510, amount_captured: 1755, amount_refunded }, 1000), 78);
  }
});

test('released holds and missing totals count as fully returned', () => {
  assert.equal(chargeRefundPercent({ amount: 2000, amount_captured: 0 }, 0), 100);
  assert.equal(chargeRefundPercent({ amount_captured: 1000 }, 1000), 100);
  assert.equal(chargeRefundPercent({ amount: 0, amount_captured: 0 }, 0), 100);
});

test('near-full partial refunds never round up to 100%', () => {
  assert.equal(chargeRefundPercent({ amount: 2000, amount_captured: 2000 }, 1995), 99);
  assert.equal(chargeRefundPercent({ amount: 2000, amount_captured: 1000 }, 5000), 100);
});

test('reads all refunds and excludes released holds and failed refunds in either Stripe shape', async () => {
  for (const includeRelease of [false, true]) {
    const stripe: RefundReader = { refunds: { async *list(params) {
      assert.deepEqual(params, { charge: 'ch_test', limit: 100, expand: ['data.balance_transaction'] });
      if (includeRelease) yield { amount: 1755, status: 'succeeded', balance_transaction: { reporting_category: 'partial_capture_reversal' } };
      yield { amount: 750, status: 'succeeded', balance_transaction: { reporting_category: 'refund' } };
      yield { amount: 250, status: 'pending', balance_transaction: null };
      yield { amount: 100, status: 'failed' };
      yield { amount: 100, status: 'canceled' };
    } } };
    const charge = { id: 'ch_test', amount: 3510, amount_captured: 1755, amount_refunded: includeRelease ? 2755 : 1000 };
    const refunded = await capturedRefundCents(stripe, charge);
    assert.equal(refunded, 1000);
    assert.equal(chargeRefundPercent(charge, refunded), 78);
  }
});

test('full captures and uncaptured holds need no ambiguous refund lookup', async () => {
  const stripe: RefundReader = { refunds: { list() { throw new Error('unexpected lookup'); } } };
  assert.equal(await capturedRefundCents(stripe, { id: 'ch_full', amount: 3510, amount_captured: 3510, amount_refunded: 1000 }), 1000);
  assert.equal(await capturedRefundCents(stripe, { id: 'ch_hold', amount: 3510, amount_captured: 0, amount_refunded: 3510 }), 0);
});

test('missing expanded balance data and lookup failures propagate for safe retries', async () => {
  const charge = { id: 'ch_test', amount: 3510, amount_captured: 1755, amount_refunded: 1000 };
  const missing: RefundReader = { refunds: { async *list() { yield { amount: 1000, status: 'succeeded', balance_transaction: 'txn_unexpanded' }; } } };
  await assert.rejects(capturedRefundCents(missing, charge), /balance transaction missing/);
  const failed: RefundReader = { refunds: { list() { throw new Error('Stripe unavailable'); } } };
  await assert.rejects(capturedRefundCents(failed, charge), /Stripe unavailable/);
});
