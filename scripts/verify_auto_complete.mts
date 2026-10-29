// Verify expired-hold handling, scheduled session completion, and account deletion guards
// against the local Supabase stack. Requires functions serve with a test-mode Stripe key.
//   pnpm dlx tsx scripts/verify_auto_complete.mts
import { createClient } from '@supabase/supabase-js';
import { DEV_PASSWORD } from './_devPassword.mjs';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY ?? '';

if (!STRIPE_KEY.startsWith('sk_test_')) {
  throw new Error('STRIPE_SECRET_KEY must be a test-mode key');
}

type Json = Record<string, any>;
type Role = 'student' | 'tutor';
type TestUser = { id: string; email: string; token: string };

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  ok ? passed++ : failed++;
};

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });
const userIds: string[] = [];
const bookingIds: string[] = [];
const stamp = Date.now();
let emailSequence = 0;

async function makeUser(role: Role): Promise<TestUser> {
  emailSequence += 1;
  const email = `autocompletereview-${stamp}-${emailSequence}@crimson.ua.edu`;
  const { data, error } = await svc.auth.admin.createUser({
    email,
    password: DEV_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error('Could not create verification user');
  const id = data.user.id;
  userIds.push(id);

  const now = new Date().toISOString();
  const { error: updateError } = await svc.from('users').update({
    first_name: `Verify ${role}`,
    last_name: 'Auto Complete',
    date_of_birth: '2000-01-15',
    password_set_at: now,
    terms_accepted_at: now,
    terms_version: '2026-09-17',
    guidelines_accepted_at: now,
    guidelines_version: '2026-10-13',
  }).eq('id', id);
  if (updateError) throw new Error('Could not prepare verification user');

  const { error: roleError } = await svc.from('user_roles').upsert(
    { user_id: id, role },
    { onConflict: 'user_id,role' },
  );
  if (roleError) throw new Error('Could not assign verification user role');

  const anon = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: session, error: signInError } = await anon.auth.signInWithPassword({
    email,
    password: DEV_PASSWORD,
  });
  if (signInError || !session.session) throw new Error('Could not sign in verification user');
  return { id, email, token: session.session.access_token };
}

async function makeBooking(
  student: TestUser,
  tutor: TestUser,
  options: {
    scheduledAt: string;
    price?: number;
    paymentIntentId?: string | null;
    disputeStatus?: 'none' | 'flagged';
    createdAt?: string;
  },
): Promise<string> {
  const price = options.price ?? 0;
  const scheduledAt = options.scheduledAt;
  const { data, error } = await svc.from('bookings').insert({
    student_id: student.id,
    tutor_id: tutor.id,
    subject: 'MGT 300',
    scheduled_at: scheduledAt,
    duration_minutes: 60,
    price,
    platform_fee: 0,
    tutor_payout_amount: price,
    status: 'confirmed',
    session_type: 'in_person',
    cancellation_deadline: scheduledAt,
    stripe_payment_intent_id: options.paymentIntentId ?? null,
    dispute_status: options.disputeStatus ?? 'none',
    ...(options.createdAt ? { created_at: options.createdAt } : {}),
  }).select('id').single();
  if (error || !data) throw new Error('Could not create verification booking');
  bookingIds.push(data.id);
  return data.id;
}

async function callFunction(name: string, token: string, body: unknown = {}) {
  const response = await fetch(`${URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    body: (await response.json().catch(() => ({}))) as Json,
  };
}

async function stripePost(path: string, body: Record<string, string>): Promise<Json> {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body),
  });
  const result = await response.json() as Json;
  if (!response.ok) throw new Error('Stripe test request failed');
  return result;
}

async function booking(id: string): Promise<Json> {
  const { data, error } = await svc.from('bookings')
    .select('status, cancelled_at, cancelled_from_status, refund_percent, refund_status, hold_released_at, cancel_reason, cancelled_by_role')
    .eq('id', id)
    .single();
  if (error || !data) throw new Error('Could not read verification booking');
  return data as Json;
}

try {
  const expiredStudent = await makeUser('student');
  const expiredTutor = await makeUser('tutor');
  const expiredPi = await stripePost('payment_intents', {
    amount: '1000',
    currency: 'usd',
    capture_method: 'manual',
    confirm: 'true',
    payment_method: 'pm_card_visa',
    return_url: 'https://noot.app/return',
  });
  check(
    'Stripe created a manual-capture test PaymentIntent',
    expiredPi.capture_method === 'manual' && expiredPi.status === 'requires_capture',
    `status=${expiredPi.status ?? 'missing'}`,
  );
  if (typeof expiredPi.id !== 'string') throw new Error('Stripe test PaymentIntent was not created');
  const cancelledPi = await stripePost(`payment_intents/${expiredPi.id}/cancel`, {});
  check('Stripe cancelled the manual-capture test PaymentIntent', cancelledPi.status === 'canceled');

  const expiredBookingId = await makeBooking(expiredStudent, expiredTutor, {
    scheduledAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    price: 10,
    paymentIntentId: expiredPi.id,
  });
  const expired = await callFunction('complete-session', expiredTutor.token, { bookingId: expiredBookingId });
  const expiredRow = await booking(expiredBookingId);
  check(
    'complete-session reports the expired hold without charging the student',
    expired.status === 409 && expired.body.holdExpired === true,
    `${expired.status} ${JSON.stringify(expired.body)}`,
  );
  check(
    'expired-hold booking is closed and fully refunded with no cancel actor/reason',
    expiredRow.status === 'cancelled' &&
      expiredRow.cancelled_from_status === 'confirmed' &&
      !!expiredRow.cancelled_at &&
      expiredRow.refund_percent === 100 &&
      expiredRow.refund_status === 'refunded' &&
      !!expiredRow.hold_released_at &&
      expiredRow.cancel_reason === null &&
      expiredRow.cancelled_by_role === null,
    JSON.stringify(expiredRow),
  );

  const dueStudent = await makeUser('student');
  const dueTutor = await makeUser('tutor');
  const dueBookingId = await makeBooking(dueStudent, dueTutor, {
    scheduledAt: new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(),
  });

  const recentStudent = await makeUser('student');
  const recentTutor = await makeUser('tutor');
  const recentBookingId = await makeBooking(recentStudent, recentTutor, {
    scheduledAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  });

  const flaggedStudent = await makeUser('student');
  const flaggedTutor = await makeUser('tutor');
  const flaggedBookingId = await makeBooking(flaggedStudent, flaggedTutor, {
    scheduledAt: new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(),
    disputeStatus: 'flagged',
  });

  const unauthorized = await callFunction('auto-complete-sessions', ANON);
  check('auto-complete-sessions rejects a non-service Bearer', unauthorized.status === 401);

  const autoComplete = await callFunction('auto-complete-sessions', SERVICE);
  const dueRow = await booking(dueBookingId);
  const recentRow = await booking(recentBookingId);
  const flaggedRow = await booking(flaggedBookingId);
  check(
    'auto-complete-sessions completes the due free session',
    autoComplete.status === 200 &&
      autoComplete.body.completed >= 1 &&
      autoComplete.body.holdExpired === 0 &&
      autoComplete.body.failed === 0 &&
      dueRow.status === 'completed',
    `${autoComplete.status} ${JSON.stringify(autoComplete.body)}; booking=${dueRow.status}`,
  );
  check(
    'auto-complete-sessions skips recent and disputed sessions',
    recentRow.status === 'confirmed' && flaggedRow.status === 'confirmed',
    `recent=${recentRow.status}, flagged=${flaggedRow.status}`,
  );

  const pastStudent = await makeUser('student');
  const pastStudentTutor = await makeUser('tutor');
  await makeBooking(pastStudent, pastStudentTutor, {
    scheduledAt: new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(),
  });
  const studentDelete = await callFunction('delete-account', pastStudent.token);
  check(
    'student can delete their account with only an ended confirmed booking',
    studentDelete.status === 200,
    `${studentDelete.status} ${JSON.stringify(studentDelete.body)}`,
  );
  if (studentDelete.status === 200) {
    const { data: deletedUser } = await svc.from('users').select('deleted_at').eq('id', pastStudent.id).single();
    check('ended-session student was de-identified', !!deletedUser?.deleted_at);
  }

  const pastTutor = await makeUser('tutor');
  const pastTutorStudent = await makeUser('student');
  await makeBooking(pastTutorStudent, pastTutor, {
    scheduledAt: new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(),
  });
  const tutorDelete = await callFunction('delete-account', pastTutor.token);
  check(
    'tutor cannot delete with an ended session still to complete',
    tutorDelete.status === 409 &&
      tutorDelete.body.error === 'You have a past session to mark complete before deleting your account.',
    `${tutorDelete.status} ${JSON.stringify(tutorDelete.body)}`,
  );

  const futureStudent = await makeUser('student');
  const futureTutor = await makeUser('tutor');
  await makeBooking(futureStudent, futureTutor, {
    scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
  });
  const futureDelete = await callFunction('delete-account', futureStudent.token);
  check(
    'student cannot delete with a future confirmed booking',
    futureDelete.status === 409 &&
      futureDelete.body.error === 'You have an upcoming session. Cancel it before deleting your account.',
    `${futureDelete.status} ${JSON.stringify(futureDelete.body)}`,
  );
} finally {
  if (bookingIds.length) await svc.from('bookings').delete().in('id', bookingIds);
  for (const id of userIds) {
    await svc.auth.admin.deleteUser(id);
    await svc.from('users').delete().eq('id', id);
  }
}

console.log(`\n${failed === 0 ? '✅ all' : `❌ ${failed} failed,`} ${passed} passed`);
process.exit(failed === 0 ? 0 : 1);
