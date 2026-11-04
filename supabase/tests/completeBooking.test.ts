import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { completeBooking } from '../functions/_shared/completeBooking.ts';
import { payoutDb, payoutStripe, payoutTestRuntime } from './payoutRetryFixtures.ts';

const restore = payoutTestRuntime();
after(restore);
const url = 'http://127.0.0.1:54321';

test('complete-session records transfer failure, retries successfully, then becomes a no-op', async () => {
  const { db, booking } = payoutDb();
  const fake = payoutStripe();
  fake.control.failFunding = 'session_charge';
  const failed = await completeBooking(db, url, { ...booking }, fake.stripe);
  assert.equal(failed.status, 502);
  assert.equal(failed.body.payoutFailed, true);
  assert.equal(booking.status, 'completed');
  assert(booking.payout_failed_at);
  assert.equal(booking.stripe_charge_id, fake.charge.id);
  assert.equal(booking.stripe_transfer_id, null);
  fake.control.failFunding = '';
  const retry = await completeBooking(db, url, { ...booking }, fake.stripe);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.captured, false);
  assert.equal(booking.payout_failed_at, null);
  assert.equal(booking.stripe_transfer_id, fake.transfers[0].id);
  assert.deepEqual(fake.attempts.map(a => a.key), ['transfer_booking_test', 'transfer_booking_test']);
  assert.equal(fake.transfers[0].source_transaction, fake.charge.id);
  assert.equal(fake.transfers[0].amount, 1800);
  const again = await completeBooking(db, url, { ...booking }, fake.stripe);
  assert.equal(again.body.alreadyComplete, true);
  assert.equal(fake.attempts.length, 2);
  assert.equal(fake.transfers.length, 1);
  assert.equal(fake.control.captureCalls, 1);
});

test('completed session with no failure marker and no transfer retries without recapturing', async () => {
  const { db, booking } = payoutDb();
  booking.status = 'completed';
  const fake = payoutStripe(2000, true);
  assert.equal((await completeBooking(db, url, { ...booking }, fake.stripe)).status, 200);
  assert.equal(fake.transfers.length, 1);
  assert.equal(fake.control.captureCalls, 0);
});

test('split-credit retry only pays the missing balance half, even after Stripe forgets keys', async () => {
  const { db, booking } = payoutDb();
  const fake = payoutStripe(100);
  fake.control.failFunding = 'platform_balance';
  assert.equal((await completeBooking(db, url, { ...booking }, fake.stripe)).status, 502);
  assert.equal(fake.transfers.length, 1);
  assert.equal(booking.stripe_transfer_id, fake.transfers[0].id);
  fake.expireKeys();
  fake.control.failFunding = '';
  assert.equal((await completeBooking(db, url, { ...booking }, fake.stripe)).status, 200);
  assert.deepEqual(fake.transfers.map(t => t.amount), [100, 1700]);
  assert.equal(fake.attempts.filter(a => a.key === 'transfer_booking_test').length, 1);
  assert.equal(fake.attempts.at(-1)!.key, 'transfer_booking_test_balance');
  assert.equal(fake.transfers[0].source_transaction, fake.charge.id);
  assert.equal(fake.transfers[1].source_transaction, null);
});

test('lost Stripe response is reconciled from durable transfers after key expiry', async () => {
  const { db, booking } = payoutDb();
  const fake = payoutStripe();
  fake.control.loseResponse = true;
  assert.equal((await completeBooking(db, url, { ...booking }, fake.stripe)).status, 502);
  assert.equal(booking.stripe_transfer_id, null);
  fake.expireKeys();
  assert.equal((await completeBooking(db, url, { ...booking }, fake.stripe)).status, 200);
  assert.equal(fake.transfers.length, 1);
  assert.equal(fake.attempts.length, 1);
});

test('database write failure after payout recovers without recapture or duplicate transfer', async () => {
  const { db, booking, control } = payoutDb();
  const fake = payoutStripe();
  control.failWrite = true;
  await assert.rejects(completeBooking(db, url, { ...booking }, fake.stripe), /database failure/);
  assert.equal(booking.status, 'confirmed');
  fake.expireKeys();
  assert.equal((await completeBooking(db, url, { ...booking }, fake.stripe)).status, 200);
  assert.equal(fake.transfers.length, 1);
  assert.equal(fake.control.captureCalls, 1);
});

test('simulated and free completed sessions remain no-ops', async () => {
  for (const patch of [{ price: 0 }, { stripe_payment_intent_id: 'sim_pi_test' }]) {
    const { db, booking } = payoutDb();
    Object.assign(booking, { status: 'completed' }, patch);
    const fake = payoutStripe();
    assert.equal((await completeBooking(db, url, booking, fake.stripe)).body.alreadyComplete, true);
    assert.equal(fake.attempts.length, 0);
  }
});

test('a completed but uncaptured payment is never captured or paid by a retry', async () => {
  const { db, booking } = payoutDb();
  booking.status = 'completed';
  const fake = payoutStripe();
  assert.equal((await completeBooking(db, url, booking, fake.stripe)).status, 409);
  assert.equal(fake.control.captureCalls, 0);
  assert.equal(fake.attempts.length, 0);
});

test('retry still honors Stripe dispute holds and clears the flag only on success', async () => {
  const { db, booking } = payoutDb();
  booking.status = 'completed';
  const fake = payoutStripe(2000, true);
  fake.control.dispute = true;
  assert.equal((await completeBooking(db, url, { ...booking }, fake.stripe)).status, 502);
  assert(booking.payout_failed_at);
  assert.equal(fake.transfers.length, 0);
  fake.control.dispute = false;
  assert.equal((await completeBooking(db, url, { ...booking }, fake.stripe)).status, 200);
  assert.equal(booking.payout_failed_at, null);
});

test('concurrent completed-session retries share the same transfer idempotency key', async () => {
  const { db, booking } = payoutDb();
  booking.status = 'completed';
  const fake = payoutStripe(2000, true);
  const results = await Promise.all([
    completeBooking(db, url, { ...booking }, fake.stripe), completeBooking(db, url, { ...booking }, fake.stripe),
  ]);
  assert(results.every(r => r.status === 200));
  assert.equal(fake.transfers.length, 1);
  assert(fake.attempts.every(a => a.key === 'transfer_booking_test'));
});

test('a reversed completed-session transfer is not paid again after key expiry', async () => {
  const { db, booking } = payoutDb();
  const fake = payoutStripe();
  await completeBooking(db, url, { ...booking }, fake.stripe);
  fake.transfers[0].reversed = true;
  booking.payout_failed_at = new Date().toISOString();
  fake.expireKeys();
  assert.equal((await completeBooking(db, url, { ...booking }, fake.stripe)).status, 200);
  assert.equal(fake.transfers.length, 1);
  assert.equal(fake.attempts.length, 1);
});

test('a conflicting destination or booking outcome fails closed without another payout', async () => {
  for (const patch of [{ destination: 'acct_other' }, { metadata: { reason: 'student_no_show' } }]) {
    const { db, booking } = payoutDb();
    const fake = payoutStripe();
    await completeBooking(db, url, { ...booking }, fake.stripe);
    Object.assign(fake.transfers[0], patch);
    booking.payout_failed_at = new Date().toISOString();
    fake.expireKeys();
    assert.equal((await completeBooking(db, url, { ...booking }, fake.stripe)).status, 502);
    assert.equal(fake.transfers.length, 1);
    assert.equal(fake.attempts.length, 1);
    assert(booking.payout_failed_at);
  }
});
