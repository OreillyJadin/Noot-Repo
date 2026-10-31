// Verify platform and Connect Stripe webhook handling against the LOCAL Supabase stack.
// Needs: supabase start, seed_demo.mjs, payments-webhook functions serve, and two
// distinct whsec_test_ values in STRIPE_WEBHOOK_SECRET / STRIPE_CONNECT_WEBHOOK_SECRET.
import { spawnSync } from 'node:child_process';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const URL = 'http://127.0.0.1:54321';
const WEBHOOK_URL = `${URL}/functions/v1/payments-webhook`;
const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const stripeKey = process.env.STRIPE_SECRET_KEY ?? '';
const platformSecret = process.env.STRIPE_WEBHOOK_SECRET ?? '';
const connectSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET ?? '';
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

let pass = 0;
let fail = 0;
function step(n: string | number, ok: boolean, message: string) {
  console.log(`${n}) ${ok ? 'PASS ✅' : 'FAIL ❌'} — ${message}`);
  ok ? pass++ : fail++;
}

function signature(secret: string, payload: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

function eventPayload(type: string, object: Record<string, unknown>, account?: string) {
  return JSON.stringify({
    id: `evt_verify_${randomBytes(8).toString('hex')}`,
    object: 'event',
    type,
    ...(account ? { account } : {}),
    data: { object },
  });
}

async function postPayload(payload: string, secret?: string) {
  return fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { 'stripe-signature': signature(secret, payload) } : {}),
    },
    body: payload,
  });
}

async function postEvent(
  type: string,
  object: Record<string, unknown>,
  secret: string,
  account?: string,
) {
  return postPayload(eventPayload(type, object, account), secret);
}

type TestCharge = {
  id: string; payment_intent: string; amount: number; amount_captured: number;
  amount_refunded: number; refunded: boolean;
};
const chargeRemainders = new Map<string, number>();

