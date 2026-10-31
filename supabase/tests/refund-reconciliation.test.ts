import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settledRefundCents } from '../functions/_shared/refundReconciliation.ts';

test('only successful captured refunds count, not pending, failed, canceled or releases', () => {
  const refunds = ['succeeded', 'pending', 'failed', 'canceled'].map((status, i) => ({
    id: `re_${i}`, amount: 400, created: i, status,
    balance_transaction: status === 'succeeded' ? { reporting_category: 'refund' } : null,
  }));
  refunds.push({ id: 'release', amount: 1000, created: 5, status: 'succeeded',
    balance_transaction: { reporting_category: 'partial_capture_reversal' } });
  assert.equal(settledRefundCents(refunds, 2000), 400);
  assert.equal(settledRefundCents(refunds, 200), 200);
  refunds[0]!.status = 'failed';
  assert.equal(settledRefundCents(refunds, 2000), 0);
});
