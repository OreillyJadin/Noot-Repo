import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { DEV_PASSWORD } from './_devPassword.mjs';
import { bookingTime, createBookingTutor } from './_booking_test.mts';

const URL = 'http://127.0.0.1:54321';
const ANON = process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const mode = process.env.ER010_INTEGRATION;
assert(!mode || mode === 'simulated', 'ER010_INTEGRATION must be simulated when enabled');

let passed = 0;
const check = (name: string, condition: unknown) => {
  assert(condition, name);
  passed++;
  console.log(`PASS ${name}`);
};

const newUsers: string[] = [];
const seriesIds: string[] = [];
const bookingIds: string[] = [];
const tutors: Awaited<ReturnType<typeof createBookingTutor>>[] = [];

async function makeUser(prefix: string) {
  const email = `${prefix}-${crypto.randomUUID()}@crimson.ua.edu`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password: DEV_PASSWORD, email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('Could not create verifier user');
  const id = data.user.id;
  newUsers.push(id);
  const { error: profileError } = await admin.from('users').update({
    first_name: prefix, last_name: 'Series', date_of_birth: '2000-01-15',
    terms_accepted_at: new Date().toISOString(), terms_version: 'verify_booking_series',
    guidelines_accepted_at: new Date().toISOString(), guidelines_version: 'verify_booking_series',
  }).eq('id', id);
  if (profileError) throw profileError;
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: session, error: signInError } = await client.auth.signInWithPassword({ email, password: DEV_PASSWORD });
  if (signInError || !session.session) throw signInError ?? new Error('Could not sign in verifier user');
  return { id, email, client, token: session.session.access_token };
}

async function makePair(prefix: string) {
  const student = await makeUser(`${prefix}-student`);
  const tutorFixture = await createBookingTutor(admin, `${prefix}-tutor`);
  tutors.push(tutorFixture);
  const { error } = await admin.from('users').update({
    terms_accepted_at: new Date().toISOString(), terms_version: 'verify_booking_series',
    guidelines_accepted_at: new Date().toISOString(), guidelines_version: 'verify_booking_series',
  }).eq('id', tutorFixture.id);
  if (error) throw error;
  const login = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await login.auth.signInWithPassword({
    email: tutorFixture.email, password: DEV_PASSWORD,
  });
  if (authError || !authData.session) throw authError ?? new Error('Could not sign in fixture tutor');
  return {
    student,
    tutor: { id: tutorFixture.id, email: tutorFixture.email, client: login, token: authData.session.access_token },
    courseCode: tutorFixture.courseCode,
  };
}

