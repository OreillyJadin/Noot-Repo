import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  planReversals,
  reversalShares,
  reverseTutorTransfers,
  stripeSideRefunds,
  type RefundLike,
  type TransferLike,
} from '../functions/_shared/reversals.ts';

const refund = (
  id: string,
  amount: number,
  created = 1,
  status: string | null = 'succeeded',
  balance_transaction: RefundLike['balance_transaction'] = { reporting_category: 'refund' },
): RefundLike => ({ id, amount, created, status, balance_transaction });

test('stripe-side refunds exclude released authorizations and keep later refunds', () => {
  const refunds = stripeSideRefunds([
    refund('refund-later', 875, 2),
    refund('released-authorization', 1750, 1, 'succeeded', { reporting_category: 'partial_capture_reversal' }),
  ]);
  assert.deepEqual(refunds.map((item) => item.id), ['refund-later']);
});

test('succeeded refunds require expanded balance transaction data', () => {
  assert.throws(
    () => stripeSideRefunds([refund('missing-balance', 500, 1, 'succeeded', 'txn_unexpanded')]),
    /balance transaction missing/,
  );
});

test('full-capture refunds are retained, failed and canceled refunds dropped, and results sorted', () => {
  const refunds = stripeSideRefunds([
    refund('later', 300, 3),
    refund('same-time-b', 200, 2, 'pending'),
    refund('failed', 100, 1, 'failed'),
    refund('same-time-a', 100, 2),
    refund('canceled', 100, 4, 'canceled'),
  ]);
  assert.deepEqual(refunds.map((item) => item.id), ['same-time-a', 'same-time-b', 'later']);
});

test('refund shares use cumulative rounding without drift', () => {
  const shares = reversalShares([
    refund('r1', 1000, 1),
    refund('r2', 500, 2),
    refund('r3', 2000, 3),
  ], 3500, 3000);
  assert.deepEqual(shares, [
    { refundId: 'r1', cents: 857 },
    { refundId: 'r2', cents: 429 },
    { refundId: 'r3', cents: 1714 },
  ]);
  assert.equal(shares.reduce((sum, share) => sum + share.cents, 0), 3000);
});

test('refund shares cap at captured cents and handle a partial-capture late cancel', () => {
  const capped = reversalShares([
    refund('r1', 3000, 1),
    refund('r2', 1000, 2),
    refund('r3', 500, 3),
  ], 3500, 3000);
  assert.equal(capped.reduce((sum, share) => sum + share.cents, 0), 3000);
  assert.deepEqual(reversalShares([refund('late-cancel', 875)], 1750, 1500), [
    { refundId: 'late-cancel', cents: 750 },
  ]);
  assert.deepEqual(reversalShares([refund('no-capture', 100)], 0, 1500), []);
  assert.deepEqual(reversalShares([refund('no-transfer', 100)], 100, 0), []);
});

test('reversal plans skip completed refunds and top up partially completed refunds', () => {
  const transfers: TransferLike[] = [
    {
      id: 'tr1', amount: 500, amount_reversed: 300, created: 1,
      reversals: [{ amount: 300, metadata: { refund_id: 'done' } }],
    },
    { id: 'tr2', amount: 1000, amount_reversed: 0, created: 2, reversals: [] },
  ];
  assert.deepEqual(planReversals([{ refundId: 'done', cents: 300 }], transfers), []);
  assert.deepEqual(planReversals([{ refundId: 'partial', cents: 800 }], transfers), [
    { refundId: 'partial', transferId: 'tr1', cents: 200 },
    { refundId: 'partial', transferId: 'tr2', cents: 600 },
  ]);
});

test('reversal plans spread a full refund across charge-funded and balance transfers', () => {
  assert.deepEqual(planReversals([{ refundId: 'full', cents: 3000 }], [
    { id: 'charge', amount: 1000, amount_reversed: 0, created: 1, reversals: [] },
    { id: 'balance', amount: 2000, amount_reversed: 0, created: 2, reversals: [] },
  ]), [
    { refundId: 'full', transferId: 'charge', cents: 1000 },
    { refundId: 'full', transferId: 'balance', cents: 2000 },
  ]);
});

