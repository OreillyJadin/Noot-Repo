// Verify report-no-show's raise-only refund writes and Stripe-side refund handling.
// Needs the local Supabase stack, seeded demo users, and report-no-show functions served.
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
  throw new Error('verify_no_show_refund_raise only runs against local Supabase');
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
const chargeIds: string[] = [];
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
  paymentIntentId?: string | null;
  refundPercent?: number;
  refundStatus?: 'refunded' | 'not_refunded' | 'not_applicable';
  refundedCents?: number;
}, studentId: string, tutorId: string) {
  const slot = bookingIds.length;
  const scheduledAt = new Date(fixtureBaseTime - (3 + slot * 0.5) * 60 * 60 * 1000);
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

async function reportNoShow(bookingId: string, party: 'student' | 'tutor', token: string) {
  const response = await fetch(`${URL}/functions/v1/report-no-show`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ bookingId, party }),
  });
  const body = await response.json().catch(() => ({}));
  const { data: booking, error } = await admin.from('bookings')
    .select('status, no_show_party, refund_percent, refund_status, refunded_cents, stripe_charge_id, stripe_transfer_id')
    .eq('id', bookingId)
    .single();
  if (error || !booking) throw new Error(`Could not read no-show booking: ${error?.message ?? 'no row returned'}`);
  return { response, body, booking };
}

function noShowResult(
  result: Awaited<ReturnType<typeof reportNoShow>>,
  party: 'student' | 'tutor',
  expectedPercent: number,
  expectedStatus: string,
) {
  return result.response.status === 200 &&
    result.body.status === 'no_show' &&
    result.body.refundPercent === expectedPercent &&
    result.body.refundStatus === expectedStatus &&
    result.booking.status === 'no_show' &&
    result.booking.no_show_party === party &&
    Number(result.booking.refund_percent) === expectedPercent &&
    result.booking.refund_status === expectedStatus;
}

