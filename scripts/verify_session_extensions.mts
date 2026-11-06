// Verify extension authorization, timing, duplicate/overlap guards, responses, and settlement.
// Run against the local stack with `pnpm dlx tsx scripts/verify_session_extensions.mts`.
import { createClient } from '@supabase/supabase-js';
import { DEV_PASSWORD } from './_devPassword.mjs';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
if (!['127.0.0.1', 'localhost'].includes(new globalThis.URL(URL).hostname)) {
  throw new Error('verify_session_extensions only runs against local Supabase');
}
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
type Json = Record<string, any>;
type User = { id: string; token: string };
const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });
const bookingIds: string[] = [];
const paymentIntentIds: string[] = [];
let outsiderId: string | null = null;
let stripeStudentId: string | null = null;
let originalStripeCustomerId: string | null = null;
let testStripeCustomerId: string | null = null;
const extraTestCustomerIds: string[] = [];
let testPaymentMethodId: string | null = null;
let originalTutorConnectId: string | null = null;
let testTutorConnectId: string | null = null;
let stripeTutorId: string | null = null;
let originalTutorChargesEnabled: boolean | null = null;
let originalTutorPayoutsEnabled: boolean | null = null;
let changedTutorConnect = false;
let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  ok ? passed++ : failed++;
};

async function signIn(email: string): Promise<User> {
  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: DEV_PASSWORD });
  if (error || !data.user || !data.session) throw new Error(`Could not sign in ${email}: ${error?.message ?? 'no session'}`);
  return { id: data.user.id, token: data.session.access_token };
}

