import { test } from 'node:test';
import assert from 'node:assert/strict';
import { studentCancelRefundPercent } from '../src/cancellation.ts';
import { studentCancelRefundPercentWithLock } from '../../../supabase/functions/_shared/cancellation.ts';

test('client cancellation math mirrors the server at tier boundaries with every lock', () => {
  for (const hours of [-1, 0, 1.99, 2, 5, 11.99, 12, 48]) {
    for (const lock of [null, 0, 50] as const) {
      assert.equal(studentCancelRefundPercent(hours, lock), studentCancelRefundPercentWithLock(hours, lock));
    }
  }
});

test('no lock defaults to the time tier; invalid times never promise a refund', () => {
  assert.equal(studentCancelRefundPercent(48), 100);
  assert.equal(studentCancelRefundPercent(5), 50);
  assert.equal(studentCancelRefundPercent(1), 0);
  assert.equal(studentCancelRefundPercent(NaN), 0);
});

test('locked fees cannot be reduced by moving the session later', () => {
  assert.equal(studentCancelRefundPercent(48, 0), 0);
  assert.equal(studentCancelRefundPercent(48, 50), 50);
  assert.equal(studentCancelRefundPercent(1, 50), 0);
});
