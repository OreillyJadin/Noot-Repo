import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chargeAvailableCents, payTutor, splitPayoutFunding } from '../functions/_shared/payouts.ts';

test('charge funding excludes released authorization but includes captured refunds', () => {
  assert.equal(chargeAvailableCents(null), 0);
  for (const [amount, captured, refunded, expected] of [
    [3510, 1755, 1755, 1755],
    [4000, 2000, 2500, 1500],
    [4000, 2000, 4000, 0],
    [3276, 3276, 0, 3276],
    [3276, 3276, 500, 2776],
    [3276, 3276, 3276, 0],
    [3276, 0, 0, 0],
    [0, 0, 0, 0],
  ]) {
    assert.equal(chargeAvailableCents({ amount, amount_captured: captured, amount_refunded: refunded }), expected);
  }
  assert.deepEqual(splitPayoutFunding(2310, 100), { fromCharge: 100, fromBalance: 2210 });
});

test('late-cancel payout uses its partially captured charge, not the platform balance', async () => {
  const calls: unknown[] = [];
  const stripe = { transfers: { create: async (params: unknown) => {
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
