// Verify payment ownership, tutor availability, and session-duration guards locally.
//   pnpm dlx tsx scripts/verify_payment_guards.mts
import assert from 'node:assert/strict';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { campusParts } from '../packages/core/src/campusTime.ts';
import { DEV_PASSWORD } from './_devPassword.mjs';
import { bookingTime } from './_booking_test.mts';

const URL = 'http://127.0.0.1:54321';
const ANON = process.env.ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE = process.env.SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJsdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY ?? '';
const stripeTestKey = STRIPE_KEY.startsWith('sk_test_');
type Json = Record<string, any>;
type TestUser = { id: string; email: string; token: string; client: SupabaseClient };

const service = createClient(URL, SERVICE, { auth: { persistSession: false } });
const users: string[] = [];
const bookingIds: string[] = [];
const paymentIntentIds = new Set<string>();
const customerIds = new Set<string>();
const stamp = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
let passed = 0;
let skipped = 0;

function check(name: string, ok: boolean, detail = '') {
  assert.ok(ok, `${name}${detail ? ` — ${detail}` : ''}`);
  passed++;
  console.log(`✅ ${name}${detail ? ` — ${detail}` : ''}`);
}

function skip(name: string, reason: string) {
  skipped++;
  console.log(`SKIP ${name}: ${reason}`);
}

async function must<T>(result: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await result;
  if (error) throw error;
  return data;
}

async function makeUser(label: string, role: 'student' | 'tutor' = 'student'): Promise<TestUser> {
  const email = `payment-guards-${stamp}-${label}@crimson.ua.edu`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: DEV_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('Could not create payment-guard user');
  const id = data.user.id;
  users.push(id);
  await must(service.from('users').update({ date_of_birth: '2000-01-15' }).eq('id', id));
  await must(service.from('user_roles').upsert({ user_id: id, role }, { onConflict: 'user_id,role' }));

  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: session, error: signInError } = await client.auth.signInWithPassword({
    email,
    password: DEV_PASSWORD,
  });
  if (signInError || !session.session) throw signInError ?? new Error('Could not sign in payment-guard user');
  return { id, email, token: session.session.access_token, client };
}

async function makeTutor(label: string, courseCode: string): Promise<TestUser> {
  const tutor = await makeUser(label, 'tutor');
  await must(service.from('tutor_profiles').upsert({
    user_id: tutor.id,
    approval_status: 'approved',
    stripe_charges_enabled: true,
  }, { onConflict: 'user_id' }));
  await must(service.from('tutor_courses').insert({
    tutor_id: tutor.id,
    course_code: courseCode,
    grade: 'A',
    hourly_rate: 30,
  }));
  await must(service.from('tutor_availability').insert(
    Array.from({ length: 7 }, (_, day_of_week) => ({
      tutor_id: tutor.id,
      day_of_week,
      start_time: '00:00',
      end_time: '23:59',
    })),
  ));
  return tutor;
}

async function unofferedCourses(): Promise<string[]> {
  const catalog: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await service.from('courses')
      .select('course_code').eq('is_active', true).order('course_code').range(from, from + 999);
    if (error) throw error;
    catalog.push(...(data ?? []).map((row) => row.course_code as string));
    if (!data || data.length < 1000) break;
  }
  const offered: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await service.from('tutor_courses')
      .select('course_code').order('course_code').range(from, from + 999);
    if (error) throw error;
    offered.push(...(data ?? []).map((row) => row.course_code as string));
    if (!data || data.length < 1000) break;
  }
  const existing = new Set(offered);
  return [...new Set(catalog.filter((courseCode) => !existing.has(courseCode)))];
}

function longSlot(hoursAhead = 72, durationMinutes = 120): string {
  let scheduled = Date.parse(bookingTime(hoursAhead));
  for (let attempt = 0; attempt < 72; attempt++) {
    const start = campusParts(scheduled);
    const end = campusParts(scheduled + durationMinutes * 60_000);
    if (start.day === end.day && start.minutes + durationMinutes <= 23 * 60 + 59) {
      return new Date(scheduled).toISOString();
    }
    scheduled += 60 * 60_000;
  }
  throw new Error('Could not find a future slot within a campus day');
}

async function call(name: string, token: string, body: unknown = {}) {
  const response = await fetch(`${URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    body: await response.json().catch(() => ({})) as Json,
  };
}

async function stripeRequest(path: string, method: 'GET' | 'POST' | 'DELETE', values?: Record<string, string>) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${STRIPE_KEY}`,
      ...(values ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    ...(values ? { body: new URLSearchParams(values) } : {}),
  });
  const result = await response.json() as Json;
  if (!response.ok) throw new Error(`Stripe test request failed (${result.error?.code ?? response.status})`);
  return result;
}

