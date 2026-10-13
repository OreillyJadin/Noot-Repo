// Run: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cancellationDeadlineFor,
  lateCancelTutorPayoutCents,
  studentCancelRefundPercent,
} from '../functions/_shared/cancellation.ts';

test('student cancellation refunds use the 12h and 2h cutoffs', () => {
  assert.equal(studentCancelRefundPercent(12), 100);
  assert.equal(studentCancelRefundPercent(11.99), 50);
  assert.equal(studentCancelRefundPercent(2), 50);
  assert.equal(studentCancelRefundPercent(1.99), 0);
  assert.equal(studentCancelRefundPercent(-1), 0);
  assert.equal(studentCancelRefundPercent(48), 100);
});

test('late cancellation payout is the non-refunded share of the stored tutor payout', () => {
  assert.equal(lateCancelTutorPayoutCents(41.25, 50), 2063);
  assert.equal(lateCancelTutorPayoutCents(41.25, 0), 4125);
  assert.equal(lateCancelTutorPayoutCents(41.25, 100), 0);
  assert.equal(lateCancelTutorPayoutCents(33, 50), 1650);
});

test('cancellation deadline is 12 hours before the scheduled start', () => {
  const scheduledAt = new Date('2026-09-25T18:30:00.000Z');
  assert.equal(
    cancellationDeadlineFor(scheduledAt).toISOString(),
    '2026-09-25T06:30:00.000Z',
  );
});