test('manual reversals without refund metadata cap plans at the remaining amount', () => {
  const transfers: TransferLike[] = [
    {
      id: 'partly-manual', amount: 1000, amount_reversed: 400, created: 1,
      reversals: [{ amount: 400 }],
    },
    {
      id: 'fully-manual', amount: 1000, amount_reversed: 1000, created: 2,
      reversals: [{ amount: 1000 }],
    },
  ];
  assert.deepEqual(planReversals([{ refundId: 'refund', cents: 800 }], transfers), [
    { refundId: 'refund', transferId: 'partly-manual', cents: 600 },
  ]);
  assert.deepEqual(planReversals([{ refundId: 'refund', cents: 800 }], [transfers[1]!]), []);
});

test('orchestrator retains failed attempts, continues, and skips recorded refund reversals on retry', async () => {
  const state: Array<TransferLike & { id: string }> = [
    { id: 'tr-charge', amount: 500, amount_reversed: 0, created: 1, reversals: [] },
    { id: 'tr-balance', amount: 1000, amount_reversed: 0, created: 2, reversals: [] },
  ];
  const calls: Array<{ id: string; params: { amount: number; metadata: Record<string, string> }; options: { idempotencyKey: string } }> = [];
  const stripe = {
    charges: { retrieve: async () => ({ id: 'ch_test', amount_captured: 3500 }) },
    refunds: { async *list() {
      yield refund('re_test', 2000, 1);
    } },
    transfers: {
      list: async () => ({ data: state }),
      retrieve: async (id: string) => state.find((transfer) => transfer.id === id)!,
      listReversals: async (id: string) => ({ data: state.find((transfer) => transfer.id === id)!.reversals }),
      createReversal: async (
        id: string,
        params: { amount: number; metadata: Record<string, string> },
        options: { idempotencyKey: string },
      ) => {
        calls.push({ id, params, options });
        if (id === 'tr-charge') {
          throw Object.assign(new Error('insufficient funds'), { code: 'balance_insufficient' });
        }
        const transfer = state.find((item) => item.id === id)!;
        const reversal = { amount: params.amount, metadata: params.metadata };
        transfer.reversals.push(reversal);
        transfer.amount_reversed += params.amount;
        return { id: 'trr_balance' };
      },
    },
  } as unknown as Parameters<typeof reverseTutorTransfers>[0]['stripe'];

  const attempts = await reverseTutorTransfers({
    stripe, bookingId: 'booking', chargeId: 'ch_test', fallbackTransferId: null,
  });
  assert.equal(attempts.length, 2);
  assert.match(attempts[0]!.error ?? '', /balance_insufficient: insufficient funds/);
  assert.equal(attempts[1]!.error, null);
  assert.equal(attempts[1]!.reversalId, 'trr_balance');
  assert.deepEqual(calls.map((call) => call.options.idempotencyKey), [
    'reversal_re_test_tr-charge',
    'reversal_re_test_tr-balance',
  ]);
  assert.ok(calls.every((call) => call.params.metadata.refund_id === 're_test'));

  const firstTransfer = state[0]!;
  firstTransfer.amount_reversed = 500;
  firstTransfer.reversals.push({ amount: 500, metadata: { refund_id: 're_test' } });
  const callCount = calls.length;
  assert.deepEqual(await reverseTutorTransfers({
    stripe, bookingId: 'booking', chargeId: 'ch_test', fallbackTransferId: null,
  }), []);
  assert.equal(calls.length, callCount);
});

test('orchestrator propagates Stripe read failures', async () => {
  const stripe = {
    charges: { retrieve: async () => ({ id: 'ch_test', amount_captured: 1000 }) },
    refunds: { list: () => { throw new Error('Stripe refunds unavailable'); } },
  } as unknown as Parameters<typeof reverseTutorTransfers>[0]['stripe'];
  await assert.rejects(reverseTutorTransfers({
    stripe, bookingId: 'booking', chargeId: 'ch_test', fallbackTransferId: null,
  }), /Stripe refunds unavailable/);
});
