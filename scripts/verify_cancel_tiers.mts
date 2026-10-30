// Verify cancellation refund tiers and authorization against the LOCAL stack.
// Needs: SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io supabase start && node supabase/seed_demo.mjs
import { DEV_PASSWORD } from './_devPassword.mjs';
import { createClient } from '@supabase/supabase-js';
import { api, auth, initSupabase, studentFeeFor } from '../packages/core/src/index.ts';
import { authorizeHold, cancelHold, getPaymentIntent, stripeTestMode } from './_stripe_test.mts';
import { bookingTime, createBookingTutor } from './_booking_test.mts';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
if (!['127.0.0.1', 'localhost'].includes(new globalThis.URL(URL).hostname)) {
  throw new Error('verify_cancel_tiers only runs against local Supabase');
}
const ANON =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
initSupabase({ url: URL, anonKey: ANON });
const results: { name: string; ok: boolean; detail?: string }[] = [];
const ids: string[] = [];
let feeStudentId = '';
let feePaymentIntentId = '';
let tutorFixture: Awaited<ReturnType<typeof createBookingTutor>> | undefined;

function check(name: string, ok: boolean, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function signIn(email: string) {
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: DEV_PASSWORD });
  if (error || !data.session) throw new Error(`${email} sign-in failed: ${error?.message ?? 'no session'}`);
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) throw new Error(`${email} getUser failed: ${userError?.message ?? 'no user'}`);
  return { id: userData.user.id, token: data.session.access_token };
}

async function createBooking(studentId: string, tutorId: string, hoursUntil: number) {
  const scheduledAt = new Date(Date.now() + hoursUntil * 60 * 60 * 1000);
  const { data, error } = await admin
    .from('bookings')
    .insert({
      student_id: studentId,
      tutor_id: tutorId,
      subject: 'MGT 300',
      scheduled_at: scheduledAt.toISOString(),
      duration_minutes: 60,
      price: 50,
      platform_fee: 8.75,
      tutor_payout_amount: 41.25,
      session_type: 'in_person',
      location: 'Local verification',
      status: 'confirmed',
      cancellation_deadline: new Date(scheduledAt.getTime() - 12 * 60 * 60 * 1000).toISOString(),
      refund_status: 'not_applicable',
      stripe_payment_intent_id: null,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`Could not create test booking: ${error?.message ?? 'no row returned'}`);
  ids.push(data.id);
  return data.id as string;
}

async function cancel(bookingId: string, token: string) {
  const response = await fetch(`${URL}/functions/v1/cancel-booking`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ bookingId }),
  });
  const body = await response.json();
  return { response, body };
}

async function verifyRefund(name: string, bookingId: string, token: string, expected: number, actorRole: 'student' | 'tutor' = 'student') {
  const { response, body } = await cancel(bookingId, token);
  const { data: row, error } = await admin
    .from('bookings')
    .select('status, refund_percent, stripe_charge_id, stripe_transfer_id, payout_failed_at,cancelled_by_role,cancelled_from_status')
    .eq('id', bookingId)
    .single();
  const ok =
    response.ok &&
    body.refundPercent === expected &&
    row?.status === 'cancelled' &&
    row?.refund_percent === expected &&
    !row?.stripe_charge_id &&
    !row?.stripe_transfer_id &&
    !row?.payout_failed_at &&
    row?.cancelled_by_role === actorRole &&
    row?.cancelled_from_status === 'confirmed' &&
    !error;
  check(name, ok, `HTTP ${response.status}, response refund=${body.refundPercent}, row refund=${row?.refund_percent}${error ? `, DB error=${error.message}` : ''}`);
}