try {
  const student = await signIn('student@crimson.ua.edu');
  const tutor = await signIn('sara@crimson.ua.edu');

  const databaseCases = [
    {
      name: 'student no-show preserves webhook-recorded 100% refund',
      party: 'student' as const,
      reporter: tutor,
      refundPercent: 100,
      refundStatus: 'refunded' as const,
      expectedPercent: 100,
      expectedStatus: 'refunded',
    },
    {
      name: 'tutor no-show raises webhook-recorded 40% refund to 100%',
      party: 'tutor' as const,
      reporter: student,
      refundPercent: 40,
      refundStatus: 'refunded' as const,
      expectedPercent: 100,
      expectedStatus: 'refunded',
    },
    {
      name: 'control: student no-show records 0% and not_refunded',
      party: 'student' as const,
      reporter: tutor,
      expectedPercent: 0,
      expectedStatus: 'not_refunded',
    },
    {
      name: 'control: tutor no-show records 100% and refunded',
      party: 'tutor' as const,
      reporter: student,
      expectedPercent: 100,
      expectedStatus: 'refunded',
    },
  ];

  for (const testCase of databaseCases) {
    await record(testCase.name, async () => {
      const bookingId = await createBooking(testCase, student.id, tutor.id);
      const result = await reportNoShow(bookingId, testCase.party, testCase.reporter.token);
      return {
        ok: noShowResult(result, testCase.party, testCase.expectedPercent, testCase.expectedStatus),
        detail: `HTTP ${result.response.status}, response ${result.body.refundPercent}/${result.body.refundStatus}, row ${result.booking.refund_percent}/${result.booking.refund_status}, party=${result.booking.no_show_party}`,
      };
    });
  }

  if (!stripeTestMode()) {
    console.log('⏭️ SKIP Stripe cases: STRIPE_SECRET_KEY is not an sk_test_ key');
  } else {
    await record('released hold makes student no-show a 100% refund without Connect', async () => {
      const intent = await createManualCaptureIntent(chargedCents);
      paymentIntentIds.push(intent.id);
      const before = await getPaymentIntent(intent.id);
      const bookingId = await createBooking({ paymentIntentId: intent.id }, student.id, tutor.id);
      const { data: profile, error: profileError } = await admin.from('tutor_profiles')
        .select('stripe_connect_account_id')
        .eq('user_id', tutor.id)
        .single();
      if (profileError || !profile) {
        throw new Error(`Could not load tutor profile: ${profileError?.message ?? 'no row returned'}`);
      }
      const originalConnectId = profile.stripe_connect_account_id as string | null;
      if (originalConnectId) {
        const { error } = await admin.from('tutor_profiles')
          .update({ stripe_connect_account_id: null })
          .eq('user_id', tutor.id);
        if (error) throw new Error(`Could not disable Connect for released-hold check: ${error.message}`);
      }
      try {
        await cancelHold(intent.id);
        const released = await getPaymentIntent(intent.id);
        const result = await reportNoShow(bookingId, 'student', tutor.token);
        const ok = before.status === 'requires_capture' &&
          released.status === 'canceled' &&
          noShowResult(result, 'student', 100, 'refunded') &&
          result.booking.stripe_transfer_id === null &&
          result.booking.stripe_charge_id === null &&
          released.amount_received === 0 &&
          result.booking.refunded_cents === chargedCents;
        return {
          ok,
          detail: `PI ${before.status} → ${released.status}, HTTP ${result.response.status}, captured ${released.amount_received}c, transfer=${result.booking.stripe_transfer_id}, refund=${result.booking.refund_percent}/${result.booking.refund_status}, refunded_cents=${result.booking.refunded_cents}`,
        };
      } finally {
        if (originalConnectId) {
          const { error } = await admin.from('tutor_profiles')
            .update({ stripe_connect_account_id: originalConnectId })
            .eq('user_id', tutor.id);
          if (error) throw new Error(`Could not restore tutor Connect account: ${error.message}`);
        }
      }
    });

    await record('captured PI with 40% refunded is fully refunded for tutor no-show', async () => {
      const intent = await createManualCaptureIntent(chargedCents);
      paymentIntentIds.push(intent.id);
      const bookingId = await createBooking({ paymentIntentId: intent.id }, student.id, tutor.id);
      const capture = await captureHold(intent.id);
      if (!capture.latest_charge || typeof capture.latest_charge === 'string') {
        throw new Error('Full capture did not return an expanded charge');
      }
      const chargeId = capture.latest_charge.id;
      chargeIds.push(chargeId);
      const firstRefund = await refundCharge(chargeId, Math.round(chargedCents * 0.4));
      const refundsBefore = await listRefundsForCharge(chargeId);
      const result = await reportNoShow(bookingId, 'tutor', student.token);
      const refundsAfter = await listRefundsForCharge(chargeId);
      const chargeAfter = await getCharge(chargeId);
      const addedRefunds = refundsAfter.filter((refund) => !refundsBefore.some((before) => before.id === refund.id));
      const ok = capture.status === 'succeeded' &&
        firstRefund.amount < chargedCents &&
        chargeAfter.amount_refunded === chargedCents &&
        addedRefunds.length === 1 &&
        addedRefunds[0]?.amount === chargedCents - firstRefund.amount &&
        result.booking.stripe_charge_id === chargeId &&
        result.booking.refunded_cents === chargedCents &&
        noShowResult(result, 'tutor', 100, 'refunded');
      return {
        ok,
        detail: `PI ${capture.status}, initial refund ${firstRefund.amount}c, final charge refunded ${chargeAfter.amount_refunded}/${chargedCents}c, new refunds ${addedRefunds.map((refund) => refund.amount).join(',')}c, HTTP ${result.response.status}, row ${result.booking.refund_percent}/${result.booking.refund_status}, refunded_cents=${result.booking.refunded_cents}`,
      };
    });

    await record('normal held PI is canceled for tutor no-show', async () => {
      const intent = await createManualCaptureIntent(chargedCents);
      paymentIntentIds.push(intent.id);
      const bookingId = await createBooking({ paymentIntentId: intent.id }, student.id, tutor.id);
      const before = await getPaymentIntent(intent.id);
      const result = await reportNoShow(bookingId, 'tutor', student.token);
      const after = await getPaymentIntent(intent.id);
      const ok = before.status === 'requires_capture' &&
        after.status === 'canceled' &&
        noShowResult(result, 'tutor', 100, 'refunded') &&
        result.booking.stripe_transfer_id === null &&
        result.booking.refunded_cents === chargedCents;
      return {
        ok,
        detail: `PI ${before.status} → ${after.status}, HTTP ${result.response.status}, transfer=${result.booking.stripe_transfer_id}, row ${result.booking.refund_percent}/${result.booking.refund_status}, refunded_cents=${result.booking.refunded_cents}`,
      };
    });

    await record('tutor no-show never lowers a larger recorded refunded_cents', async () => {
      const intent = await createManualCaptureIntent(chargedCents);
      paymentIntentIds.push(intent.id);
      const recorded = chargedCents + 500;
      const bookingId = await createBooking({ paymentIntentId: intent.id, refundedCents: recorded }, student.id, tutor.id);
      const result = await reportNoShow(bookingId, 'tutor', student.token);
      return {
        ok: noShowResult(result, 'tutor', 100, 'refunded') && result.booking.refunded_cents === recorded,
        detail: `HTTP ${result.response.status}, refunded_cents ${recorded} → ${result.booking.refunded_cents}`,
      };
    });
  }
} catch (error) {
  check('verification setup', false, String(error));
} finally {
  for (const paymentIntentId of paymentIntentIds) {
    try {
      const intent = await getPaymentIntent(paymentIntentId);
      if (intent.status === 'requires_capture') {
        const result = await cancelHold(paymentIntentId);
        if (result.error) check(`cleanup hold ${paymentIntentId}`, false, result.error.message);
      } else if (intent.status === 'succeeded' && intent.latest_charge) {
        const chargeId = typeof intent.latest_charge === 'string'
          ? intent.latest_charge
          : intent.latest_charge.id;
        if (!chargeIds.includes(chargeId)) chargeIds.push(chargeId);
      }
    } catch (error) {
      check(`cleanup PaymentIntent ${paymentIntentId}`, false, String(error));
    }
  }
  for (const chargeId of chargeIds) {
    try {
      const charge = await getCharge(chargeId);
      const remaining = Math.max(0, charge.amount_captured - charge.amount_refunded);
      if (remaining > 0) await refundCharge(chargeId, remaining);
    } catch (error) {
      check(`cleanup charge ${chargeId}`, false, String(error));
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
