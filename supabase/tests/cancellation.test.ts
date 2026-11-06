// Run: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cancellationDeadlineFor,
  lateCancelTutorPayoutCents,
  studentCancelRefundPercent,
  lockedRefundPercentOnAccept,
  studentCancelRefundPercentWithLock,
} from '../functions/_shared/cancellation.ts';

test('student cancellation refunds use the 12h and 2h cutoffs', () => {
  assert.equal(studentCancelRefundPercent(12), 100);
  assert.equal(studentCancelRefundPercent(11.99), 50);
  assert.equal(studentCancelRefundPercent(2), 50);
  assert.equal(studentCancelRefundPercent(1.99), 0);
  assert.equal(studentCancelRefundPercent(-1), 0);
  assert.equal(studentCancelRefundPercent(48), 100);
});

test('accepted reschedules preserve the strictest original fee unless waived', () => {
  const now = Date.parse('2026-09-25T12:00:00Z');
  const at = (hours: number) => new Date(now + hours * 3600_000).toISOString();
  assert.equal(lockedRefundPercentOnAccept(at(1), now, null, false), 0);
  assert.equal(lockedRefundPercentOnAccept(at(5), now, null, false), 50);
  assert.equal(lockedRefundPercentOnAccept(at(12), now, null, false), null);
  assert.equal(lockedRefundPercentOnAccept(at(48), now, 0, false), 0);
  assert.equal(lockedRefundPercentOnAccept(at(1), now, 50, false), 0);
  assert.equal(lockedRefundPercentOnAccept(at(1), now, 0, true), null);
  assert.equal(lockedRefundPercentOnAccept(at(-1), now, null, false), 0);
});

test('cancellation uses the stricter of the new time and the locked refund cap', () => {
  assert.equal(studentCancelRefundPercentWithLock(48, null), 100);
  assert.equal(studentCancelRefundPercentWithLock(48, 0), 0);
  assert.equal(studentCancelRefundPercentWithLock(48, 50), 50);
  assert.equal(studentCancelRefundPercentWithLock(1, 50), 0);
  assert.equal(studentCancelRefundPercentWithLock(5, null), 50);
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