try {
  if (!stripeTestMode()) throw new Error('STRIPE_SECRET_KEY must be an sk_test_ key to verify partial capture');
  const student = await signIn('student@crimson.ua.edu');
  const tutor = await signIn('sara@crimson.ua.edu');
  const outsider = await signIn('devon@crimson.ua.edu');
  const bookings = [
    { id: await createBooking(student.id, tutor.id, 13), hours: 13, refund: 100 },
    { id: await createBooking(student.id, tutor.id, 5), hours: 5, refund: 50 },
    { id: await createBooking(student.id, tutor.id, 1), hours: 1, refund: 0 },
  ];

  for (const booking of bookings) {
    await verifyRefund(`student cancel at +${booking.hours}h returns ${booking.refund}%`, booking.id, student.token, booking.refund);
  }

  tutorFixture = await createBookingTutor(admin, 'cancel-tier-tutor');

  const feeEmail = `cancel-tier-fee-${Date.now()}@crimson.ua.edu`;
  const feePassword = 'NootVerify!39_Cancel';
  const feeAccount = await admin.auth.admin.createUser({
    email: feeEmail,
    password: feePassword,
    email_confirm: true,
  });
  if (feeAccount.error || !feeAccount.data.user) throw feeAccount.error ?? new Error('Could not create fee test student');
  feeStudentId = feeAccount.data.user.id;
  const { error: feeDobError } = await admin.from('users')
    .update({ date_of_birth: '2000-01-15' })
    .eq('id', feeStudentId);
  if (feeDobError) throw feeDobError;
  const sessionPrice = tutorFixture.hourlyRate;
  const sessionCents = Math.round(sessionPrice * 100);
  const feeCents = Math.round(studentFeeFor(sessionPrice) * 100);
  const totalCents = sessionCents + feeCents;
  const expectedChargeCents = Math.max(100, Math.floor(feeCents / 2));
  const creditCents = totalCents - expectedChargeCents;
  const { error: creditError } = await admin.from('credit_ledger').insert({
    user_id: feeStudentId,
    amount_cents: creditCents,
    kind: 'adjustment',
  });
  if (creditError) throw creditError;

  const studentLogin = await auth.signInWithPassword(feeEmail, feePassword);
  if (!studentLogin.ok) throw new Error(String(studentLogin.error));
  const scheduledAt = bookingTime(5);
  const pi = await api.createPaymentIntent({
    tutorId: tutorFixture.id,
    courseCode: tutorFixture.courseCode,
    durationMinutes: 60,
    scheduledAt,
  });
  feePaymentIntentId = pi.paymentIntentId;
  const authorized = await authorizeHold(pi.paymentIntentId);
  check('test checkout holds session price + service fee − credit',
    pi.amountCents === totalCents && pi.studentFeeCents === feeCents &&
      pi.creditCents === creditCents && pi.chargeCents === expectedChargeCents &&
      authorized?.status === 'requires_capture',
    `${pi.amountCents}c total, ${pi.studentFeeCents}c fee, ${pi.creditCents}c credit, ${pi.chargeCents}c held`);

  const feeBooking = await api.bookings.confirm({
    tutorId: tutorFixture.id,
    courseCode: tutorFixture.courseCode,
    scheduledAt,
    durationMinutes: 60,
    sessionType: 'in_person',
    paymentIntentId: pi.paymentIntentId,
  });
  ids.push(feeBooking.bookingId);
  const tutorLogin = await auth.signInWithPassword(tutorFixture.email, DEV_PASSWORD);
  if (!tutorLogin.ok) throw new Error(String(tutorLogin.error));
  await api.bookings.respond({ bookingId: feeBooking.bookingId, action: 'accept' });
  const studentAgain = await auth.signInWithPassword(feeEmail, feePassword);
  if (!studentAgain.ok) throw new Error(String(studentAgain.error));
  const cancelResult = await api.bookings.cancel(feeBooking.bookingId);
  const capturedPi = await getPaymentIntent(pi.paymentIntentId);
  const { data: feeBookingRow } = await admin.from('bookings')
    .select('price,student_fee,credit_applied,cancelled_by_role,cancelled_from_status')
    .eq('id', feeBooking.bookingId).single();
  const chargedCents =
    Math.round(Number(feeBookingRow!.price) * 100) +
    Math.round(Number(feeBookingRow!.student_fee) * 100) -
    Math.round(Number(feeBookingRow!.credit_applied) * 100);
  const expectedCaptureCents = Math.round(chargedCents / 2);
  check('50% cancellation captures half of price + service fee − credit',
    cancelResult.refundPercent === 50 && capturedPi.amount_received === expectedCaptureCents &&
      Number(feeBookingRow!.student_fee) === feeCents / 100 &&
      Number(feeBookingRow!.credit_applied) === creditCents / 100 &&
      feeBookingRow!.cancelled_by_role === 'student' &&
      feeBookingRow!.cancelled_from_status === 'confirmed',
    `${capturedPi.amount_received}c captured; expected ${expectedCaptureCents}c from ${chargedCents}c charged`);

  const tutorCancelId = await createBooking(student.id, tutor.id, 1);
  await verifyRefund('tutor cancel at +1h returns 100%', tutorCancelId, tutor.token, 100, 'tutor');

  const unauthorized = await cancel(bookings[0]!.id, outsider.token);
  check('third user cannot cancel a booking (403)', unauthorized.response.status === 403, `HTTP ${unauthorized.response.status}`);
} finally {
  if (ids.length) {
    const { error } = await admin.from('bookings').delete().in('id', ids);
    if (error) console.error(`Test booking cleanup failed: ${error.message}`);
    else console.log(`🧹 cleaned up ${ids.length} test bookings`);
  }
  if (feeStudentId) {
    const { error } = await admin.auth.admin.deleteUser(feeStudentId);
    if (error) console.error(`Test student cleanup failed: ${error.message}`);
  }
  if (feePaymentIntentId.startsWith('pi_')) {
    const payment = await getPaymentIntent(feePaymentIntentId);
    if (payment.status === 'requires_capture') await cancelHold(feePaymentIntentId);
  }
  await tutorFixture?.cleanup();
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
