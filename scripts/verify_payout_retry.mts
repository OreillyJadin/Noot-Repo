// Exercise the real completion helper and local database with Stripe stubbed, never live.
// pnpm dlx tsx scripts/verify_payout_retry.mts
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { completeBooking } from '../supabase/functions/_shared/completeBooking.ts';
import { autoCompleteBookings } from '../supabase/functions/_shared/autoCompleteBookings.ts';
import { payoutStripe, payoutTestRuntime } from '../supabase/tests/payoutRetryFixtures.ts';
import { DEV_PASSWORD } from './_devPassword.mjs';

const URL = 'http://127.0.0.1:54321';
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });
const restore = payoutTestRuntime();
const users: string[] = [];
const bookings: string[] = [];
let passed = 0;
const check = (name: string, ok: boolean) => { assert(ok, name); passed++; console.log(`✅ ${name}`); };
async function run<T>(query: PromiseLike<{ data: T; error: unknown }>) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
async function user(role: 'student' | 'tutor') {
  const result = await svc.auth.admin.createUser({
    email: `payout-retry-${Date.now()}-${role}@crimson.ua.edu`, password: DEV_PASSWORD, email_confirm: true,
  });
  if (result.error) throw result.error;
  const id = result.data.user!.id;
  users.push(id);
  await run(svc.from('user_roles').upsert({ user_id: id, role }, { onConflict: 'user_id,role' }));
  return id;
}
const read = async (id: string) => await run(svc.from('bookings')
  .select('id,tutor_id,status,scheduled_at,duration_minutes,stripe_payment_intent_id,tutor_payout_amount,price,stripe_transfer_id,stripe_charge_id,payout_failed_at')
  .eq('id', id).single());
try {
  const student = await user('student');
  const tutor = await user('tutor');
  await run(svc.from('tutor_profiles').insert({ user_id: tutor, stripe_connect_account_id: 'acct_test' }));
  const row = await run(svc.from('bookings').insert({
    student_id: student, tutor_id: tutor, status: 'confirmed', subject: 'CS 100',
    scheduled_at: new Date(Date.now() - 4 * 3600_000).toISOString(), duration_minutes: 60,
    price: 20, platform_fee: 2, tutor_payout_amount: 18, session_type: 'in_person',
    stripe_payment_intent_id: 'pi_test_session',
    cancellation_deadline: new Date(Date.now() - 5 * 3600_000).toISOString(),
  }).select('id').single());
  bookings.push(row.id);
  const stripe = payoutStripe();
  stripe.control.failFunding = 'session_charge';
  const fail = await completeBooking(svc, URL, await read(row.id), stripe.stripe);
  let stored = await read(row.id);
  check('initial transfer failure returns payoutFailed', fail.status === 502 && fail.body.payoutFailed === true);
  check('captured booking is completed with a persistent failure marker', stored.status === 'completed' && !!stored.payout_failed_at && stored.stripe_charge_id === stripe.charge.id && stored.stripe_transfer_id === null);
  stripe.control.failFunding = '';
  const retry = await completeBooking(svc, URL, stored, stripe.stripe);
  stored = await read(row.id);
  check('retry pays tutor and clears persistent failure marker', retry.status === 200 && stored.payout_failed_at === null && stored.stripe_transfer_id === stripe.transfers[0].id);
  check('retry uses original transfer key and session charge', stripe.attempts.every(a => a.key === `transfer_${row.id}`) && stripe.transfers[0].source_transaction === stripe.charge.id);
  check('retry never captures a second time', stripe.control.captureCalls === 1);
  const attempts = stripe.attempts.length;
  const again = await completeBooking(svc, URL, stored, stripe.stripe);
  check('second retry is a no-op with exactly one transfer', again.body.alreadyComplete === true && stripe.transfers.length === 1 && stripe.attempts.length === attempts);

  let scheduledRetries = 0;
  let clock = new Date();
  const scheduled = () => autoCompleteBookings(svc, URL, async (db, url, booking) => {
    if (!bookings.includes(booking.id)) return { status: 409, body: { error: 'Unrelated local fixture skipped' } };
    scheduledRetries++;
    return completeBooking(db, url, booking, stripe.stripe);
  }, clock);
  await run(svc.from('bookings').update({ stripe_transfer_id: null }).eq('id', row.id));
  await scheduled();
  check('cron waits an hour after completion before retrying a missing payout', scheduledRetries === 0);
  clock = new Date(clock.getTime() + 2 * 3600_000);
  stripe.expireKeys();
  const recovered = await scheduled();
  check('cron dispatches completed bookings with missing transfer records', recovered.status === 200 && scheduledRetries === 1);
  check('missing database transfer record recovers after key expiry without paying again', (await read(row.id)).stripe_transfer_id === stripe.transfers[0].id && stripe.transfers.length === 1 && stripe.attempts.length === attempts);
  await run(svc.from('bookings').update({ payout_failed_at: clock.toISOString() }).eq('id', row.id));
  await scheduled();
  check('cron waits an hour after a marked failure', scheduledRetries === 1);
  clock = new Date(clock.getTime() + 2 * 3600_000);
  await scheduled();
  check('cron reconciles failure marker with an existing transfer safely', scheduledRetries === 2 && (await read(row.id)).payout_failed_at === null && stripe.transfers.length === 1);
  await scheduled();
  check('cron no longer selects a successfully paid session', scheduledRetries === 2);

  await run(svc.from('tutor_profiles').update({ stripe_connect_account_id: null }).eq('user_id', tutor));
  const failures = await run(svc.from('bookings').insert(Array.from({ length: 26 }, (_, i) => ({
    student_id: student, tutor_id: tutor, status: 'completed', subject: 'CS 100',
    scheduled_at: new Date(Date.now() - (i + 5) * 3600_000).toISOString(), duration_minutes: 60,
    price: 20, platform_fee: 2, tutor_payout_amount: 18, session_type: 'in_person',
    stripe_payment_intent_id: `pi_test_missing_connect_${i}`,
    cancellation_deadline: new Date(Date.now() - (i + 6) * 3600_000).toISOString(),
  }))).select('id'));
  bookings.push(...failures.map(b => b.id));
  await scheduled();
  check('permanently failing payouts are capped at 25 per batch', scheduledRetries === 27);
  const marked = await run(svc.from('bookings').select('payout_failed_at').in('id', failures.map(b => b.id)));
  check('missing Connect failures persist retry timestamps before throwing', marked.filter(b => Date.parse(b.payout_failed_at) === clock.getTime()).length === 25);
  await scheduled();
  check('failed batch backs off so the next waiting payout gets a turn', scheduledRetries === 28);
  await scheduled();
  check('permanently failing payouts cannot immediately reclaim the batch', scheduledRetries === 28);
  console.log(`\n${passed} passed, 0 failed`);
} finally {
  for (const id of bookings) await run(svc.from('bookings').delete().eq('id', id));
  for (const id of users.reverse()) {
    await run(svc.from('users').delete().eq('id', id));
    await svc.auth.admin.deleteUser(id);
  }
  restore();
}