async function call(name: string, token: string, body: Json = {}) {
  const response = await fetch(`${URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) as Json };
}

async function parent(student: User, tutor: User, options: {
  endInMinutes?: number; price?: number; duration?: number; sessionType?: 'video' | 'in_person'; paymentIntentId?: string | null;
} = {}) {
  const duration = options.duration ?? 30;
  const scheduledAt = new Date(Date.now() + ((options.endInMinutes ?? 5) - duration) * 60_000).toISOString();
  const { data, error } = await svc.from('bookings').insert({
    student_id: student.id,
    tutor_id: tutor.id,
    subject: 'MGT 300',
    scheduled_at: scheduledAt,
    duration_minutes: duration,
    price: options.price ?? 0,
    student_fee: 0,
    platform_fee: 0,
    tutor_payout_amount: options.price ?? 0,
    session_type: options.sessionType ?? 'in_person',
    location: options.sessionType === 'video' ? null : 'Verifier room',
    daily_room_name: options.sessionType === 'video' ? `extension-${crypto.randomUUID()}` : null,
    meeting_link: options.sessionType === 'video' ? 'https://test.daily.co/extension-room' : null,
    video_link_sent_at: options.sessionType === 'video' ? new Date().toISOString() : null,
    status: 'confirmed',
    dispute_status: 'none',
    cancellation_deadline: scheduledAt,
    stripe_payment_intent_id: options.paymentIntentId ?? null,
  }).select('id, scheduled_end').single();
  if (error || !data) throw new Error(`Could not create parent booking: ${error?.message ?? 'missing row'}`);
  bookingIds.push(data.id);
  return data as { id: string; scheduled_end: string };
}

async function endParent(parentId: string) {
  await svc.from('bookings').update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('id', parentId).eq('status', 'confirmed');
}

async function stripeRequest(path: string, fields: Record<string, string>, method = 'POST'): Promise<Json> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key?.startsWith('sk_test_')) throw new Error('No Stripe test key');
  const body = new URLSearchParams(fields);
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: method === 'GET' || method === 'DELETE' ? undefined : body,
  });
  const result = await response.json() as Json;
  if (!response.ok) throw new Error(`Stripe ${path} returned HTTP ${response.status}`);
  return result;
}

async function installTestCard(userId: string, email: string) {
  const { data: row, error } = await svc.from('users').select('stripe_customer_id').eq('id', userId).single();
  if (error) throw error;
  originalStripeCustomerId = row.stripe_customer_id ?? null;
  const customer = await stripeRequest('customers', { email, 'metadata[user_id]': userId });
  testStripeCustomerId = customer.id as string;
  const method = await stripeRequest('payment_methods', {
    type: 'card',
    'card[token]': 'tok_visa',
  });
  testPaymentMethodId = method.id as string;
  await stripeRequest(`payment_methods/${method.id}/attach`, { customer: testStripeCustomerId });
  await stripeRequest(`customers/${testStripeCustomerId}`, {
    'invoice_settings[default_payment_method]': method.id as string,
  });
  const { error: saveError } = await svc.from('users').update({ stripe_customer_id: testStripeCustomerId }).eq('id', userId);
  if (saveError) throw saveError;
}

async function readyConnectAccount(): Promise<string | null> {
  const result = await stripeRequest('accounts?limit=100', {}, 'GET');
  const accounts = result.data as Array<{ id?: string; payouts_enabled?: boolean; capabilities?: Record<string, unknown> }> | undefined;
  return accounts?.find((account) => account.payouts_enabled === true
    && account.capabilities?.transfers === 'active')?.id ?? null;
}

async function createManualIntent(customerId: string, paymentMethodId: string, amountCents: number) {
  return stripeRequest('payment_intents', {
    amount: String(amountCents),
    currency: 'usd',
    customer: customerId,
    payment_method: paymentMethodId,
    capture_method: 'manual',
    off_session: 'true',
    confirm: 'true',
  });
}

async function run() {
  const student = await signIn('student@crimson.ua.edu');
  const stripeServed = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') === true;
  stripeStudentId = student.id;
  const tutor = await signIn('sara@crimson.ua.edu');
  const admin = await signIn('admin@crimson.ua.edu');
  const { data: outsiderRow, error: outsiderError } = await svc.auth.admin.createUser({
    email: `extension-outsider-${Date.now()}@crimson.ua.edu`, password: DEV_PASSWORD, email_confirm: true,
  });
  if (outsiderError || !outsiderRow.user) throw outsiderError ?? new Error('Could not create outsider');
  outsiderId = outsiderRow.user.id;
  const outsider = await signIn(outsiderRow.user.email!);

  if (process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
    await installTestCard(student.id, 'student@crimson.ua.edu');
    stripeTutorId = tutor.id;
    const { data: tutorProfile } = await svc.from('tutor_profiles')
      .select('stripe_connect_account_id, stripe_charges_enabled, stripe_payouts_enabled')
      .eq('user_id', tutor.id).maybeSingle();
    originalTutorConnectId = tutorProfile?.stripe_connect_account_id ?? null;
    originalTutorChargesEnabled = tutorProfile?.stripe_charges_enabled ?? false;
    originalTutorPayoutsEnabled = tutorProfile?.stripe_payouts_enabled ?? false;

    if (testStripeCustomerId && testPaymentMethodId) {
      const parentPi = await createManualIntent(testStripeCustomerId, testPaymentMethodId, 6000);
      paymentIntentIds.push(parentPi.id as string);
      const parentWithPi = await parent(student, tutor, {
        duration: 60, price: 60, paymentIntentId: parentPi.id as string,
      });
      const sameCard = await call('request-extension', student.token, { bookingId: parentWithPi.id, minutes: 30 });
      const sameCardId = typeof sameCard.body.bookingId === 'string' ? sameCard.body.bookingId : null;
      if (sameCardId) bookingIds.push(sameCardId);
      const { data: sameCardRow } = sameCardId
        ? await svc.from('bookings').select('stripe_payment_intent_id').eq('id', sameCardId).single()
        : { data: null };
      const sameCardPiId = sameCardRow?.stripe_payment_intent_id as string | null;
      if (sameCardPiId) paymentIntentIds.push(sameCardPiId);
      const sameCardPi = sameCardPiId ? await stripeRequest(`payment_intents/${sameCardPiId}`, {}, 'GET') : null;
      check('extension reuses only the parent session student card',
        sameCard.status === 200 && sameCardPi?.customer === testStripeCustomerId
          && sameCardPi?.payment_method === testPaymentMethodId,
        `HTTP ${sameCard.status}`);
      if (sameCardId) await call('respond-extension', tutor.token, { bookingId: sameCardId, accept: false });
      await endParent(parentWithPi.id);

      const attackerCustomer = await stripeRequest('customers', {
        email: outsiderRow.user.email!,
        'metadata[user_id]': outsider.id,
      });
      extraTestCustomerIds.push(attackerCustomer.id as string);
      const attackerMethod = await stripeRequest('payment_methods', {
        type: 'card',
        'card[token]': 'tok_visa',
      });
      await stripeRequest(`payment_methods/${attackerMethod.id}/attach`, { customer: attackerCustomer.id as string });
      const attackerPi = await createManualIntent(attackerCustomer.id as string, attackerMethod.id as string, 6000);
      paymentIntentIds.push(attackerPi.id as string);
      const foreignParent = await parent(student, tutor, {
        duration: 60, price: 60, paymentIntentId: attackerPi.id as string,
      });
      const foreignRequest = await call('request-extension', student.token, { bookingId: foreignParent.id, minutes: 30 });
      const { data: foreignChildren } = await svc.from('bookings').select('id')
        .eq('extends_booking_id', foreignParent.id);
      check('rejects a parent PaymentIntent owned by another Stripe customer',
        foreignRequest.status === 402 && !foreignChildren?.length,
        `HTTP ${foreignRequest.status}`);
      await endParent(foreignParent.id);
    }

    const pricedParent = await parent(student, tutor, { duration: 60, price: 60 });
    const priced = await call('request-extension', student.token, { bookingId: pricedParent.id, minutes: 30 });
    const pricedId = typeof priced.body.bookingId === 'string' ? priced.body.bookingId : null;
    if (pricedId) bookingIds.push(pricedId);
    const { data: pricedRow } = pricedId
      ? await svc.from('bookings').select('price, student_fee, stripe_payment_intent_id').eq('id', pricedId).single()
      : { data: null };
    const intentId = pricedRow?.stripe_payment_intent_id as string | null;
    if (intentId) paymentIntentIds.push(intentId);
    const intent = intentId ? await stripeRequest(`payment_intents/${intentId}`, {}, 'GET') : null;
    check('prorates the extension and authorizes the exact card amount',
      priced.status === 200 && Number(pricedRow?.price) === 30 && !!intent
        && intent.status === 'requires_capture'
        && Number(intent.amount) === Math.round((Number(pricedRow?.price) + Number(pricedRow?.student_fee)) * 100),
      `HTTP ${priced.status}, price=${pricedRow?.price ?? 'none'}`);
    if (pricedId && intentId) {
      const declined = await call('respond-extension', tutor.token, { bookingId: pricedId, accept: false });
      const released = await stripeRequest(`payment_intents/${intentId}`, {}, 'GET');
      check('tutor decline cancels the extension PaymentIntent',
        declined.status === 200 && released.status === 'canceled',
        `HTTP ${declined.status}, PI=${String(released.status)}`);
    }
    await endParent(pricedParent.id);

    const noShowParent = await parent(student, tutor, { duration: 60, price: 60 });
    const paidExtension = await call('request-extension', student.token, { bookingId: noShowParent.id, minutes: 30 });
    const paidExtensionId = typeof paidExtension.body.bookingId === 'string' ? paidExtension.body.bookingId : null;
    if (paidExtensionId) bookingIds.push(paidExtensionId);
    const { data: paidChild } = paidExtensionId
      ? await svc.from('bookings').select('stripe_payment_intent_id').eq('id', paidExtensionId).single()
      : { data: null };
    const paidPi = paidChild?.stripe_payment_intent_id as string | null;
    if (paidPi) paymentIntentIds.push(paidPi);
    if (paidExtensionId && paidPi) {
      await call('respond-extension', tutor.token, { bookingId: paidExtensionId, accept: true });
      await svc.from('bookings').update({ scheduled_at: new Date(Date.now() - 120 * 60_000).toISOString() })
        .eq('id', noShowParent.id);
      await svc.from('bookings').update({ scheduled_at: new Date(Date.now() - 90 * 60_000).toISOString() })
        .eq('id', paidExtensionId);
      await call('report-no-show', student.token, { bookingId: noShowParent.id, party: 'tutor' });
      await call('resolve-dispute', admin.token, { bookingId: noShowParent.id, action: 'flag', reason: 'verification' });
      await call('resolve-dispute', admin.token, { bookingId: noShowParent.id, action: 'resolve', outcome: 'tutor_no_show' });
      const cancelledPi = await stripeRequest(`payment_intents/${paidPi}`, {}, 'GET');
      check('parent no-show cancels a real extension PaymentIntent', cancelledPi.status === 'canceled',
        `PI=${String(cancelledPi.status)}`);
    } else {
      check('parent no-show cancels a real extension PaymentIntent', false, `extension request HTTP ${paidExtension.status}`);
    }

      testTutorConnectId = await readyConnectAccount();
    if (testTutorConnectId && testStripeCustomerId && testPaymentMethodId) {
      await svc.from('tutor_profiles').update({
        stripe_connect_account_id: testTutorConnectId,
        stripe_charges_enabled: true,
        stripe_payouts_enabled: true,
      }).eq('user_id', tutor.id);
      changedTutorConnect = true;
      const parentPi = await createManualIntent(testStripeCustomerId, testPaymentMethodId, 6000);
      const completeParent = await parent(student, tutor, {
        duration: 60, price: 60, paymentIntentId: parentPi.id as string,
      });
      paymentIntentIds.push(parentPi.id as string);
      const completeRequest = await call('request-extension', student.token, {
        bookingId: completeParent.id, minutes: 30,
      });
      const completeExtensionId = typeof completeRequest.body.bookingId === 'string'
        ? completeRequest.body.bookingId : null;
      if (completeExtensionId) bookingIds.push(completeExtensionId);
      const { data: completeChild } = completeExtensionId
        ? await svc.from('bookings').select('stripe_payment_intent_id').eq('id', completeExtensionId).single()
        : { data: null };
      const childPi = completeChild?.stripe_payment_intent_id as string | null;
      if (childPi) paymentIntentIds.push(childPi);
      if (completeExtensionId && childPi) {
        await call('respond-extension', tutor.token, { bookingId: completeExtensionId, accept: true });
        await svc.from('bookings').update({ scheduled_at: new Date(Date.now() - 120 * 60_000).toISOString() })
          .eq('id', completeParent.id);
        await svc.from('bookings').update({ scheduled_at: new Date(Date.now() - 60 * 60_000).toISOString() })
          .eq('id', completeExtensionId);
        const completed = await call('complete-session', tutor.token, { bookingId: completeParent.id });
        const { data: completionClaim } = await svc.from('bookings')
          .select('status, completion_claimed_at').eq('id', completeParent.id).single();
        if (completionClaim?.status === 'confirmed' && completionClaim.completion_claimed_at) {
          await svc.from('bookings').update({
            completion_claimed_at: new Date(Date.now() - 25 * 60 * 60_000).toISOString(),
          }).eq('id', completeParent.id);
          await call('auto-complete-sessions', SERVICE, {});
        }
        const [capturedParent, capturedChild] = await Promise.all([
          stripeRequest(`payment_intents/${parentPi.id}`, {}, 'GET'),
          stripeRequest(`payment_intents/${childPi}`, {}, 'GET'),
        ]);
        const { data: settledRows } = await svc.from('bookings')
          .select('id, status, stripe_transfer_id').in('id', [completeParent.id, completeExtensionId]);
        check('parent completion captures both holds and creates both payouts',
          completed.status === 200 && capturedParent.status === 'succeeded' && capturedChild.status === 'succeeded'
            && settledRows?.length === 2 && settledRows.every((row) => row.status === 'completed' && row.stripe_transfer_id),
          `HTTP ${completed.status}, parent PI=${String(capturedParent.status)}, extension PI=${String(capturedChild.status)}, body=${JSON.stringify(completed.body)}`);
      } else {
        check('parent completion captures both holds and creates both payouts', false,
          `extension request HTTP ${completeRequest.status}`);
      }
    } else {
      console.log('⏭️ SKIP two-PI payout check: no ready Stripe test Connect account');
    }
  } else {
    console.log('⏭️ SKIP Stripe price/decline checks: no Stripe test key served');
  }

  const outside = await parent(student, tutor, { endInMinutes: -11 });
  const outsideResult = await call('request-extension', student.token, { bookingId: outside.id, minutes: 30 });
  check('rejects requests outside the final ten minutes', outsideResult.status === 400, `HTTP ${outsideResult.status}`);
  await endParent(outside.id);

  const unauthorized = await parent(student, tutor);
  const wrongParty = await call('request-extension', outsider.token, { bookingId: unauthorized.id, minutes: 30 });
  check('only the parent student may request extra time', wrongParty.status === 403, `HTTP ${wrongParty.status}`);
  const invalidLength = await call('request-extension', student.token, { bookingId: unauthorized.id, minutes: 45 });
  check('rejects unsupported extension lengths', invalidLength.status === 400, `HTTP ${invalidLength.status}`);
  await endParent(unauthorized.id);

  const conflictParent = await parent(student, tutor, { price: stripeServed ? 60 : 0 });
  const { data: conflictBooking, error: conflictError } = await svc.from('bookings').insert({
    student_id: outsider.id,
    tutor_id: tutor.id,
    subject: 'MGT 300',
    scheduled_at: conflictParent.scheduled_end,
    duration_minutes: 30,
    price: 0,
    student_fee: 0,
    platform_fee: 0,
    tutor_payout_amount: 0,
    session_type: 'in_person',
    location: 'Conflict',
    status: 'confirmed',
    dispute_status: 'none',
    cancellation_deadline: conflictParent.scheduled_end,
  }).select('id').single();
  if (conflictError) throw conflictError;
  if (conflictBooking) bookingIds.push(conflictBooking.id);
  const overlap = await call('request-extension', student.token, { bookingId: conflictParent.id, minutes: 30 });
  const { data: overlapRows } = await svc.from('bookings').select('id, stripe_payment_intent_id')
    .eq('extends_booking_id', conflictParent.id);
  check('overlap is rejected before creating an extension payment hold',
    overlap.status === 409 && !overlapRows?.length, `HTTP ${overlap.status}, extension rows=${overlapRows?.length ?? 0}`);
  await svc.from('bookings').update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('tutor_id', tutor.id).eq('scheduled_at', conflictParent.scheduled_end).eq('status', 'confirmed');
  await endParent(conflictParent.id);

  const duplicateParent = await parent(student, tutor);
  const first = await call('request-extension', student.token, { bookingId: duplicateParent.id, minutes: 30 });
  const second = await call('request-extension', student.token, { bookingId: duplicateParent.id, minutes: 30 });
  const extensionId = typeof first.body.bookingId === 'string' ? first.body.bookingId : null;
  if (extensionId) bookingIds.push(extensionId);
  const { data: freeExtension } = extensionId
    ? await svc.from('bookings').select('stripe_payment_intent_id, price, student_fee').eq('id', extensionId).single()
    : { data: null };
  check('free parent creates a free extension without a PaymentIntent',
    first.status === 200 && freeExtension?.price === 0 && !freeExtension?.stripe_payment_intent_id,
    `HTTP ${first.status}`);
  check('duplicate pending extension request is rejected', second.status === 409, `HTTP ${second.status}`);

  if (extensionId) {
    const accepted = await call('respond-extension', tutor.token, { bookingId: extensionId, accept: true });
    const { data: acceptedRow } = await svc.from('bookings').select('status').eq('id', extensionId).single();
    const direct = await call('report-no-show', student.token, { bookingId: extensionId, party: 'tutor' });
    check('tutor acceptance confirms the extension', accepted.status === 200 && acceptedRow?.status === 'confirmed',
      `HTTP ${accepted.status}`);
    check('extension IDs cannot be settled from no-show reports', direct.status === 400, `HTTP ${direct.status}`);
    const guardedCalls = await Promise.all([
      call('complete-session', tutor.token, { bookingId: extensionId }),
      call('cancel-booking', student.token, { bookingId: extensionId }),
      call('reschedule-booking', student.token, { bookingId: extensionId, action: 'propose' }),
      call('contest-session-claim', tutor.token, { bookingId: extensionId, kind: 'completion' }),
    ]);
    check('extension IDs are rejected by completion, cancellation, rescheduling, and contest flows',
      guardedCalls.every((response) => response.status === 400
        && response.body.error === 'Manage this from the main session'),
      guardedCalls.map((response) => `${response.status}:${response.body.error ?? 'no message'}`).join(' | '));
    await svc.from('bookings').update({
      scheduled_at: new Date(Date.now() - 120 * 60_000).toISOString(),
    }).eq('id', duplicateParent.id);
    await svc.from('bookings').update({
      scheduled_at: new Date(Date.now() - 90 * 60_000).toISOString(),
    }).eq('id', extensionId);
    const noShow = await call('report-no-show', student.token, { bookingId: duplicateParent.id, party: 'tutor' });
    if (noShow.status === 200) {
      await call('resolve-dispute', admin.token, { bookingId: duplicateParent.id, action: 'flag', reason: 'verification' });
      await call('resolve-dispute', admin.token, { bookingId: duplicateParent.id, action: 'resolve', outcome: 'tutor_no_show' });
    }
    const { data: cancelledExtension } = await svc.from('bookings').select('status, stripe_payment_intent_id')
      .eq('id', extensionId).single();
    check('parent no-show cancels the extension without payout',
      noShow.status === 200 && cancelledExtension?.status === 'cancelled'
        && !cancelledExtension?.stripe_payment_intent_id,
      `HTTP ${noShow.status}, extension=${cancelledExtension?.status}`);
  }

  const duplicatePaidParent = await parent(student, tutor, { price: stripeServed ? 60 : 0 });
  const paidFirst = await call('request-extension', student.token, { bookingId: duplicatePaidParent.id, minutes: 30 });
  const paidSecond = await call('request-extension', student.token, { bookingId: duplicatePaidParent.id, minutes: 30 });
  const paidFirstId = typeof paidFirst.body.bookingId === 'string' ? paidFirst.body.bookingId : null;
  if (paidFirstId) bookingIds.push(paidFirstId);
  const { data: duplicateRows } = await svc.from('bookings')
    .select('id, stripe_payment_intent_id').eq('extends_booking_id', duplicatePaidParent.id);
  const duplicatePaidPi = duplicateRows?.[0]?.stripe_payment_intent_id as string | null;
  if (duplicatePaidPi) paymentIntentIds.push(duplicatePaidPi);
  check('duplicate paid requests do not leave a second PaymentIntent',
    paidFirst.status === 200 && paidSecond.status === 409 && duplicateRows?.length === 1
      && !!duplicateRows[0]?.stripe_payment_intent_id,
    `first HTTP ${paidFirst.status}, second HTTP ${paidSecond.status}`);
  if (paidFirstId) await call('respond-extension', tutor.token, { bookingId: paidFirstId, accept: false });
  await endParent(duplicatePaidParent.id);

  const expiryParent = await parent(student, tutor, { price: stripeServed ? 20 : 0 });
  const pending = await call('request-extension', student.token, { bookingId: expiryParent.id, minutes: 30 });
  const pendingId = typeof pending.body.bookingId === 'string' ? pending.body.bookingId : null;
  if (pendingId) bookingIds.push(pendingId);
  if (pendingId) {
    await svc.from('bookings').update({ accept_by: new Date(Date.now() - 60_000).toISOString() }).eq('id', pendingId);
    await svc.rpc('expire_booking_requests', { p_now: new Date().toISOString() });
    await call('release-booking-holds', SERVICE, {});
    const late = await call('respond-extension', tutor.token, { bookingId: pendingId, accept: true });
    const { data: expired } = await svc.from('bookings')
      .select('status, hold_released_at, stripe_payment_intent_id').eq('id', pendingId).single();
    const expiredPi = expired?.stripe_payment_intent_id as string | null;
    if (expiredPi) paymentIntentIds.push(expiredPi);
    const expiredIntent = expiredPi ? await stripeRequest(`payment_intents/${expiredPi}`, {}, 'GET') : null;
    check('expired requests cannot be accepted and their holds are released',
      late.status === 409 && expired?.status === 'cancelled'
        && (expiredPi ? expiredIntent?.status === 'canceled' && !!expired.hold_released_at : !expired?.hold_released_at),
      `HTTP ${late.status}, extension=${expired?.status}`);
  }
  await endParent(expiryParent.id);

  const videoParent = await parent(student, tutor, { sessionType: 'video' });
  if (process.env.DAILY_API_KEY) {
    const request = await call('request-extension', student.token, { bookingId: videoParent.id, minutes: 30 });
    const id = typeof request.body.bookingId === 'string' ? request.body.bookingId : null;
    if (id) {
      bookingIds.push(id);
      const accepted = await call('respond-extension', tutor.token, { bookingId: id, accept: true });
      check('video extension acceptance extends the Daily room', accepted.status === 200, `HTTP ${accepted.status}`);
    } else check('video extension request is accepted', false, `HTTP ${request.status}`);
  } else {
    console.log('⏭️ SKIP Daily room extension: DAILY_API_KEY is not served');
  }
  await endParent(videoParent.id);
}

try {
  await run();
} finally {
  const parents = [...new Set(bookingIds)];
  if (process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
    for (const id of paymentIntentIds) {
      await stripeRequest(`payment_intents/${id}/cancel`, {}, 'POST').catch(() => {});
    }
  }
  if (parents.length) {
    await svc.from('bookings').delete().in('extends_booking_id', parents);
    await svc.from('bookings').delete().in('id', parents);
  }
  if (outsiderId) await svc.auth.admin.deleteUser(outsiderId);
  if (testStripeCustomerId && process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
    if (stripeStudentId) await svc.from('users').update({ stripe_customer_id: originalStripeCustomerId }).eq('id', stripeStudentId);
    await stripeRequest(`customers/${testStripeCustomerId}`, {}, 'DELETE').catch(() => {});
  }
  if (process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
    for (const customerId of extraTestCustomerIds) {
      await stripeRequest(`customers/${customerId}`, {}, 'DELETE').catch(() => {});
    }
  }
  if (stripeTutorId && changedTutorConnect) {
    await svc.from('tutor_profiles').update({
      stripe_connect_account_id: originalTutorConnectId,
      stripe_charges_enabled: originalTutorChargesEnabled,
      stripe_payouts_enabled: originalTutorPayoutsEnabled,
    }).eq('user_id', stripeTutorId);
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}