async function call(name: string, token: string, body: unknown = {}) {
  const response = await fetch(`${URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) as Record<string, any> };
}

async function createSeries(pair: Awaited<ReturnType<typeof makePair>>, hours = 72, weeks = 2) {
  const scheduledAt = bookingTime(hours);
  const payment = await call('create-payment-intent', pair.student.token, {
    tutorId: pair.tutor.id, courseCode: pair.courseCode, durationMinutes: 60, scheduledAt, repeatWeeks: weeks,
  });
  assert.equal(payment.status, 200, payment.body.error);
  const isDeferred = payment.body.deferred === true && !!payment.body.setupIntentId && !payment.body.paymentIntentId;
  if (!isDeferred) console.error('Unexpected repeat checkout response', {
    status: payment.status, error: payment.body.error, deferred: payment.body.deferred,
    hasSetupIntent: !!payment.body.setupIntentId, hasPaymentIntent: !!payment.body.paymentIntentId,
  });
  check('repeat checkout returns deferred SetupIntent', isDeferred);
  const confirmed = await call('confirm-booking', pair.student.token, {
    tutorId: pair.tutor.id, courseCode: pair.courseCode, durationMinutes: 60,
    scheduledAt, sessionType: 'in_person', location: 'Gorgas Library',
    setupIntentId: payment.body.setupIntentId, repeatWeeks: weeks,
  });
  assert.equal(confirmed.status, 200, confirmed.body.error);
  bookingIds.push(confirmed.body.bookingId);
  seriesIds.push(confirmed.body.seriesId);
  return { ...confirmed.body, scheduledAt, setupIntentId: payment.body.setupIntentId };
}

async function accept(pair: Awaited<ReturnType<typeof makePair>>, bookingId: string) {
  const response = await call('respond-booking-request', pair.tutor.token, { bookingId, action: 'accept' });
  assert.equal(response.status, 200, response.body.error);
}

async function runWorker() {
  const response = await call('create-series-bookings', SERVICE);
  assert.equal(response.status, 200, response.body.error);
  return response.body;
}

async function booking(id: string) {
  const { data, error } = await admin.from('bookings').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

async function series(id: string) {
  const { data, error } = await admin.from('booking_series').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

try {
  const cron = execFileSync('docker', ['exec', 'supabase_db_noot', 'psql', '-U', 'postgres', '-Atc',
    "select schedule from cron.job where jobname = 'create-series-bookings'"], { encoding: 'utf8' }).trim();
  check('hourly series cron runs at minute 20', cron === '20 * * * *');
  const { error: bookingColumnError } = await admin.from('bookings').select('series_id,series_index').limit(1);
  check('booking series columns are present', !bookingColumnError);

  const rlsStudent = await makeUser('series-rls');
  const rlsSeries = await admin.from('booking_series').insert({
    student_id: rlsStudent.id, tutor_id: rlsStudent.id, subject: 'MATH 125',
    first_scheduled_at: bookingTime(72), duration_minutes: 60, session_type: 'in_person',
    price: 30, student_fee: 3, platform_fee: 6, tutor_payout_amount: 24, weeks: 2,
    stripe_setup_intent_id: 'sim_seti_' + crypto.randomUUID(), stripe_payment_method_id: 'sim_pm_' + crypto.randomUUID(),
  }).select('id').single();
  if (rlsSeries.error) throw rlsSeries.error;
  seriesIds.push(rlsSeries.data.id);
  const readable = await rlsStudent.client.from('booking_series').select('id,weeks').eq('id', rlsSeries.data.id).single();
  check('series participant can read non-payment fields', !readable.error && readable.data?.weeks === 2);
  const outsider = await makeUser('series-outsider');
  const foreignRead = await outsider.client.from('booking_series').select('id').eq('id', rlsSeries.data.id);
  check('non-participant cannot read a series', !foreignRead.error && foreignRead.data?.length === 0);
  const stripeRead = await rlsStudent.client.from('booking_series').select('stripe_setup_intent_id').eq('id', rlsSeries.data.id);
  check('student cannot read Stripe fields', !!stripeRead.error);
  const directInsert = await rlsStudent.client.from('booking_series').insert({
    student_id: rlsStudent.id, tutor_id: rlsStudent.id, subject: 'MATH 125',
    first_scheduled_at: bookingTime(72), duration_minutes: 60, session_type: 'in_person',
    price: 30, student_fee: 3, platform_fee: 6, tutor_payout_amount: 24, weeks: 2,
    stripe_setup_intent_id: 'sim_seti_' + crypto.randomUUID(), stripe_payment_method_id: 'sim_pm_' + crypto.randomUUID(),
  });
  const directUpdate = await rlsStudent.client.from('booking_series').update({ weeks: 4 }).eq('id', rlsSeries.data.id);
  check('student cannot insert or update a series', !!directInsert.error && !!directUpdate.error);
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const anonStop = await anon.rpc('stop_booking_series', { p_series: rlsSeries.data.id });
  check('anon cannot execute the stop RPC', !!anonStop.error);

  if (mode !== 'simulated') {
    console.log('SKIP Edge Function integration: set ER010_INTEGRATION=simulated on the local stack.');
  } else {
    const main = await makePair('series-main');
    const adminUser = await makeUser('series-admin');
    const { error: adminRoleError } = await admin.from('user_roles').upsert({
      user_id: adminUser.id, role: 'admin',
    }, { onConflict: 'user_id,role' });
    if (adminRoleError) throw adminRoleError;
    const { data: isAdmin } = await adminUser.client.rpc('is_admin');
    const adminScheduledAt = bookingTime(72);
    const adminRepeatPayment = await call('create-payment-intent', adminUser.token, {
      tutorId: main.tutor.id, courseCode: main.courseCode, durationMinutes: 60,
      scheduledAt: adminScheduledAt, repeatWeeks: 2,
    });
    const adminRepeatConfirm = await call('confirm-booking', adminUser.token, {
      tutorId: main.tutor.id, courseCode: main.courseCode, durationMinutes: 60,
      scheduledAt: adminScheduledAt, sessionType: 'in_person', location: 'Gorgas Library',
      setupIntentId: 'sim_seti_admin', repeatWeeks: 2,
    });
    check('admin-free bookings cannot request weekly series',
      isAdmin === true && adminRepeatPayment.status === 400 &&
      adminRepeatPayment.body.error === "Repeat weekly isn't available on this booking." &&
      adminRepeatConfirm.status === 400 &&
      adminRepeatConfirm.body.error === "Repeat weekly isn't available on this booking.");
    await admin.from('credit_ledger').insert({ user_id: main.student.id, amount_cents: 500, kind: 'adjustment' });
    const mainBooking = await createSeries(main, 72, 2);
    const first = await booking(mainBooking.bookingId);
    const pendingSeries = await series(mainBooking.seriesId);
    check('confirmation creates a pending series and week zero booking', pendingSeries.status === 'pending' &&
      first.series_id === pendingSeries.id && first.series_index === 0 && first.stripe_setup_intent_id === mainBooking.setupIntentId);
    check('first booking can use credit', Number(first.credit_applied) > 0);

    const invalidWeeks = await call('create-payment-intent', main.student.token, {
      tutorId: main.tutor.id, courseCode: main.courseCode, durationMinutes: 60,
      scheduledAt: bookingTime(72), repeatWeeks: 13,
    });
    const tooSoon = await call('create-payment-intent', main.student.token, {
      tutorId: main.tutor.id, courseCode: main.courseCode, durationMinutes: 60,
      scheduledAt: bookingTime(2), repeatWeeks: 2,
    });
    const invalidConfirm = await call('confirm-booking', main.student.token, { repeatWeeks: 1 });
    check('repeat validation rejects invalid weeks and first sessions under 24 hours',
      invalidWeeks.status === 400 && tooSoon.status === 400 && invalidConfirm.status === 400);

    await accept(main, mainBooking.bookingId);
    check('tutor acceptance activates the series', (await series(mainBooking.seriesId)).status === 'active');
    await Promise.all([runWorker(), runWorker()]);
    const { data: occurrenceRows, error: occurrenceError } = await admin.from('bookings').select('*')
      .eq('series_id', mainBooking.seriesId).eq('series_index', 1);
    if (occurrenceError) throw occurrenceError;
    const occurrence = occurrenceRows?.[0];
    const mainSeries = await series(mainBooking.seriesId);
    check('week two is confirmed, accepted, zero-credit, and price-locked', !!occurrence &&
      occurrence.status === 'confirmed' && occurrence.accepted_at != null && occurrence.accept_by == null &&
      Number(occurrence.credit_applied) === 0 && Number(occurrence.price) === Number(first.price) &&
      Number(occurrence.student_fee) === Number(mainSeries.student_fee) &&
      Number(occurrence.platform_fee) === Number(mainSeries.platform_fee) &&
      Number(occurrence.tutor_payout_amount) === Number(mainSeries.tutor_payout_amount) &&
      occurrence.stripe_setup_intent_id === mainSeries.stripe_setup_intent_id &&
      occurrence.stripe_payment_method_id === mainSeries.stripe_payment_method_id &&
      occurrence.session_type === mainSeries.session_type && occurrence.location === mainSeries.location);
    const expected = await admin.rpc('booking_series_occurrence_time', {
      p_first: '2026-03-02T17:00:00Z', p_index: 1,
    });
    check('week calculation preserves Chicago wall time across DST', !expected.error &&
      new Date(expected.data as string).toISOString() === '2026-03-09T16:00:00.000Z');
    await runWorker();
    const { count: occurrenceCount } = await admin.from('bookings').select('id', { count: 'exact', head: true })
      .eq('series_id', mainBooking.seriesId).eq('series_index', 1);
    check('concurrent and repeated worker invocations do not duplicate week two',
      occurrenceCount === 1 && (await series(mainBooking.seriesId)).next_index === 2 &&
      (await series(mainBooking.seriesId)).status === 'completed');
    const { data: firstSpend } = await admin.from('credit_ledger').select('id').eq('kind', 'booking_spend')
      .eq('payment_intent_id', mainBooking.setupIntentId).maybeSingle();
    check('series first booking spent credit exactly once', !!firstSpend);
    const { data: occurrenceCredit, error: creditError } = await admin.rpc('return_booking_credit', {
      p_booking: occurrence!.id, p_percent: 100,
    });
    check('returning occurrence credit does not reuse the first booking spend', !creditError && occurrenceCredit === 0);
    await admin.from('bookings').update({ hold_due_at: new Date(Date.now() - 60_000).toISOString() }).eq('id', occurrence!.id);
    const held = await call('place-booking-holds', SERVICE);
    assert.equal(held.status, 200, held.body.error);
    check('existing hold worker places a due occurrence hold', !!(await booking(occurrence!.id)).stripe_payment_intent_id);

    const skip = await makePair('series-skip');
    const skipBooking = await createSeries(skip, 96, 3);
    await accept(skip, skipBooking.bookingId);
    await admin.from('tutor_availability').delete().eq('tutor_id', skip.tutor.id);
    await runWorker();
    const skippedSeries = await series(skipBooking.seriesId);
    const { data: skipNotifications } = await admin.from('notifications').select('user_id')
      .contains('data', { seriesId: skipBooking.seriesId }).eq('title', 'Weekly session skipped');
    check('unavailable occurrence advances and notifies both parties', skippedSeries.next_index === 2 &&
      new Set((skipNotifications ?? []).map((n) => n.user_id)).size === 2);

    const blocked = await makePair('series-block');
    const blockedBooking = await createSeries(blocked, 120, 3);
    await accept(blocked, blockedBooking.bookingId);
    const { error: blockError } = await admin.from('user_blocks').insert({
      blocker_id: blocked.student.id, blocked_id: blocked.tutor.id,
    });
    if (blockError) throw blockError;
    await runWorker();
    check('blocking a participant ends the series', (await series(blockedBooking.seriesId)).end_reason === 'blocked');

    const stopped = await makePair('series-stop');
    const stoppedBooking = await createSeries(stopped, 144, 3);
    await accept(stopped, stoppedBooking.bookingId);
    const stoppedResult = await stopped.student.client.rpc('stop_booking_series', { p_series: stoppedBooking.seriesId });
    const third = await makeUser('series-third');
    const thirdStop = await third.client.rpc('stop_booking_series', { p_series: stoppedBooking.seriesId });
    const { data: stopNotes } = await admin.from('notifications').select('id')
      .eq('user_id', stopped.tutor.id).eq('type', 'booking')
      .contains('data', { seriesId: stoppedBooking.seriesId });
    check('participant can stop a series and a third user cannot', !stoppedResult.error &&
      !!thirdStop.error && (await series(stoppedBooking.seriesId)).status === 'stopped' &&
      stopNotes?.length === 1);

    const declined = await makePair('series-decline');
    const declinedBooking = await createSeries(declined, 168, 2);
    const declineResult = await call('respond-booking-request', declined.tutor.token, {
      bookingId: declinedBooking.bookingId, action: 'decline',
    });
    assert.equal(declineResult.status, 200, declineResult.body.error);
    check('declining the first booking cancels its series', (await series(declinedBooking.seriesId)).status === 'cancelled');
  }
} finally {
  if (seriesIds.length) await admin.from('bookings').delete().in('series_id', seriesIds);
  for (const id of bookingIds) await admin.from('bookings').delete().eq('id', id);
  for (const id of seriesIds) await admin.from('booking_series').delete().eq('id', id);
  for (const fixture of tutors) await fixture.cleanup().catch(() => {});
  for (const id of newUsers) await admin.auth.admin.deleteUser(id).catch(() => {});
}

console.log(`\n${passed} passed, 0 failed`);
