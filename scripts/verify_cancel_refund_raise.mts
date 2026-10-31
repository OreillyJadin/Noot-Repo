// Verify cancel-booking's raise-only refund writes and Stripe-side refund handling.
// Needs the local Supabase stack, seeded demo users, and cancel-booking functions served.
import { createClient } from '@supabase/supabase-js';
import { studentFeeFor } from '../packages/core/src/index.ts';
import { DEV_PASSWORD } from './_devPassword.mjs';
import {
  cancelHold,
  captureHold,
  createManualCaptureIntent,
  getCharge,
  getPaymentIntent,
  listRefundsForCharge,
  refundCharge,
  stripeTestMode,
} from './_stripe_test.mts';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
if (!['127.0.0.1', 'localhost'].includes(new globalThis.URL(URL).hostname)) {
  throw new Error('verify_cancel_refund_raise only runs against local Supabase');
}
const ANON =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const results: { name: string; ok: boolean; detail: string }[] = [];
const bookingIds: string[] = [];
const paymentIntentIds: string[] = [];
const fixtureBaseTime = Date.now();
const price = 50;
const studentFee = studentFeeFor(price);
const creditApplied = 0;
const chargedCents =
  Math.round(price * 100) + Math.round(studentFee * 100) - Math.round(creditApplied * 100);

function check(name: string, ok: boolean, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function record(name: string, run: () => Promise<{ ok: boolean; detail: string }>) {
  try {
    const result = await run();
    check(name, result.ok, result.detail);
  } catch (error) {
    check(name, false, String(error));
  }
}

async function signIn(email: string) {
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: DEV_PASSWORD });
  if (error || !data.session || !data.user) {
    throw new Error(`${email} sign-in failed: ${error?.message ?? 'no session'}`);
  }
  return { id: data.user.id, token: data.session.access_token };
}

async function createBooking(options: {
  hoursAhead: number;
  paymentIntentId?: string | null;
  refundPercent?: number;
  refundStatus?: 'refunded' | 'not_refunded' | 'not_applicable';
  refundedCents?: number;
}, studentId: string, tutorId: string) {
  const scheduledAt = new Date(fixtureBaseTime + options.hoursAhead * 60 * 60 * 1000);
  const row: Record<string, unknown> = {
    student_id: studentId,
    tutor_id: tutorId,
    subject: 'MGT 300',
    scheduled_at: scheduledAt.toISOString(),
    duration_minutes: 30,
    price,
    student_fee: studentFee,
    credit_applied: creditApplied,
    platform_fee: studentFee,
    tutor_payout_amount: 41.25,
    session_type: 'in_person',
    location: 'Local verification',
    status: 'confirmed',
    cancellation_deadline: new Date(scheduledAt.getTime() - 12 * 60 * 60 * 1000).toISOString(),
    stripe_payment_intent_id: options.paymentIntentId ?? null,
  };
  if (options.refundPercent !== undefined) row.refund_percent = options.refundPercent;
  if (options.refundStatus !== undefined) row.refund_status = options.refundStatus;
  if (options.refundedCents !== undefined) row.refunded_cents = options.refundedCents;
  const { data, error } = await admin.from('bookings').insert(row).select('id').single();
  if (error || !data) throw new Error(`Could not create test booking: ${error?.message ?? 'no row returned'}`);
  bookingIds.push(data.id);
  return data.id as string;
}

async function cancelBooking(bookingId: string, token: string) {
  const response = await fetch(`${URL}/functions/v1/cancel-booking`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ bookingId }),
  });
  const body = await response.json().catch(() => ({}));
  const { data: booking, error } = await admin.from('bookings')
    .select('status, refund_percent, refund_status, refunded_cents, stripe_charge_id')
    .eq('id', bookingId)
    .single();
  if (error || !booking) throw new Error(`Could not read cancelled booking: ${error?.message ?? 'no row returned'}`);
  return { response, body, booking };
}

function cancellationResult(
  result: Awaited<ReturnType<typeof cancelBooking>>,
  expectedPercent: number,
  expectedStatus: string,
) {
  return result.response.status === 200 &&
    result.body.refundPercent === expectedPercent &&
    result.body.refundStatus === expectedStatus &&
    result.booking.status === 'cancelled' &&
    Number(result.booking.refund_percent) === expectedPercent &&
    result.booking.refund_status === expectedStatus;
}