async function createIntent(student: TestUser, tutor: TestUser, courseCode: string, scheduledAt: string, durationMinutes: number) {
  const result = await call('create-payment-intent', student.token, {
    tutorId: tutor.id,
    courseCode,
    scheduledAt,
    durationMinutes,
  });
  if (typeof result.body.paymentIntentId === 'string' && result.body.paymentIntentId.startsWith('pi_')) {
    paymentIntentIds.add(result.body.paymentIntentId);
  }
  if (typeof result.body.customerId === 'string' && result.body.customerId.startsWith('cus_')) {
    customerIds.add(result.body.customerId);
  }
  return result;
}

async function tutorVisibility(client: SupabaseClient, tutorIds: string[]) {
  const { data, error } = await client.from('tutor_public_profiles').select('id').in('id', tutorIds);
  if (error) throw error;
  return (data ?? []).map((row) => row.id as string);
}

async function searchCoverage(client: SupabaseClient, courseCode: string) {
  const { data, error } = await client.rpc('search_courses', { p_query: courseCode, p_limit: 5 });
  if (error) throw error;
  return (data ?? []).find((row) => row.course_code === courseCode)?.has_tutor;
}

async function cleanupStripe() {
  if (!stripeTestKey) return;
  for (const id of paymentIntentIds) {
    try { await stripeRequest(`payment_intents/${id}/cancel`, 'POST', {}); } catch { /* best effort */ }
  }
  for (const id of customerIds) {
    try { await stripeRequest(`customers/${id}`, 'DELETE'); } catch { /* best effort */ }
  }
}

