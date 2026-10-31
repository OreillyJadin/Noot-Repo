import { test } from 'node:test';
import assert from 'node:assert/strict';
import { otherOutcomeTransferExists, type TransferReader } from '../functions/_shared/payouts.ts';

const bookingId = 'booking_test';
const ownReason = 'student_no_show';

function stripeWithTransfers(transfers: { metadata?: Record<string, string> | null }[]): TransferReader {
  return {
    transfers: {
      async *list(params) {
        assert.deepEqual(params, { transfer_group: bookingId, limit: 100 });
        for (const transfer of transfers) yield transfer;
      },
    },
  };
}

test('no transfers means no other outcome paid the tutor', async () => {
  assert.equal(await otherOutcomeTransferExists(stripeWithTransfers([]), bookingId, ownReason), false);
});

test('transfers with only this outcome reason are ignored', async () => {
  const stripe = stripeWithTransfers([
    { metadata: { reason: ownReason } },
    { metadata: { reason: ownReason } },
  ]);
  assert.equal(await otherOutcomeTransferExists(stripe, bookingId, ownReason), false);
});

test('a transfer without a reason belongs to another outcome', async () => {
  assert.equal(await otherOutcomeTransferExists(stripeWithTransfers([{}]), bookingId, ownReason), true);
});

test('a null reason treats every transfer as a conflict', async () => {
  const stripe = stripeWithTransfers([{ metadata: { reason: ownReason } }]);
  assert.equal(await otherOutcomeTransferExists(stripe, bookingId, null), true);
});

test('a transfer with a different reason belongs to another outcome', async () => {
  const stripe = stripeWithTransfers([
    { metadata: { reason: ownReason } },
    { metadata: { reason: 'late_cancel' } },
  ]);
  assert.equal(await otherOutcomeTransferExists(stripe, bookingId, ownReason), true);
});