async function stripeRequest<T>(path: string, params?: Record<string, string>): Promise<T> {
  if (!stripeKey.startsWith('sk_test_')) throw new Error('Stripe test key required');
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: params ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${stripeKey}`, 'Stripe-Version': '2024-06-20',
      ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    ...(params ? { body: new URLSearchParams(params) } : {}),
  });
  if (!response.ok) throw new Error(`Stripe test request failed (${response.status})`);
  return await response.json() as T;
}

async function capturedCharge(amount: number, captured: number): Promise<TestCharge> {
  const pi = await stripeRequest<{ id: string }>('payment_intents', {
    amount: String(amount), currency: 'usd', capture_method: 'manual',
    payment_method: 'pm_card_visa', confirm: 'true',
    'automatic_payment_methods[enabled]': 'true', 'automatic_payment_methods[allow_redirects]': 'never',
    'metadata[purpose]': 'verify_payments_webhook',
  });
  const result = await stripeRequest<{ latest_charge: TestCharge }>(`payment_intents/${pi.id}/capture`, {
    amount_to_capture: String(captured), 'expand[]': 'latest_charge',
  });
  chargeRemainders.set(result.latest_charge.id, captured);
  return result.latest_charge;
}

async function refundCharge(charge: TestCharge, amount: number): Promise<TestCharge> {
  await stripeRequest('refunds', { charge: charge.id, amount: String(amount) });
  chargeRemainders.set(charge.id, chargeRemainders.get(charge.id)! - amount);
  return stripeRequest<TestCharge>(`charges/${charge.id}`);
}

async function createRecipientAccount(userId: string): Promise<string> {
  const response = await fetch('https://api.stripe.com/v2/core/accounts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `verify-payments-webhook-${randomUUID()}`,
      'Stripe-Version': '2026-09-30.endive',
    },
    body: JSON.stringify({
      contact_email: `webhook-verify-${Date.now()}@example.com`,
      dashboard: 'express',
      identity: { country: 'us', entity_type: 'individual' },
      defaults: {
        responsibilities: {
          fees_collector: 'application',
          losses_collector: 'application',
        },
      },
      configuration: {
        recipient: {
          capabilities: {
            stripe_balance: { stripe_transfers: { requested: true } },
          },
        },
      },
      metadata: { user_id: userId },
      include: ['configuration.recipient', 'requirements'],
    }),
  });
  const body = await response.json() as { id?: string };
  if (!response.ok || !body.id) {
    throw new Error(`Stripe test account creation failed (${response.status})`);
  }
  return body.id;
}

function runSql(sql: string) {
  const result = spawnSync(
    'psql',
    ['postgresql://postgres:postgres@127.0.0.1:54322/postgres', '-v', 'ON_ERROR_STOP=1', '-c', sql],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(`local trigger SQL failed: ${result.stderr.trim() || result.error?.message || result.status}`);
  }
}

async function setRefundPercent(bookingId: string, refundPercent: number) {
  const { error } = await admin.from('bookings').update({ refund_percent: refundPercent }).eq('id', bookingId);
  if (error) throw error;
}

async function readRefundPercent(bookingId: string): Promise<number> {
  const { data, error } = await admin.from('bookings').select('refund_percent').eq('id', bookingId).single();
  if (error || !data) throw error ?? new Error('booking refund percent missing');
  return Number(data.refund_percent);
}

async function readRefundedCents(bookingId: string): Promise<number | null> {
  const { data, error } = await admin.from('bookings').select('refunded_cents').eq('id', bookingId).single();
  if (error || !data) throw error ?? new Error('booking refunded cents missing');
  return data.refunded_cents;
}

const dropFailureTriggers = () => runSql(`
  DROP TRIGGER IF EXISTS verify_payments_webhook_fail_tutor_update ON public.tutor_profiles;
  DROP FUNCTION IF EXISTS public.verify_payments_webhook_fail_tutor_update();
  DROP TRIGGER IF EXISTS verify_payments_webhook_fail_booking_update ON public.bookings;
  DROP FUNCTION IF EXISTS public.verify_payments_webhook_fail_booking_update();
  DROP TRIGGER IF EXISTS verify_payments_webhook_fail_cents_update ON public.bookings;
  DROP FUNCTION IF EXISTS public.verify_payments_webhook_fail_cents_update();
`);

const profileTrigger = `
  CREATE OR REPLACE FUNCTION public.verify_payments_webhook_fail_tutor_update()
  RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    RAISE EXCEPTION 'forced webhook verification failure';
  END;
  $$;
  CREATE TRIGGER verify_payments_webhook_fail_tutor_update
  BEFORE UPDATE ON public.tutor_profiles
  FOR EACH ROW EXECUTE FUNCTION public.verify_payments_webhook_fail_tutor_update();
`;

const bookingTrigger = `
  CREATE OR REPLACE FUNCTION public.verify_payments_webhook_fail_booking_update()
  RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    RAISE EXCEPTION 'forced webhook verification failure';
  END;
  $$;
  CREATE TRIGGER verify_payments_webhook_fail_booking_update
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.verify_payments_webhook_fail_booking_update();
`;

let accountId: string | null = null;
let tutorId: string | null = null;
let originalProfile: {
  stripe_connect_account_id: string | null;
  stripe_charges_enabled: boolean;
  stripe_payouts_enabled: boolean;
  stripe_onboarded_at: string | null;
} | null = null;
let bookingId: string | null = null;

try {
  if (!stripeKey.startsWith('sk_test_')) {
    throw new Error('refusing to use Stripe unless STRIPE_SECRET_KEY starts with sk_test_');
  }
  if (!platformSecret.startsWith('whsec_test_') ||
    !connectSecret.startsWith('whsec_test_') ||
    platformSecret === connectSecret) {
    throw new Error('set distinct platform and Connect whsec_test_ signing secrets in the environment');
  }

  const { data: tutor, error: tutorError } = await admin
    .from('users')
    .select('id')
    .eq('email', 'sara@crimson.ua.edu')
    .single();
  if (tutorError || !tutor) throw new Error('seed tutor not found; run seed_demo.mjs first');
  tutorId = tutor.id as string;

  const { data: profile, error: profileError } = await admin
    .from('tutor_profiles')
    .select('stripe_connect_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_onboarded_at')
    .eq('user_id', tutorId)
    .single();
  if (profileError || !profile) throw new Error('seed tutor profile not found');
  originalProfile = profile;

  const piSuccess = await postEvent(
    'payment_intent.succeeded',
    { id: `pi_verify_${randomBytes(8).toString('hex')}`, object: 'payment_intent', amount: 1000 },
    platformSecret,
  );
  step(1, piSuccess.status === 200, `platform payment_intent.succeeded → ${piSuccess.status}`);

  const unknownRefund = await postEvent(
    'charge.refunded',
    {
      id: `ch_verify_${randomBytes(8).toString('hex')}`,
      object: 'charge',
      payment_intent: `pi_unknown_${randomBytes(8).toString('hex')}`,
      amount_captured: 1000,
      amount_refunded: 1000,
      refunded: true,
      refunds: { data: [] },
    },
    platformSecret,
  );
  step(2, unknownRefund.status === 200, `platform charge.refunded for unknown PaymentIntent → ${unknownRefund.status}`);

  const unknownBody = eventPayload('payment_intent.succeeded', {
    id: `pi_verify_${randomBytes(8).toString('hex')}`,
    object: 'payment_intent',
  });
  const wrongSecretStatus = await postPayload(unknownBody, `whsec_test_${randomBytes(24).toString('hex')}`);
  step('3a', wrongSecretStatus.status === 400, `signature from an unconfigured secret → ${wrongSecretStatus.status}`);
  const missingSignatureStatus = await (await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: unknownBody,
  })).status;
  step('3b', missingSignatureStatus === 400, `missing stripe-signature → ${missingSignatureStatus}`);

  const beforeNoop = {
    stripe_connect_account_id: profile.stripe_connect_account_id,
    stripe_charges_enabled: profile.stripe_charges_enabled,
    stripe_payouts_enabled: profile.stripe_payouts_enabled,
  };
  const connectNoop = await postEvent(
    'charge.succeeded',
    { id: `ch_verify_${randomBytes(8).toString('hex')}`, object: 'charge' },
    connectSecret,
    `acct_verify_noop_${randomBytes(8).toString('hex')}`,
  );
  const { data: afterNoop, error: afterNoopError } = await admin
    .from('tutor_profiles')
    .select('stripe_connect_account_id, stripe_charges_enabled, stripe_payouts_enabled')
    .eq('user_id', tutorId)
    .single();
  step(4, connectNoop.status === 200 && !afterNoopError &&
    JSON.stringify(afterNoop) === JSON.stringify(beforeNoop),
  `Connect charge.succeeded → ${connectNoop.status}; tutor profile unchanged`);

  accountId = await createRecipientAccount(tutorId);
  const { error: linkError } = await admin
    .from('tutor_profiles')
    .update({
      stripe_connect_account_id: accountId,
      stripe_charges_enabled: true,
      stripe_payouts_enabled: true,
    })
    .eq('user_id', tutorId);
  if (linkError) throw new Error('could not link test account to seed tutor');

  const accountEvent = eventPayload('account.updated', {
    id: accountId,
    object: 'account',
  }, accountId);
  const accountUpdated = await postPayload(accountEvent, connectSecret);
  const { data: accountCache, error: cacheError } = await admin
    .from('tutor_profiles')
    .select('stripe_charges_enabled, stripe_payouts_enabled')
    .eq('user_id', tutorId)
    .single();
  step(5, accountUpdated.status === 200 && !cacheError &&
    accountCache?.stripe_charges_enabled === false &&
    accountCache?.stripe_payouts_enabled === false,
  `Connect account.updated → ${accountUpdated.status}; fresh account cached false/false`);

  const platformAccountUpdate = await postEvent(
    'account.updated',
    { id: `acct_verify_platform_${randomBytes(8).toString('hex')}`, object: 'account' },
    platformSecret,
  );
  step('6a', platformAccountUpdate.status === 200,
    `platform account.updated with no tutor profile → ${platformAccountUpdate.status}`);

  const unknownConnectAccount = `acct_verify_unknown_${randomBytes(8).toString('hex')}`;
  const unknownConnectUpdate = await postEvent(
    'account.updated',
    { id: unknownConnectAccount, object: 'account' },
    connectSecret,
    unknownConnectAccount,
  );
  step('6b', unknownConnectUpdate.status === 200,
    `Connect account.updated for unknown account → ${unknownConnectUpdate.status}`);

  runSql(profileTrigger);
  const forcedProfileFailure = await postPayload(accountEvent, connectSecret);
  step(7, forcedProfileFailure.status === 500,
    `forced tutor_profiles UPDATE failure → ${forcedProfileFailure.status}`);
  dropFailureTriggers();
  const profileRetry = await postPayload(accountEvent, connectSecret);
  step('7 retry', profileRetry.status === 200,
    `redelivered account.updated after DB recovery → ${profileRetry.status}`);

  const { data: student, error: studentError } = await admin
    .from('users')
    .select('id')
    .eq('email', 'student@crimson.ua.edu')
    .single();
  if (studentError || !student) throw new Error('seed student not found; run seed_demo.mjs first');
  const { data: booking, error: bookingError } = await admin
    .from('bookings')
    .insert({
      student_id: student.id,
      tutor_id: tutorId,
      subject: 'MGT 300',
      scheduled_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      duration_minutes: 60,
      price: 28,
      platform_fee: 4.9,
      tutor_payout_amount: 23.1,
      session_type: 'in_person',
      status: 'confirmed',
      cancellation_deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    .select('id')
    .single();
  if (bookingError || !booking) throw new Error('could not create isolated booking for seeded demo users');
  bookingId = booking.id as string;

  const verifyPi = `pi_verify_${randomBytes(12).toString('hex')}`;
  const { error: piLinkError } = await admin
    .from('bookings')
    .update({ stripe_payment_intent_id: verifyPi })
    .eq('id', bookingId);
  if (piLinkError) throw new Error('could not link verification PaymentIntent to booking');

  const refundedEvent = eventPayload('charge.refunded', {
    id: `ch_verify_${randomBytes(8).toString('hex')}`,
    object: 'charge',
    payment_intent: verifyPi,
    amount: 1000,
    amount_captured: 1000,
    amount_refunded: 1000,
    refunded: true,
    refunds: { data: [] },
  });
  const refundOne = await postPayload(refundedEvent, platformSecret);
  const refundTwo = await postPayload(refundedEvent, platformSecret);
  const { data: refundCache, error: refundCacheError } = await admin
    .from('bookings')
    .select('refund_status, refund_percent, refunded_cents')
    .eq('id', bookingId)
    .single();
  step(8, refundOne.status === 200 && refundTwo.status === 200 &&
    !refundCacheError && refundCache?.refund_status === 'refunded' && refundCache.refund_percent === 100 && refundCache.refunded_cents === 1000,
  `charge.refunded delivered twice → ${refundOne.status}, ${refundTwo.status}; status=${refundCache?.refund_status}, percent=${refundCache?.refund_percent}`);

  await setRefundPercent(bookingId, 0);
  await admin.from('bookings').update({ refunded_cents: null }).eq('id', bookingId).throwOnError();
  let fullCharge = await capturedCharge(2000, 2000);
  await admin.from('bookings').update({ stripe_payment_intent_id: fullCharge.payment_intent }).eq('id', bookingId).throwOnError();
  fullCharge = await refundCharge(fullCharge, 500);
  const partialRefundEvent = eventPayload('charge.refunded', fullCharge);
  const partialOne = await postPayload(partialRefundEvent, platformSecret);
  const partialTwo = await postPayload(partialRefundEvent, platformSecret);
  let refundPercent = await readRefundPercent(bookingId);
  step('9a', partialOne.status === 200 && partialTwo.status === 200 && refundPercent === 25 && await readRefundedCents(bookingId) === 500,
    `500 of 2000 refunded, delivered twice → ${partialOne.status}, ${partialTwo.status}; percent=${refundPercent}`);

  fullCharge = await refundCharge(fullCharge, 500);
  const cumulativeRefundEvent = eventPayload('charge.refunded', fullCharge);
  const cumulativeRefund = await postPayload(cumulativeRefundEvent, platformSecret);
  refundPercent = await readRefundPercent(bookingId);
  step('9b', cumulativeRefund.status === 200 && refundPercent === 50 && await readRefundedCents(bookingId) === 1000,
    `cumulative refund of 1000 → ${cumulativeRefund.status}; percent=${refundPercent}`);

  const staleRefund = await postPayload(partialRefundEvent, platformSecret);
  refundPercent = await readRefundPercent(bookingId);
  step('9c', staleRefund.status === 200 && refundPercent === 50 && await readRefundedCents(bookingId) === 1000,
    `stale 500 refund redelivery → ${staleRefund.status}; percent=${refundPercent}`);

  await setRefundPercent(bookingId, 100);
  const higherRefund = await postPayload(cumulativeRefundEvent, platformSecret);
  refundPercent = await readRefundPercent(bookingId);
  step('9d', higherRefund.status === 200 && refundPercent === 100,
    `cumulative refund after app-set 100% → ${higherRefund.status}; percent=${refundPercent}`);

  await admin.from('bookings').update({ refunded_cents: null }).eq('id', bookingId).throwOnError();
  let oddCharge = await capturedCharge(3510, 3510);
  await admin.from('bookings').update({ stripe_payment_intent_id: oddCharge.payment_intent }).eq('id', bookingId).throwOnError();
  oddCharge = await refundCharge(oddCharge, 1000);
  const oddRefund = await postEvent('charge.refunded', oddCharge, platformSecret);
  const oddCents = await readRefundedCents(bookingId);
  step('9d exact cents', oddRefund.status === 200 && oddCents === 1000,
    `1000 of 3510 → ${oddRefund.status}; refunded cents=${oddCents}`);

  await setRefundPercent(bookingId, 50);
  const { error: creditSpendError } = await admin.from('credit_ledger').insert({
    user_id: student.id,
    amount_cents: -1000,
    kind: 'booking_spend',
    booking_id: bookingId,
  });
  if (creditSpendError) throw new Error(`could not create booking credit spend: ${creditSpendError.message}`);

  let halfCharge = await capturedCharge(3510, 1755);
  await admin.from('bookings').update({ stripe_payment_intent_id: halfCharge.payment_intent }).eq('id', bookingId).throwOnError();
  halfCharge = await refundCharge(halfCharge, 1000);
  const partialCaptureEvent = eventPayload('charge.refunded', halfCharge);
  const partialCaptureRefund = await postPayload(partialCaptureEvent, platformSecret);
  refundPercent = await readRefundPercent(bookingId);
  const { data: partialReturns, error: partialReturnsError } = await admin
    .from('credit_ledger')
    .select('amount_cents')
    .eq('booking_id', bookingId)
    .eq('kind', 'booking_return');
  const partialCreditReturned = (partialReturns ?? []).reduce((sum, row) => sum + Number(row.amount_cents), 0);
  step('9e', partialCaptureRefund.status === 200 && refundPercent === 78 && await readRefundedCents(bookingId) === 2755 &&
    !partialReturnsError && partialCreditReturned === 780,
  `partial capture/refund → ${partialCaptureRefund.status}; percent=${refundPercent}, credit=${partialCreditReturned}`);
  step('9f partial credit', !partialReturnsError && partialCreditReturned === 780,
    `78% refund returned ${partialCreditReturned} of 1000 Noot credit cents`);

  for (const amount_refunded of [1000, 2755]) {
    const response = await postEvent('charge.refunded', { ...halfCharge, amount_refunded }, platformSecret);
    step('9e both shapes', response.status === 200 && await readRefundPercent(bookingId) === 78 && await readRefundedCents(bookingId) === 2755,
      `3510 authorized / 1755 captured / 1000 actual refund; amount_refunded=${amount_refunded} → 78%`);
  }

  const lookupFailure = await postEvent('charge.refunded', { ...halfCharge, id: 'ch_verify_missing' }, platformSecret);
  step('9e retryable lookup', lookupFailure.status === 500 && await readRefundPercent(bookingId) === 78,
    `missing charge refund lookup → ${lookupFailure.status}, refund share unchanged`);

  halfCharge = await refundCharge(halfCharge, 755);
  const fullPartialCaptureEvent = eventPayload('charge.refunded', halfCharge);
  const fullPartialCaptureRefund = await postPayload(fullPartialCaptureEvent, platformSecret);
  refundPercent = await readRefundPercent(bookingId);
  const { data: fullReturns, error: fullReturnsError } = await admin
    .from('credit_ledger')
    .select('amount_cents')
    .eq('booking_id', bookingId)
    .eq('kind', 'booking_return');
  const fullCreditReturned = (fullReturns ?? []).reduce((sum, row) => sum + Number(row.amount_cents), 0);
  step('9f full credit', fullPartialCaptureRefund.status === 200 && refundPercent === 100 && await readRefundedCents(bookingId) === 3510 &&
    !fullReturnsError && fullCreditReturned === 1000,
  `full cumulative refund → ${fullPartialCaptureRefund.status}; percent=${refundPercent}, credit=${fullCreditReturned}`);

  await admin.from('bookings').update({ refunded_cents: null }).eq('id', bookingId).throwOnError();
  runSql(`
    CREATE FUNCTION public.verify_payments_webhook_fail_cents_update() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'forced cents update failure'; END;
    $$;
    CREATE TRIGGER verify_payments_webhook_fail_cents_update BEFORE UPDATE OF refunded_cents ON public.bookings
    FOR EACH ROW EXECUTE FUNCTION public.verify_payments_webhook_fail_cents_update();
  `);
  const forcedCentsFailure = await postPayload(fullPartialCaptureEvent, platformSecret);
  step('9g cents failure', forcedCentsFailure.status === 500 && await readRefundedCents(bookingId) === null,
    `forced cents UPDATE failure → ${forcedCentsFailure.status}`);
  dropFailureTriggers();
  const centsRetry = await postPayload(fullPartialCaptureEvent, platformSecret);
  step('9g cents retry', centsRetry.status === 200 && await readRefundedCents(bookingId) === 3510,
    `redelivery after cents failure → ${centsRetry.status}`);

  runSql(bookingTrigger);
  const forcedBookingFailure = await postPayload(fullPartialCaptureEvent, platformSecret);
  step('8 retryable failure', forcedBookingFailure.status === 500,
    `forced bookings UPDATE failure → ${forcedBookingFailure.status}`);
} catch (error) {
  fail++;
  console.error(`Setup/test error: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  try {
    dropFailureTriggers();
  } catch (error) {
    step('cleanup triggers', false, error instanceof Error ? error.message : String(error));
  }

  if (tutorId && originalProfile) {
    const { error } = await admin
      .from('tutor_profiles')
      .update({
        stripe_connect_account_id: originalProfile.stripe_connect_account_id,
        stripe_charges_enabled: originalProfile.stripe_charges_enabled,
        stripe_payouts_enabled: originalProfile.stripe_payouts_enabled,
        stripe_onboarded_at: originalProfile.stripe_onboarded_at,
      })
      .eq('user_id', tutorId);
    step('cleanup tutor', !error, error ? 'could not restore original tutor profile' : 'restored original tutor profile');
  }

  if (bookingId) {
    const { error: ledgerError } = await admin.from('credit_ledger').delete().eq('booking_id', bookingId);
    step('cleanup ledger', !ledgerError, ledgerError ? 'could not remove temporary credit ledger rows' : 'removed temporary credit ledger rows');
    const { error } = await admin.from('bookings').delete().eq('id', bookingId);
    step('cleanup booking', !error, error ? 'could not remove temporary booking' : 'removed temporary booking');
  }

  if (accountId) {
    const response = await fetch(`https://api.stripe.com/v1/accounts/${encodeURIComponent(accountId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${stripeKey}` },
    });
    step('cleanup Stripe account', response.ok,
      response.ok ? 'deleted test recipient account' : `Stripe returned ${response.status}`);
  }

  for (const [id, remaining] of chargeRemainders) {
    if (remaining <= 0) continue;
    try {
      await stripeRequest('refunds', { charge: id, amount: String(remaining) });
      step('cleanup charge', true, 'refunded remaining test capture');
    } catch {
      step('cleanup charge', false, `could not refund remaining test capture ${id}`);
    }
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
