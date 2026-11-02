// Default: schema/RLS/cron checks (CI has no function server).
// ER010_INTEGRATION=real: serve with test Stripe + webhook env; exercises real card flows.
// ER010_INTEGRATION=simulated: serve without Stripe; exercises the same local QA paths.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { DEV_PASSWORD } from './_devPassword.mjs';
import { bookingTime, createBookingTutor } from './_booking_test.mts';

const URL = 'http://127.0.0.1:54321';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const db = createClient(URL, serviceKey, { auth: { persistSession: false } });
const mode = process.env.ER010_INTEGRATION;
const real = mode === 'real';
const key = process.env.STRIPE_SECRET_KEY ?? '';
if (real) assert(key.startsWith('sk_test_'), 'Real integration requires sk_test_');
if (mode) assert(['real', 'simulated'].includes(mode), 'Invalid integration mode');
const users: string[] = [];
const bookings: string[] = [];
const holds = new Set<string>();
let tutor: Awaited<ReturnType<typeof createBookingTutor>> | undefined;
let count = 0;
function check(name: string, ok: unknown) {
  assert(ok, name);
  console.log('PASS ' + name);
  count++;
}
async function user() {
  const email = `deferred-${crypto.randomUUID()}@crimson.ua.edu`;
  const { data, error } = await db.auth.admin.createUser({ email, password: DEV_PASSWORD, email_confirm: true });
  if (error) throw error;
  const id = data.user!.id;
  users.push(id);
  const { error: profileError } = await db.from('users').update({ date_of_birth: '2000-01-15', first_name: 'Deferred' }).eq('id', id);
  if (profileError) throw profileError;
  return { id, ...(await login(email)) };
}
async function login(email: string) {
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: DEV_PASSWORD });
  if (error) throw error;
  return { client, token: data.session!.access_token };
}
async function call(name: string, token: string, body: unknown = {}) {
  const response = await fetch(`${URL}/functions/v1/${name}`, {
    method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}
async function stripe(path: string, body?: Record<string, string>) {
  assert(real && key.startsWith('sk_test_'));
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    ...(body ? { body: new URLSearchParams(body) } : {}),
  });
  const result = await response.json();
  assert(response.ok, `Stripe test request failed: ${result.error?.code ?? response.status}`);
  return result;
}
async function row(id: string) {
  const { data, error } = await db.from('bookings').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}
async function patch(id: string, values: Record<string, unknown>) {
  const { error } = await db.from('bookings').update(values).eq('id', id);
  if (error) throw error;
}