try {
  const student = await makeUser('student');
  const victim = await makeUser('victim');

  const { error: updateError } = await student.client.from('users')
    .update({ stripe_customer_id: 'cus_student_write_denied' }).eq('id', student.id);
  check('a student cannot update their own stripe_customer_id', updateError?.code === '42501', updateError?.code ?? '');
  const { error: insertError } = await student.client.from('users').insert({
    id: student.id,
    email: student.email,
    stripe_customer_id: 'cus_student_insert_denied',
  });
  check('a student cannot insert stripe_customer_id', insertError?.code === '42501', insertError?.code ?? '');
  const unchanged = await must(service.from('users').select('stripe_customer_id').eq('id', student.id).single());
  check('the rejected client writes leave stripe_customer_id unset', unchanged.stripe_customer_id === null);

  const codes = await unofferedCourses();
  assert.ok(codes.length >= 2, 'Expected two active catalog courses with no tutor offerings');
  const listingCode = codes[0]!;
  const paymentCode = codes[1]!;
  const bannedTutor = await makeTutor('banned-tutor', listingCode);
  const suspendedListingTutor = await makeTutor('suspended-listing-tutor', listingCode);
  const paymentTutor = await makeTutor('payment-tutor', paymentCode);

  await must(service.from('users').update({ status: 'banned' }).eq('id', bannedTutor.id));
  await must(service.from('users').update({ status: 'suspended' }).eq('id', suspendedListingTutor.id));
  const hiddenFromStudent = await tutorVisibility(student.client, [bannedTutor.id, suspendedListingTutor.id]);
  check('banned and suspended tutors are hidden from another student', hiddenFromStudent.length === 0);
  check('banned tutor remains visible in its own public profile', (await tutorVisibility(bannedTutor.client, [bannedTutor.id])).includes(bannedTutor.id));
  check('suspended tutor remains visible in its own public profile',
    (await tutorVisibility(suspendedListingTutor.client, [suspendedListingTutor.id])).includes(suspendedListingTutor.id));
  check('search_courses excludes courses covered only by banned/suspended tutors',
    await searchCoverage(student.client, listingCode) === false);

  const slotA = longSlot();
  const slotB = longSlot(80);
  const bannedCreate = await createIntent(student, bannedTutor, listingCode, slotA, 60);
  check('create-payment-intent returns 404 for a banned tutor', bannedCreate.status === 404, JSON.stringify(bannedCreate.body));
  const bannedConfirm = await call('confirm-booking', student.token, {
    tutorId: bannedTutor.id,
    courseCode: listingCode,
    scheduledAt: slotA,
    durationMinutes: 60,
    sessionType: 'in_person',
    location: 'Gorgas Library',
  });
  check('confirm-booking returns 404 for a banned tutor', bannedConfirm.status === 404, JSON.stringify(bannedConfirm.body));

  const pastConfirmed = await must(service.from('bookings').insert({
    student_id: student.id,
    tutor_id: bannedTutor.id,
    subject: listingCode,
    scheduled_at: new Date(Date.now() - 72 * 60 * 60_000).toISOString(),
    duration_minutes: 60,
    price: 0,
    platform_fee: 0,
    tutor_payout_amount: 0,
    session_type: 'in_person',
    status: 'confirmed',
    cancellation_deadline: new Date(Date.now() - 73 * 60 * 60_000).toISOString(),
  }).select('id').single());
  bookingIds.push(pastConfirmed.id);
  const payoutRetryAt = new Date(Date.now() - 8 * 24 * 60 * 60_000).toISOString();
  const bannedRetry = await must(service.from('bookings').insert({
    student_id: student.id,
    tutor_id: bannedTutor.id,
    subject: listingCode,
    scheduled_at: new Date(Date.now() - 10 * 24 * 60 * 60_000).toISOString(),
    duration_minutes: 60,
    price: 20,
    platform_fee: 2,
    tutor_payout_amount: 18,
    session_type: 'in_person',
    status: 'completed',
    stripe_payment_intent_id: `pi_verify_banned_${crypto.randomUUID()}`,
    payout_failed_at: payoutRetryAt,
    cancellation_deadline: new Date(Date.now() - 11 * 24 * 60 * 60_000).toISOString(),
  }).select('id').single());
  bookingIds.push(bannedRetry.id);
  const payoutRetryBefore = await must(service.from('bookings').select('payout_failed_at').eq('id', bannedRetry.id).single());
  const autoComplete = await call('auto-complete-sessions', SERVICE);
  check('auto-complete-sessions runs for the service role', autoComplete.status === 200, JSON.stringify(autoComplete.body));
  const pastAfter = await must(service.from('bookings').select('status').eq('id', pastConfirmed.id).single());
  check('a past confirmed booking with a banned tutor stays confirmed', pastAfter.status === 'confirmed');
  const retryAfter = await must(service.from('bookings').select('status,payout_failed_at').eq('id', bannedRetry.id).single());
  check('a banned tutor payout retry is left untouched',
    retryAfter.status === 'completed' &&
      new Date(retryAfter.payout_failed_at).getTime() === new Date(payoutRetryBefore.payout_failed_at).getTime());

  const invalidLength = 'Sessions can be 30 minutes, 1, 1.5 or 2 hours';
  for (const durationMinutes of [3, 45]) {
    const result = await createIntent(student, paymentTutor, paymentCode, slotA, durationMinutes);
    check(`${durationMinutes}-minute sessions are rejected`, result.status === 400 && result.body.error === invalidLength,
      `${result.status} ${result.body.error ?? ''}`);
  }
  for (const durationMinutes of [30, 60, 90, 120]) {
    const result = await createIntent(student, paymentTutor, paymentCode, slotA, durationMinutes);
    check(`${durationMinutes}-minute sessions are accepted`, result.status === 200,
      `${result.status} ${result.body.error ?? ''}`);
  }

  let stripeRuntime = false;
  let slotBindingIntent: Json | null = null;
  if (stripeTestKey) {
    const victimCustomer = await stripeRequest('customers', 'POST', {
      email: victim.email,
      'metadata[user_id]': victim.id,
    });
    customerIds.add(victimCustomer.id);
    await must(service.from('users').update({ stripe_customer_id: victimCustomer.id }).eq('id', victim.id));
    await must(service.from('users').update({ stripe_customer_id: victimCustomer.id }).eq('id', student.id));

    const tampered = await createIntent(student, paymentTutor, paymentCode, slotA, 60);
    check('tampered-customer checkout reaches the payment endpoint', tampered.status === 200, JSON.stringify(tampered.body));
    if (tampered.body.simulated === true) {
      skip('Stripe customer ownership and PaymentIntent slot-binding checks',
        'the local function runtime returned simulated payments (no test Stripe key served)');
      await must(service.from('users').update({ stripe_customer_id: null }).eq('id', student.id));
    } else {
      stripeRuntime = true;
      slotBindingIntent = tampered.body;
      check('tampering cannot make checkout use the victim Stripe customer',
        tampered.body.customerId !== victimCustomer.id);
      const attackerRow = await must(service.from('users').select('stripe_customer_id').eq('id', student.id).single());
      check('the attacker customer row is overwritten with the owned customer',
        attackerRow.stripe_customer_id === tampered.body.customerId && attackerRow.stripe_customer_id !== victimCustomer.id);
      const ownedCustomer = await stripeRequest(`customers/${tampered.body.customerId}`, 'GET');
      check('the replacement Stripe customer records the attacker as owner',
        ownedCustomer.metadata?.user_id === student.id);

      const legacy = await makeUser('legacy-customer');
      const legacyCustomer = await stripeRequest('customers', 'POST', { email: legacy.email });
      customerIds.add(legacyCustomer.id);
      await must(service.from('users').update({ stripe_customer_id: legacyCustomer.id }).eq('id', legacy.id));
      const legacyCheckout = await createIntent(legacy, paymentTutor, paymentCode, slotA, 60);
      check('an unclaimed legacy Stripe customer is safely adopted',
        legacyCheckout.status === 200 && legacyCheckout.body.customerId === legacyCustomer.id);
      const adopted = await stripeRequest(`customers/${legacyCustomer.id}`, 'GET');
      check('legacy customer adoption stamps its owner metadata', adopted.metadata?.user_id === legacy.id);

      const shared = await makeUser('shared-legacy-customer');
      const sharedCustomer = await stripeRequest('customers', 'POST', { email: victim.email });
      customerIds.add(sharedCustomer.id);
      await must(service.from('users').update({ stripe_customer_id: sharedCustomer.id }).eq('id', victim.id));
      await must(service.from('users').update({ stripe_customer_id: sharedCustomer.id }).eq('id', shared.id));
      const sharedCheckout = await createIntent(shared, paymentTutor, paymentCode, slotA, 60);
      check('a legacy Stripe customer referenced by another user is not adopted',
        sharedCheckout.status === 200 && sharedCheckout.body.customerId !== sharedCustomer.id);

      assert.ok(slotBindingIntent.paymentIntentId?.startsWith('pi_'), 'Expected a Stripe PaymentIntent for slot-binding checks');
      const slotMismatch = await call('confirm-booking', student.token, {
        tutorId: paymentTutor.id,
        courseCode: paymentCode,
        scheduledAt: slotB,
        durationMinutes: 60,
        sessionType: 'in_person',
        location: 'Gorgas Library',
        paymentIntentId: slotBindingIntent.paymentIntentId,
      });
      check('a PaymentIntent for slot A cannot be confirmed for slot B',
        slotMismatch.status === 400 && slotMismatch.body.error === 'The payment does not match this session',
        `${slotMismatch.status} ${slotMismatch.body.error ?? ''}`);
      const durationMismatch = await call('confirm-booking', student.token, {
        tutorId: paymentTutor.id,
        courseCode: paymentCode,
        scheduledAt: slotA,
        durationMinutes: 90,
        sessionType: 'in_person',
        location: 'Gorgas Library',
        paymentIntentId: slotBindingIntent.paymentIntentId,
      });
      check('a PaymentIntent cannot be confirmed for a different duration',
        durationMismatch.status === 400 && durationMismatch.body.error === 'The payment does not match this session',
        `${durationMismatch.status} ${durationMismatch.body.error ?? ''}`);

      const tooSoon = await call('confirm-booking', student.token, {
        tutorId: paymentTutor.id,
        courseCode: paymentCode,
        scheduledAt: new Date(Date.now() + 30 * 60_000).toISOString(),
        durationMinutes: 60,
        sessionType: 'in_person',
        location: 'Gorgas Library',
        paymentIntentId: slotBindingIntent.paymentIntentId,
      });
      check('the early validation path rejects a PI bound to another slot',
        tooSoon.status === 400 && tooSoon.body.error === 'The payment does not match this session',
        `${tooSoon.status} ${tooSoon.body.error ?? ''}`);
      const stillOpen = await stripeRequest(`payment_intents/${slotBindingIntent.paymentIntentId}`, 'GET');
      check('a mismatched-slot check does not cancel the valid original hold',
        stillOpen.status !== 'canceled');
    }
  } else {
    skip('Stripe customer ownership and PaymentIntent slot-binding checks',
      'STRIPE_SECRET_KEY is not an sk_test_ key');
  }

  if (!stripeRuntime && stripeTestKey) {
    await must(service.from('users').update({ stripe_customer_id: null }).eq('id', student.id));
  }

  console.log(`\n${passed} passed, ${skipped} skipped`);
} finally {
  await cleanupStripe();
  for (const id of bookingIds) {
    await service.from('bookings').delete().eq('id', id);
  }
  for (const id of users.reverse()) {
    await service.auth.admin.deleteUser(id);
  }
}
