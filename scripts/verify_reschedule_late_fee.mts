// Local stack + served Edge Functions + Stripe test key required.
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { DEV_PASSWORD } from './_devPassword.mjs';
import { bookingTime, createBookingTutor } from './_booking_test.mts';
import { cancelHold, createManualCaptureIntent, getPaymentIntent, stripeTestMode } from './_stripe_test.mts';
import { studentCancelRefundPercentWithLock } from '../supabase/functions/_shared/cancellation.ts';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
assert.ok(['127.0.0.1', 'localhost'].includes(new globalThis.URL(URL).hostname), 'local Supabase only');
assert.ok(stripeTestMode(), 'Stripe test key required');
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const db = createClient(URL, SERVICE, { auth: { persistSession: false } });
const bookings: string[] = [], intents: string[] = [];
let fixture: Awaited<ReturnType<typeof createBookingTutor>> | undefined;
let studentId = '';
let passed = 0, failed = 0;
async function check(name: string, run: () => Promise<void>) {
  try { await run(); passed++; console.log(`PASS: ${name}`); }
  catch (e) { failed++; console.error(`FAIL: ${name} — ${String(e)}`); }
}
async function login(email: string) {
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: DEV_PASSWORD });
  assert.ifError(error); assert.ok(data.session);
  return { client, id: data.user!.id, token: data.session.access_token };
}
async function call(fn: string, token: string, body: Record<string, unknown>) {
  const res = await fetch(`${URL}/functions/v1/${fn}`, {
    method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  assert.ok(res.ok, `HTTP ${res.status}: ${JSON.stringify(json)}`);
  return json;
}
async function row(id: string) {
  const { data, error } = await db.from('bookings').select('*').eq('id', id).single();
  assert.ifError(error); return data!;
}
async function booking(hours: number) {
  const pi = await createManualCaptureIntent(3000); intents.push(pi.id);
  const scheduledAt = bookingTime(hours);
  const { data, error } = await db.from('bookings').insert({
    student_id: studentId, tutor_id: fixture!.id, subject: fixture!.courseCode,
    scheduled_at: scheduledAt, duration_minutes: 60, price: 30, platform_fee: 5.25,
    tutor_payout_amount: 24.75, student_fee: 0, credit_applied: 0,
    session_type: 'in_person', location: 'Local verification', status: 'confirmed',
    cancellation_deadline: new Date(Date.parse(scheduledAt) - 12 * 3600_000).toISOString(),
    stripe_payment_intent_id: pi.id, hold_placed_at: new Date().toISOString(),
  }).select('id').single();
  assert.ifError(error); bookings.push(data!.id); return { id: data!.id as string, pi: pi.id };
}
try {
  fixture = await createBookingTutor(db, 'reschedule-fee');
  const email = `reschedule-student-${crypto.randomUUID()}@crimson.ua.edu`;
  const created = await db.auth.admin.createUser({ email, password: DEV_PASSWORD, email_confirm: true });
  assert.ifError(created.error); studentId = created.data.user!.id;
  const student = await login(email), tutor = await login(fixture.email);
  const accountsRes = await fetch('https://api.stripe.com/v1/accounts?limit=100', {
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
  });
  const accounts = await accountsRes.json();
  assert.ok(accountsRes.ok, accounts.error?.message);
  const account = accounts.data.find((a: { capabilities?: { transfers?: string }; payouts_enabled?: boolean }) =>
    a.capabilities?.transfers === 'active' && a.payouts_enabled);
  assert.ok(account, 'test connected account with transfers active required (as in verify_payout_source)');
  const profile = await db.from('tutor_profiles').update({ stripe_connect_account_id: account.id }).eq('user_id', tutor.id);
  assert.ifError(profile.error);

  for (const scenario of [
    { name: 'repro locks 0% refund and pays tutor', hours: 1, proposer: tutor, acceptor: student, proposeWaiver: false, acceptWaiver: false, lock: 0 },
    { name: 'tutor waiver on propose allows free cancel', hours: 1, proposer: tutor, acceptor: student, proposeWaiver: true, acceptWaiver: false, lock: null },
    { name: 'tutor waiver on accept allows free cancel', hours: 1, proposer: student, acceptor: tutor, proposeWaiver: false, acceptWaiver: true, lock: null },
    { name: 'student waiver on propose is ignored', hours: 1, proposer: student, acceptor: tutor, proposeWaiver: true, acceptWaiver: false, lock: 0 },
    { name: 'student waiver on accept is ignored', hours: 1, proposer: tutor, acceptor: student, proposeWaiver: false, acceptWaiver: true, lock: 0 },
    { name: 'early acceptance creates no lock', hours: 13, proposer: tutor, acceptor: student, proposeWaiver: false, acceptWaiver: false, lock: null },
    { name: 'middle tier locks 50% refund', hours: 5, proposer: tutor, acceptor: student, proposeWaiver: false, acceptWaiver: false, lock: 50 },
  ]) {
    await check(scenario.name, async () => {
      const b = await booking(scenario.hours);
      await call('reschedule-booking', scenario.proposer.token, { bookingId: b.id, action: 'propose', newScheduledAt: bookingTime(46), waiveLateFee: scenario.proposeWaiver });
      assert.equal((await row(b.id)).reschedule_waive_late_fee, scenario.proposer === tutor && scenario.proposeWaiver);
      const accepted = await call('reschedule-booking', scenario.acceptor.token, { bookingId: b.id, action: 'accept', waiveLateFee: scenario.acceptWaiver });
      assert.equal(accepted.lockedRefundPercent, scenario.lock);
      const moved = await row(b.id);
      assert.equal(moved.locked_refund_percent, scenario.lock);
      assert.equal(moved.reschedule_waive_late_fee, false);
      assert.equal(moved.reschedule_proposed_at, null);
      const cancelled = await call('cancel-booking', student.token, { bookingId: b.id });
      assert.equal(cancelled.refundPercent, scenario.lock ?? 100);
      const payment = await getPaymentIntent(b.pi);
      assert.equal(payment.amount_received, scenario.lock === null ? 0 : scenario.lock === 50 ? 1500 : 3000);
      const settled = await row(b.id);
      assert.equal(settled.refund_percent, scenario.lock ?? 100);
      if (scenario.lock !== null) {
        assert.ok(settled.stripe_transfer_id, 'late cancel transfer recorded');
        assert.equal(settled.payout_failed_at, null);
        const transferRes = await fetch(`https://api.stripe.com/v1/transfers/${settled.stripe_transfer_id}`, {
          headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
        });
        const transfer = await transferRes.json(); assert.ok(transferRes.ok);
        assert.equal(transfer.amount, scenario.lock === 0 ? 2475 : 1238);
        assert.equal(transfer.destination, account.id);
      }
    });
  }
  await check('new late tier wins over a 50% lock', async () => {
    assert.equal(studentCancelRefundPercentWithLock(1, 50), 0);
  });
  await check('decline clears tutor waiver; empty accept rejected', async () => {
    const b = await booking(1);
    await call('reschedule-booking', tutor.token, { bookingId: b.id, action: 'propose', newScheduledAt: bookingTime(36), waiveLateFee: true });
    await call('reschedule-booking', student.token, { bookingId: b.id, action: 'decline' });
    assert.equal((await row(b.id)).reschedule_waive_late_fee, false);
    await assert.rejects(call('reschedule-booking', student.token, { bookingId: b.id, action: 'accept' }), /409/);
    await db.from('bookings').delete().eq('id', b.id);
  });
  await check('student and tutor JWTs cannot write either lock column', async () => {
    const b = await booking(1);
    for (const actor of [student, tutor]) {
      const read = await actor.client.from('bookings').select('locked_refund_percent,reschedule_waive_late_fee').eq('id', b.id).single();
      assert.ifError(read.error); assert.ok(read.data);
      for (const patch of [{ locked_refund_percent: 0 }, { reschedule_waive_late_fee: true }]) {
        const write = await actor.client.from('bookings').update(patch).eq('id', b.id).select('id');
        assert.ok(write.error || write.data?.length === 0);
        const unchanged = await row(b.id);
        assert.equal(unchanged.locked_refund_percent, null);
        assert.equal(unchanged.reschedule_waive_late_fee, false);
      }
    }
  });
} catch (e) { failed++; console.error(`FAIL: fixture setup — ${String(e)}`); }
finally {
  if (bookings.length) {
    const cleanup = await db.from('bookings').delete().in('id', bookings); assert.ifError(cleanup.error);
  }
  for (const id of intents) {
    if ((await getPaymentIntent(id)).status === 'requires_capture') await cancelHold(id);
  }
  if (studentId) await db.auth.admin.deleteUser(studentId);
  await fixture?.cleanup();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