try {
  const student = await signIn('student@crimson.ua.edu');
  const tutor = await signIn('sara@crimson.ua.edu');

  const databaseCases = [
    {
      name: 'webhook 100% wins over a tier-50 student cancellation',
      hoursAhead: 5,
      refundPercent: 100,
      refundStatus: 'refunded' as const,
      expectedPercent: 100,
      expectedStatus: 'refunded',
    },
    {
      name: 'webhook 100% wins over a tier-0 student cancellation',
      hoursAhead: 1,
      refundPercent: 100,
      refundStatus: 'refunded' as const,
      expectedPercent: 100,
      expectedStatus: 'refunded',
    },
    {
      name: 'tier-0 cancellation preserves refunded status at 0%',
      hoursAhead: 1.5,
      refundPercent: 0,
      refundStatus: 'refunded' as const,
      expectedPercent: 0,
      expectedStatus: 'refunded',
    },
    {
      name: 'tier-50 cancellation raises a webhook-recorded 30% to 50%',
      hoursAhead: 5.5,
      refundPercent: 30,
      refundStatus: 'refunded' as const,
      expectedPercent: 50,
      expectedStatus: 'refunded',
    },
    {
      name: 'control: tier-50 cancellation records 50%',
      hoursAhead: 6,
      expectedPercent: 50,
      expectedStatus: 'refunded',
    },
    {
      name: 'control: tier-0 cancellation records 0%',
      hoursAhead: 0.5,
      expectedPercent: 0,
      expectedStatus: 'not_refunded',
    },
  ];

  for (const testCase of databaseCases) {
    await record(testCase.name, async () => {
      const bookingId = await createBooking(testCase, student.id, tutor.id);
      const result = await cancelBooking(bookingId, student.token);
      return {
        ok: cancellationResult(result, testCase.expectedPercent, testCase.expectedStatus),
        detail: `HTTP ${result.response.status}, response ${result.body.refundPercent}/${result.body.refundStatus}, row ${result.booking.refund_percent}/${result.booking.refund_status}`,
      };
    });
  }

  if (!stripeTestMode()) {
    console.log('⏭️ SKIP Stripe cases: STRIPE_SECRET_KEY is not an sk_test_ key');
  } else {
    await record('released Stripe hold becomes a 100% refund without capture', async () => {
      const intent = await createManualCaptureIntent(chargedCents);
      paymentIntentIds.push(intent.id);
      const before = await getPaymentIntent(intent.id);
      const bookingId = await createBooking({ hoursAhead: 6.5, paymentIntentId: intent.id }, student.id, tutor.id);
      await cancelHold(intent.id);
      const afterRelease = await getPaymentIntent(intent.id);
      const result = await cancelBooking(bookingId, student.token);
      const afterCancel = await getPaymentIntent(intent.id);
      const ok = before.status === 'requires_capture' &&
        afterRelease.status === 'canceled' &&
        cancellationResult(result, 100, 'refunded') &&
        result.booking.stripe_charge_id === null &&
        afterCancel.status === 'canceled' &&
        afterCancel.amount_received === 0 &&
        result.booking.refunded_cents === chargedCents;
      return {
        ok,
        detail: `PI ${before.status} → ${afterRelease.status} → ${afterCancel.status}, HTTP ${result.response.status}, captured ${afterCancel.amount_received}c, refund=${result.booking.refund_percent}/${result.booking.refund_status}, refunded_cents=${result.booking.refunded_cents}`,
      };
    });

    await record('full capture with 40% refunded is topped up to 100% for tutor cancellation', async () => {
      const intent = await createManualCaptureIntent(chargedCents);
      paymentIntentIds.push(intent.id);
      const bookingId = await createBooking({ hoursAhead: 7, paymentIntentId: intent.id }, student.id, tutor.id);
      const capture = await captureHold(intent.id);
      if (!capture.latest_charge || typeof capture.latest_charge === 'string') {
        throw new Error('Full capture did not return an expanded charge');
      }
      const chargeId = capture.latest_charge.id;
      const firstRefund = await refundCharge(chargeId, Math.round(chargedCents * 0.4));
      const refundsBefore = await listRefundsForCharge(chargeId);
      const result = await cancelBooking(bookingId, tutor.token);
      const refundsAfter = await listRefundsForCharge(chargeId);
      const chargeAfter = await getCharge(chargeId);
      const addedRefunds = refundsAfter.filter((refund) => !refundsBefore.some((before) => before.id === refund.id));
      const rowOk = cancellationResult(result, 100, 'refunded') && result.booking.stripe_charge_id === chargeId;
      const ok = capture.status === 'succeeded' &&
        firstRefund.amount < chargedCents &&
        chargeAfter.amount_refunded === chargedCents &&
        addedRefunds.length === 1 &&
        addedRefunds[0]?.amount === chargedCents - firstRefund.amount &&
        result.booking.refunded_cents === chargedCents &&
        rowOk;
      return {
        ok,
        detail: `PI ${capture.status}, initial refund ${firstRefund.amount}c, final charge refunded ${chargeAfter.amount_refunded}/${chargedCents}c, new refunds ${addedRefunds.map((refund) => refund.amount).join(',')}c, HTTP ${result.response.status}, row ${result.booking.refund_percent}/${result.booking.refund_status}, refunded_cents=${result.booking.refunded_cents}`,
      };
    });

    await record('60% already refunded exceeds tier-50 target without another refund', async () => {
      const intent = await createManualCaptureIntent(chargedCents);
      paymentIntentIds.push(intent.id);
      const bookingId = await createBooking({ hoursAhead: 7.5, paymentIntentId: intent.id }, student.id, tutor.id);
      const capture = await captureHold(intent.id);
      if (!capture.latest_charge || typeof capture.latest_charge === 'string') {
        throw new Error('Full capture did not return an expanded charge');
      }
      const chargeId = capture.latest_charge.id;
      const initialRefund = await refundCharge(chargeId, Math.round(chargedCents * 0.6));
      const refundsBefore = await listRefundsForCharge(chargeId);
      const result = await cancelBooking(bookingId, student.token);
      const refundsAfter = await listRefundsForCharge(chargeId);
      const chargeAfter = await getCharge(chargeId);
      const ok = capture.status === 'succeeded' &&
        initialRefund.amount < chargedCents &&
        refundsAfter.length === refundsBefore.length &&
        chargeAfter.amount_refunded === initialRefund.amount &&
        cancellationResult(result, 60, 'refunded') &&
        result.booking.stripe_charge_id === chargeId &&
        result.booking.refunded_cents === initialRefund.amount;
      return {
        ok,
        detail: `PI ${capture.status}, initial/final refund ${initialRefund.amount}/${chargeAfter.amount_refunded}c, new refunds ${refundsAfter.length - refundsBefore.length}, HTTP ${result.response.status}, row ${result.booking.refund_percent}/${result.booking.refund_status}, refunded_cents=${result.booking.refunded_cents}`,
      };
    });

    await record('normal held PI tier-50 cancellation captures half', async () => {
      const intent = await createManualCaptureIntent(chargedCents);
      paymentIntentIds.push(intent.id);
      const bookingId = await createBooking({ hoursAhead: 8, paymentIntentId: intent.id }, student.id, tutor.id);
      const before = await getPaymentIntent(intent.id);
      const result = await cancelBooking(bookingId, student.token);
      const after = await getPaymentIntent(intent.id);
      const expectedCapture = Math.round(chargedCents / 2);
      const ok = before.status === 'requires_capture' &&
        after.status === 'succeeded' &&
        after.amount_received === expectedCapture &&
        cancellationResult(result, 50, 'refunded') &&
        Boolean(result.booking.stripe_charge_id) &&
        result.booking.refunded_cents === chargedCents - expectedCapture;
      return {
        ok,
        detail: `PI ${before.status} → ${after.status}, captured ${after.amount_received}/${expectedCapture}c, HTTP ${result.response.status}, row ${result.booking.refund_percent}/${result.booking.refund_status}, refunded_cents=${result.booking.refunded_cents}`,
      };
    });

    await record('tier-50 cancellation never lowers a larger recorded refunded_cents', async () => {
      const intent = await createManualCaptureIntent(chargedCents);
      paymentIntentIds.push(intent.id);
      const bookingId = await createBooking(
        { hoursAhead: 8.5, paymentIntentId: intent.id, refundedCents: chargedCents },
        student.id,
        tutor.id,
      );
      const result = await cancelBooking(bookingId, student.token);
      return {
        ok: cancellationResult(result, 50, 'refunded') && result.booking.refunded_cents === chargedCents,
        detail: `HTTP ${result.response.status}, refunded_cents ${chargedCents} → ${result.booking.refunded_cents}`,
      };
    });
  }
} catch (error) {
  check('verification setup', false, String(error));
} finally {
  for (const paymentIntentId of paymentIntentIds) {
    try {
      const intent = await getPaymentIntent(paymentIntentId);
      if (intent.status === 'requires_capture') await cancelHold(paymentIntentId);
    } catch (error) {
      console.error(`Stripe hold cleanup failed for ${paymentIntentId}: ${String(error)}`);
    }
  }
  if (bookingIds.length) {
    const { error } = await admin.from('bookings').delete().in('id', bookingIds);
    if (error) check('booking cleanup', false, error.message);
    else console.log(`🧹 cleaned up ${bookingIds.length} test bookings`);
  }
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
