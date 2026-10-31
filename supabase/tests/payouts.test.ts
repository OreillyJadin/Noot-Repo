import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chargeAvailableCents, payTutor, splitPayoutFunding } from '../functions/_shared/payouts.ts';

test('charge funding excludes released authorization but includes captured refunds', () => {
  assert.equal(chargeAvailableCents(null, 0), 0);
  for (const [amount, captured, refunded, actualRefunds, expected] of [
    [3510, 1755, 1755, 0, 1755],
    [3510, 1755, 1000, 1000, 755],
    [3510, 1755, 2755, 1000, 755],
    [4000, 2000, 2500, 500, 1500],
    [4000, 2000, 500, 500, 1500],
    [4000, 2000, 4000, 2000, 0],
    [3276, 3276, 0, 0, 3276],
    [3276, 3276, 500, 500, 2776],
    [3276, 3276, 3276, 3276, 0],
    [3276, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
  ]) {
    assert.equal(chargeAvailableCents({ amount, amount_captured: captured, amount_refunded: refunded }, actualRefunds), expected);
  }
  assert.deepEqual(splitPayoutFunding(2310, 100), { fromCharge: 100, fromBalance: 2210 });
});

test('late-cancel payout uses its partially captured charge, not the platform balance', async () => {
  const calls: unknown[] = [];
  const stripe = { disputes: { async *list() {} }, refunds: { async *list() {
    yield { amount: 1755, status: 'succeeded', balance_transaction: { reporting_category: 'partial_capture_reversal' } };
  } }, transfers: { create: async (params: unknown) => {
    calls.push(params);
    return { id: 'tr_test' };
  } } } as unknown as Parameters<typeof payTutor>[0]['stripe'];
  const result = await payTutor({
    stripe, bookingId: 'booking', destination: 'acct_test', payoutCents: 1013,
    charge: { id: 'ch_test', amount: 3510, amount_captured: 1755, amount_refunded: 1755 },
    idempotencyKey: 'payout_test', metadata: {},
  });
  assert.deepEqual(result, { transferId: 'tr_test', complete: true, shortfallCents: 0, error: null });
  assert.deepEqual(calls, [{ currency: 'usd', destination: 'acct_test', transfer_group: 'booking',
    amount: 1013, source_transaction: 'ch_test',
    metadata: { funding: 'session_charge', charge_id: 'ch_test' },
  }]);
});

test('partial-capture payouts subtract actual refunds with or without a released-hold record', async () => {
  for (const includeRelease of [false, true]) {
    const calls: { amount: number; source_transaction?: string }[] = [];
    const stripe = { disputes: { async *list() {} }, refunds: { async *list() {
      if (includeRelease) yield { amount: 1755, status: 'succeeded', balance_transaction: { reporting_category: 'partial_capture_reversal' } };
      yield { amount: 1000, status: 'succeeded', balance_transaction: { reporting_category: 'refund' } };
    } }, transfers: { create: async (params: { amount: number; source_transaction?: string }) => {
      calls.push(params); return { id: 'tr_test' };
    } } } as unknown as Parameters<typeof payTutor>[0]['stripe'];
    const result = await payTutor({ stripe, bookingId: 'booking', destination: 'acct_test', payoutCents: 755,
      charge: { id: 'ch_test', amount: 3510, amount_captured: 1755, amount_refunded: includeRelease ? 2755 : 1000 },
      idempotencyKey: 'payout_test', metadata: {} });
    assert.equal(result.complete, true);
    assert.deepEqual(calls.map(({ amount, source_transaction }) => ({ amount, source_transaction })),
      [{ amount: 755, source_transaction: 'ch_test' }]);
  }
});

test('refund lookup failure records the full payout shortfall without transferring', async () => {
  const stripe = { disputes: { async *list() {} }, refunds: { list() { throw new Error('Stripe unavailable'); } },
    transfers: { create() { assert.fail('must not transfer without classified refunds'); } },
  } as unknown as Parameters<typeof payTutor>[0]['stripe'];
  const result = await payTutor({ stripe, bookingId: 'booking', destination: 'acct_test', payoutCents: 1013,
    charge: { id: 'ch_test', amount: 3510, amount_captured: 1755, amount_refunded: 1755 },
    idempotencyKey: 'payout_test', metadata: {} });
  assert.equal(result.complete, false);
  assert.equal(result.transferId, null);
  assert.equal(result.shortfallCents, 1013);
  assert.match(String(result.error), /Stripe unavailable/);
});