try {
  const student = await user();
  const stranger = await user();
  tutor = await createBookingTutor(db, 'deferred-tutor');
  const tutorAuth = await login(tutor.email);
  const fixture = {
    student_id: student.id, tutor_id: tutor.id, subject: tutor.courseCode, scheduled_at: bookingTime(240),
    duration_minutes: 60, price: 30, student_fee: 3, platform_fee: 6, tutor_payout_amount: 24,
    cancellation_deadline: bookingTime(228),
    status: 'confirmed', session_type: 'in_person', stripe_setup_intent_id: 'sim_seti_' + crypto.randomUUID(),
  };
  const { data: seed, error: seedError } = await db.from('bookings').insert(fixture).select('id').single();
  if (seedError) throw seedError;
  bookings.push(seed.id);
  const original = await row(seed.id);
  const cron = execFileSync('docker', ['exec', 'supabase_db_noot', 'psql', '-U', 'postgres', '-Atc',
    "select schedule from cron.job where jobname = 'place-booking-holds'"], { encoding: 'utf8' }).trim();
  check('five-minute hold cron is registered', cron === '*/5 * * * *');
  check('deferred schema stores setup with no PI and a 48h due time', !original.stripe_payment_intent_id &&
    new Date(original.scheduled_at).getTime() - new Date(original.hold_due_at).getTime() === 48 * 3600000);
  for (const [role, client] of [['student', student.client], ['tutor', tutorAuth.client]] as const) {
    const values = {
      stripe_setup_intent_id: 'tampered', stripe_payment_method_id: 'pm_tampered',
      hold_due_at: new Date().toISOString(), hold_placed_at: new Date().toISOString(),
      hold_failed_at: new Date().toISOString(), hold_failure_code: 'tampered',
    };
    await client.from('bookings').update(values).eq('id', seed.id);
    const after = await row(seed.id);
    check(`${role} cannot write any new hold column`, Object.keys(values).every((k) => after[k] === original[k]));
    const { data, error } = await client.from('bookings').select('hold_failed_at, stripe_setup_intent_id').eq('id', seed.id).single();
    check(`${role} can read hold state`, !error && data?.stripe_setup_intent_id === fixture.stripe_setup_intent_id);
    const { error: expiryError } = await client.rpc('expire_unfunded_bookings');
    check(`${role} cannot run payment expiry`, !!expiryError);
  }
  const { data: privateRows } = await stranger.client.from('bookings').select('id').eq('id', seed.id);
  check('non-party cannot read deferred booking', privateRows?.length === 0);
  await db.from('bookings').delete().eq('id', seed.id);

  if (!mode) {
    console.log('SKIP function/Stripe integration: set ER010_INTEGRATION=real or simulated.');
  } else {
    const base = (hours: number) => ({
      tutorId: tutor!.id, courseCode: tutor!.courseCode, durationMinutes: 60,
      scheduledAt: bookingTime(hours), sessionType: 'in_person',
    });
    async function deferred(hours: number, card = 'pm_card_visa') {
      const args = base(hours);
      const created = await call('create-payment-intent', student.token, args);
      assert.equal(created.status, 200, created.body.error);
      check('10+ day checkout returns SetupIntent without PaymentIntent', created.body.deferred &&
        !created.body.paymentIntentId && !!created.body.setupIntentId && created.body.simulated === !real);
      if (real) {
        const list = await stripe(`payment_intents?customer=${created.body.customerId}&limit=100`);
        check('deferred checkout creates no Stripe PI', !list.data.some((pi: { metadata: Record<string, string> }) => pi.metadata.scheduled_at === args.scheduledAt));
        const setup = await stripe(`setup_intents/${created.body.setupIntentId}/confirm`, { payment_method: card });
        assert.equal(setup.status, 'succeeded');
      }
      const confirmed = await call('confirm-booking', student.token, { ...args, setupIntentId: created.body.setupIntentId });
      assert.equal(confirmed.status, 200, confirmed.body.error);
      bookings.push(confirmed.body.bookingId);
      return { id: confirmed.body.bookingId as string, created: created.body, args };
    }
    const work = () => call('place-booking-holds', serviceKey);
    check('hold worker refuses an end-user', (await call('place-booking-holds', student.token)).status === 401);
    await db.from('credit_ledger').insert({ user_id: student.id, amount_cents: 500, kind: 'adjustment' });
    const first = await deferred(240);
    const saved = await row(first.id);
    check('confirmation saves setup/credit but no card payment', saved.stripe_setup_intent_id === first.created.setupIntentId &&
      !saved.stripe_payment_intent_id && Number(saved.credit_applied) === 5);
    const duplicate = await call('confirm-booking', student.token, { ...first.args, setupIntentId: first.created.setupIntentId });
    check('same SetupIntent cannot book twice', duplicate.status === 409);
    await patch(first.id, { hold_due_at: new Date(Date.now() - 60000).toISOString() });
    assert.equal((await work()).status, 200);
    const held = await row(first.id);
    holds.add(held.stripe_payment_intent_id);
    check('due worker stores payment and placement time', !!held.stripe_payment_intent_id && !!held.hold_placed_at);
    if (real) {
      const pi = await stripe(`payment_intents/${held.stripe_payment_intent_id}`);
      check('real deferred PI is requires_capture for exact credited total', pi.status === 'requires_capture' &&
        pi.amount === first.created.chargeCents && pi.metadata.booking_id === first.id && pi.amount_received === 0);
    }
    await work();
    check('repeated worker keeps the same hold', (await row(first.id)).stripe_payment_intent_id === held.stripe_payment_intent_id);

    const broken = await deferred(244, 'pm_card_chargeCustomerFail');
    await patch(broken.id, { hold_due_at: new Date(Date.now() - 60000).toISOString() });
    if (!real) await db.rpc('fail_booking_hold', { p_booking: broken.id, p_scheduled_at: broken.args.scheduledAt, p_code: 'card_declined' });
    await work();
    const failed = await row(broken.id);
    check('failing saved card marks hold_failed_at without a PI', !!failed.hold_failed_at && !failed.stripe_payment_intent_id && !!failed.hold_failure_code);
    const { data: notifications } = await db.from('notifications').select('id')
      .eq('user_id', student.id).eq('title', 'Update your payment method').contains('data', { bookingId: broken.id });
    check('failure sends student notification', notifications?.length === 1);
    await work();
    const { data: again } = await db.from('notifications').select('id')
      .eq('user_id', student.id).eq('title', 'Update your payment method').contains('data', { bookingId: broken.id });
    check('failed hold is not automatically retried/notified twice', (await row(broken.id)).hold_failed_at === failed.hold_failed_at && again?.length === 1);
    check('tutor cannot repair student payment', (await call('booking-hold', tutorAuth.token, { bookingId: broken.id, action: 'create' })).status === 403);
    const repair = await call('booking-hold', student.token, { bookingId: broken.id, action: 'create' });
    assert.equal(repair.status, 200, repair.body.error);
    holds.add(repair.body.paymentIntentId);
    check('repair refuses an unauthorised payment', (await call('booking-hold', student.token, {
      bookingId: broken.id, action: 'attach', paymentIntentId: real ? repair.body.paymentIntentId : 'bad',
    })).status === 400);
    if (real) await stripe(`payment_intents/${repair.body.paymentIntentId}/confirm`, { payment_method: 'pm_card_visa' });
    const attached = await call('booking-hold', student.token, { bookingId: broken.id, action: 'attach', paymentIntentId: repair.body.paymentIntentId });
    assert.equal(attached.status, 200, attached.body.error);
    const repaired = await row(broken.id);
    check('update-payment attaches working hold and clears failure', repaired.stripe_payment_intent_id === repair.body.paymentIntentId &&
      !repaired.hold_failed_at && !repaired.hold_failure_code);
    if (real) {
      const pi = await stripe(`payment_intents/${repair.body.paymentIntentId}`);
      check('repair PI is exact-amount requires_capture', pi.status === 'requires_capture' && pi.amount === repair.body.amountCents);
    }
    const cancelBefore = await deferred(248);
    await patch(cancelBefore.id, { status: 'confirmed' });
    const cancelled = await call('cancel-booking', student.token, { bookingId: cancelBefore.id });
    check('student cancel before hold refunds without a PI', cancelled.status === 200 &&
      (await row(cancelBefore.id)).refund_percent === 100 && !(await row(cancelBefore.id)).stripe_payment_intent_id);
    await db.from('credit_ledger').insert({ user_id: student.id, amount_cents: 300, kind: 'adjustment' });
    const expiry = await deferred(252);
    await patch(expiry.id, { status: 'confirmed', scheduled_at: bookingTime(11) });
    assert.equal((await work()).status, 200);
    const expired = await row(expiry.id);
    const { data: returned } = await db.from('credit_ledger').select('amount_cents').eq('booking_id', expiry.id).eq('kind', 'booking_return');
    check('T-12h cancels unfunded session without charging and returns credit', expired.status === 'cancelled' &&
      expired.cancel_reason === 'payment_failed' && expired.refund_percent === 100 && !expired.stripe_payment_intent_id &&
      returned?.reduce((sum, r) => sum + r.amount_cents, 0) === Math.round(Number(expired.credit_applied) * 100));

    const move = await deferred(256);
    await patch(move.id, { status: 'confirmed' });
    const proposedAt = bookingTime(300);
    assert.equal((await call('reschedule-booking', student.token, { bookingId: move.id, action: 'propose', newScheduledAt: proposedAt })).status, 200);
    assert.equal((await call('reschedule-booking', tutorAuth.token, { bookingId: move.id, action: 'accept' })).status, 200);
    check('no-hold session can move within 14 days and recomputes due time',
      new Date((await row(move.id)).hold_due_at).getTime() === new Date(proposedAt).getTime() - 48 * 3600000);
    check('no-hold reschedule beyond 14 days is refused', (await call('reschedule-booking', student.token, {
      bookingId: move.id, action: 'propose', newScheduledAt: bookingTime(360),
    })).status === 400);
    await patch(first.id, { status: 'confirmed' });
    check('held booking cannot move outside four-day capture window', (await call('reschedule-booking', student.token, {
      bookingId: first.id, action: 'propose', newScheduledAt: bookingTime(280),
    })).status === 409);
    const validHeldTime = bookingTime(38);
    assert.equal((await call('reschedule-booking', student.token, { bookingId: first.id, action: 'propose', newScheduledAt: validHeldTime })).status, 200);
    assert.equal((await call('reschedule-booking', tutorAuth.token, { bookingId: first.id, action: 'accept' })).status, 200);
    check('held session can move within capture window without replacing payment',
      (await row(first.id)).stripe_payment_intent_id === held.stripe_payment_intent_id);
    const nearer = bookingTime(30);
    assert.equal((await call('reschedule-booking', student.token, { bookingId: move.id, action: 'propose', newScheduledAt: nearer })).status, 200);
    assert.equal((await call('reschedule-booking', tutorAuth.token, { bookingId: move.id, action: 'accept' })).status, 200);
    await work();
    const moved = await row(move.id);
    holds.add(moved.stripe_payment_intent_id);
    check('moving unfunded session inside 48h places hold next cron', !!moved.stripe_payment_intent_id);
    const immediateArgs = base(60);
    const immediate = await call('create-payment-intent', student.token, immediateArgs);
    assert.equal(immediate.status, 200, immediate.body.error);
    holds.add(immediate.body.paymentIntentId);
    check('within six days retains immediate PaymentIntent flow', !!immediate.body.paymentIntentId && !immediate.body.deferred && !immediate.body.setupIntentId);
    if (real) await stripe(`payment_intents/${immediate.body.paymentIntentId}/confirm`, { payment_method: 'pm_card_visa', return_url: 'https://noot.app/return' });
    const booked = await call('confirm-booking', student.token, { ...immediateArgs, paymentIntentId: immediate.body.paymentIntentId });
    assert.equal(booked.status, 200, booked.body.error);
    bookings.push(booked.body.bookingId);
    check('immediate booking records hold placement', !!(await row(booked.body.bookingId)).hold_placed_at);
    const declined = await deferred(264);
    const decline = await call('respond-booking-request', tutorAuth.token, { bookingId: declined.id, action: 'decline' });
    check('tutor decline without PI closes without charging', decline.status === 200 &&
      (await row(declined.id)).status === 'cancelled' && !(await row(declined.id)).stripe_payment_intent_id);
    const missing = await deferred(268);
    await patch(missing.id, { status: 'confirmed', scheduled_at: new Date(Date.now() - 3 * 3600000).toISOString() });
    if (real) {
      const completion = await call('complete-session', tutorAuth.token, { bookingId: missing.id });
      check('paid session without hold refuses completion', completion.status === 409 && (await row(missing.id)).status === 'confirmed');
    }
    const noShow = await call('report-no-show', tutorAuth.token, { bookingId: missing.id, party: 'student' });
    check('no-show without PI charges nothing and fully returns credit', noShow.status === 200 && (await row(missing.id)).refund_percent === 100);
  }
  console.log(`${count} passed, 0 failed (${mode ?? 'database/CI'})`);
} finally {
  if (real) for (const id of holds) if (id?.startsWith('pi_')) {
    await stripe(`payment_intents/${id}/cancel`, {}).catch(() => {});
  }
  if (bookings.length) await db.from('bookings').delete().in('id', bookings);
  if (tutor) await tutor.cleanup();
  for (const id of users) await db.auth.admin.deleteUser(id);
}
