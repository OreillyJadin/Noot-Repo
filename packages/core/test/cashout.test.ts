import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapCashout } from '../src/cashout.ts';

test('mapCashout maps payment progress and a shortened transfer reference', () => {
  const row = {
    id: 'cashout-1',
    amount_cents: 1500,
    status: 'pending',
    created_at: '2026-11-05T00:00:00.000Z',
    paid_at: null,
    rejected_at: null,
    paying_at: '2026-11-05T01:00:00.000Z',
    pay_unknown_at: '2026-11-05T02:00:00.000Z',
    stripe_transfer_id: 'tr_abcdefgh12345678',
  };
  assert.deepEqual(mapCashout(row), {
    id: 'cashout-1',
    amountCents: 1500,
    status: 'pending',
    createdAt: '2026-11-05T00:00:00.000Z',
    paidAt: null,
    rejectedAt: null,
    payingAt: '2026-11-05T01:00:00.000Z',
    payUnknownAt: '2026-11-05T02:00:00.000Z',
    transferRef: '12345678',
  });
  const unknown = mapCashout({ ...row, paying_at: null });
  assert.equal(unknown.payingAt, null);
  assert.equal(unknown.payUnknownAt, row.pay_unknown_at);
  assert.equal(mapCashout({ ...row, stripe_transfer_id: null }).transferRef, null);
});
