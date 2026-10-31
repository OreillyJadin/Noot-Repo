import { test } from 'node:test';
import assert from 'node:assert/strict';
import { disputeHoldsPayout } from '../functions/_shared/disputes.ts';
import { payTutor } from '../functions/_shared/payouts.ts';
import { reverseTutorTransfers } from '../functions/_shared/reversals.ts';
test('lost dispute reverses all remaining tutor share after a pre-payout refund', async () => {
  let amount = 0;
  const stripe = {
    charges: { retrieve: async () => ({ amount_captured: 2000 }) },
    refunds: { async *list() {} },
    transfers: {
      list: async () => ({ data: [{ id: 'tr', amount: 900, amount_reversed: 0, created: 1,
        metadata: { refund_baseline_cents: '1000' } }] }),
      listReversals: async () => ({ data: [] }),
      createReversal: async (_: string, params: { amount: number }) => { amount = params.amount; return { id: 'rev' }; },
    },
  } as unknown as Parameters<typeof reverseTutorTransfers>[0]['stripe'];
  await reverseTutorTransfers({ stripe, bookingId: 'booking', chargeId: 'ch', fallbackTransferId: null,
    dispute: { id: 'dp', amount: 1000 } });
  assert.equal(amount, 900);
});
test('open, lost, and unknown disputes hold payouts; won and closed inquiries release', () => {
  for (const status of ['needs_response', 'under_review', 'lost', 'warning_needs_response', 'unknown']) assert(disputeHoldsPayout(status));
  for (const status of ['won', 'warning_closed']) assert(!disputeHoldsPayout(status));
});
test('payout reads Stripe disputes and fails closed before creating any transfer', async () => {
  const stripe = { charges: { retrieve: async () => ({ id: 'ch' }) }, disputes: { async *list() { yield { id: 'dp_test', status: 'needs_response' }; } },
    transfers: { create() { assert.fail('must not pay during dispute'); } },
  } as unknown as Parameters<typeof payTutor>[0]['stripe'];
  const result = await payTutor({ stripe, bookingId: 'booking', destination: 'acct', payoutCents: 1800, originalPayoutCents: 1800,
    charge: { id: 'ch', amount: 2000, amount_captured: 2000, amount_refunded: 0 }, idempotencyKey: 'key', metadata: {} });
  assert.equal(result.complete, false);
  assert.equal(result.transferId, null);
  assert.match(String(result.error), /held for dispute/);
});
