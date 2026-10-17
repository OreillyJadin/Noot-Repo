import { createClient } from '@supabase/supabase-js';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
if (!['127.0.0.1', 'localhost'].includes(new globalThis.URL(URL).hostname)) {
  throw new Error('verify_booking_state only runs against local Supabase');
}

const PASSWORD = 'NootBooking!State42';
const tag = Date.now();
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const users: string[] = [];
const bookingIds: string[] = [];
const fixtures: Partial<Record<'completed' | 'pending' | 'cancelled' | 'no_show' | 'pendingCancel' | 'confirmedCancel', string>> = {};
const simulatedPaymentIntent = `sim_pi_booking_state_${tag}`;
let pass = 0;
let fail = 0;
let stage = 'create users';

const check = (name: string, ok: boolean, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const remove = async (label: string, query: PromiseLike<{ error: { message: string } | null }>) => {
  const { error } = await query;
  if (error) {
    fail++;
    console.error(`❌ cleanup ${label} — ${error.message}`);
  }
};

const callFunction = async (name: string, token: string, body: unknown) => {
  const response = await fetch(`${URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) as Record<string, unknown> };
};

const createUser = async (role: 'student' | 'tutor', name: string) => {
  const email = `booking-state-${name}-${tag}@crimson.ua.edu`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error || !data.user) throw error ?? new Error(`createUser failed for ${name}`);
  users.push(data.user.id);
  const { error: profileError } = await admin.from('users').update({
    first_name: 'State',
    last_name: name,
    status: 'active',
    deleted_at: null,
    password_set_at: new Date().toISOString(),
    terms_accepted_at: new Date().toISOString(),
    terms_version: '2026-09-17',
    guidelines_accepted_at: new Date().toISOString(),
    guidelines_version: '2026-10-13',
  }).eq('id', data.user.id);
  if (profileError) throw profileError;
  const { error: roleError } = await admin.from('user_roles')
    .upsert({ user_id: data.user.id, role }, { onConflict: 'user_id,role' });
  if (roleError) throw roleError;
  return { id: data.user.id, email };
};

const signIn = async (email: string) => {
  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !data.session) throw error ?? new Error(`sign-in failed for ${email}`);
  return data.session.access_token;
};

const createBooking = async (
  studentId: string,
  tutorId: string,
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show',
  hoursUntil: number,
  withCredit = false,
) => {
  const scheduledAt = new Date(Date.now() + hoursUntil * 60 * 60 * 1000);
  const paymentIntentId = withCredit ? simulatedPaymentIntent : null;
  const { data, error } = await admin.from('bookings').insert({
    student_id: studentId,
    tutor_id: tutorId,
    subject: 'BSC 103',
    scheduled_at: scheduledAt.toISOString(),
    duration_minutes: 60,
    price: 50,
    platform_fee: 8.75,
    student_fee: 8.5,
    tutor_payout_amount: 41.25,
    session_type: 'in_person',
    status,
    cancellation_deadline: new Date(scheduledAt.getTime() - 12 * 60 * 60 * 1000).toISOString(),
    refund_status: 'not_applicable',
    stripe_payment_intent_id: paymentIntentId,
    credit_applied: withCredit ? 5 : 0,
    accept_by: new Date(scheduledAt.getTime() - 24 * 60 * 60 * 1000).toISOString(),
  }).select('id').single();
  if (error || !data) throw error ?? new Error(`could not create ${status} booking`);
  bookingIds.push(data.id);

  if (withCredit) {
    const { error: ledgerError } = await admin.from('credit_ledger').insert({
      user_id: studentId,
      booking_id: data.id,
      payment_intent_id: paymentIntentId,
      amount_cents: -500,
      kind: 'booking_spend',
    });
    if (ledgerError) throw ledgerError;
  }
  return data.id as string;
};

try {
  const student = await createUser('student', 'Student');
  const tutor = await createUser('tutor', 'Tutor');
  const studentToken = await signIn(student.email);
  await signIn(tutor.email);

  stage = 'create booking fixtures';
  fixtures.completed = await createBooking(student.id, tutor.id, 'completed', 72, true);
  fixtures.pending = await createBooking(student.id, tutor.id, 'pending', 76);
  fixtures.cancelled = await createBooking(student.id, tutor.id, 'cancelled', 80);
  fixtures.no_show = await createBooking(student.id, tutor.id, 'no_show', 84);
  fixtures.pendingCancel = await createBooking(student.id, tutor.id, 'pending', 88);
  fixtures.confirmedCancel = await createBooking(student.id, tutor.id, 'confirmed', 92);

  stage = 'cancel state enforcement';
  const completedCancel = await callFunction('cancel-booking', studentToken, { bookingId: fixtures.completed });
  const { data: completedRow, error: completedError } = await admin.from('bookings')
    .select('status,refund_percent,refund_status,cancelled_at,stripe_charge_id,stripe_transfer_id')
    .eq('id', fixtures.completed)
    .single();
  const { data: unchangedLedger, error: ledgerError } = await admin.from('credit_ledger')
    .select('id,amount_cents,kind')
    .eq('booking_id', fixtures.completed);
  check('completed booking cancellation is rejected with the requested 409',
    completedCancel.status === 409 &&
      completedCancel.body.error === "Cannot cancel a booking with status 'completed'",
    `status=${completedCancel.status}, error=${completedCancel.body.error ?? ''}`);
  check('completed booking and payment fields remain unchanged',
    !completedError && completedRow?.status === 'completed' &&
      completedRow.refund_percent === 0 && completedRow.refund_status === 'not_applicable' &&
      completedRow.cancelled_at === null && completedRow.stripe_charge_id === null &&
      completedRow.stripe_transfer_id === null);
  check('completed cancellation does not return or otherwise move booking credit',
    !ledgerError && unchangedLedger?.length === 1 &&
      unchangedLedger[0]?.kind === 'booking_spend' && unchangedLedger[0]?.amount_cents === -500,
    `ledger rows=${unchangedLedger?.length ?? 'error'}`);

  const pendingCancel = await callFunction('cancel-booking', studentToken, { bookingId: fixtures.pendingCancel });
  const { data: pendingRow } = await admin.from('bookings').select('status').eq('id', fixtures.pendingCancel).single();
  check('pending booking remains cancellable', pendingCancel.status === 200 && pendingRow?.status === 'cancelled',
    `status=${pendingCancel.status}, row=${pendingRow?.status ?? 'missing'}`);
  const confirmedCancel = await callFunction('cancel-booking', studentToken, { bookingId: fixtures.confirmedCancel });
  const { data: confirmedRow } = await admin.from('bookings').select('status').eq('id', fixtures.confirmedCancel).single();
  check('confirmed booking remains cancellable', confirmedCancel.status === 200 && confirmedRow?.status === 'cancelled',
    `status=${confirmedCancel.status}, row=${confirmedRow?.status ?? 'missing'}`);

  for (const status of ['cancelled', 'no_show'] as const) {
    const bookingId = fixtures[status]!;
    const result = await callFunction('cancel-booking', studentToken, { bookingId });
    check(`${status} booking cancellation is rejected with 409`,
      result.status === 409 && result.body.error === `Cannot cancel a booking with status '${status}'`,
      `status=${result.status}, error=${result.body.error ?? ''}`);
  }

  stage = 'rating state enforcement';
  for (const status of ['pending', 'cancelled', 'no_show'] as const) {
    const bookingId = fixtures[status]!;
    const result = await callFunction('submit-rating', studentToken, {
      bookingId,
      rating: 5,
      comment: `Rejected ${status} rating ${tag}`,
    });
    const { data: reviews, error: reviewError } = await admin.from('reviews')
      .select('id')
      .eq('booking_id', bookingId)
      .eq('reviewer_id', student.id);
    check(`${status} booking cannot be rated`, result.status === 409 &&
      result.body.error === `Cannot submit a rating for a booking with status '${status}'` &&
      !reviewError && (reviews ?? []).length === 0,
    `status=${result.status}, reviews=${reviews?.length ?? 'error'}`);
  }

  const completedRating = await callFunction('submit-rating', studentToken, {
    bookingId: fixtures.completed,
    rating: 5,
    comment: 'Completed session rating',
  });
  const { data: review, error: reviewError } = await admin.from('reviews')
    .select('id,approval_status')
    .eq('booking_id', fixtures.completed)
    .eq('reviewer_id', student.id)
    .single();
  check('completed booking rating is accepted',
    completedRating.status === 200 && typeof completedRating.body.reviewId === 'string' &&
      !reviewError && review?.approval_status === 'pending',
    `status=${completedRating.status}`);
} catch (error) {
  fail++;
  console.error(`❌ ${stage} — ${error instanceof Error ? error.message : String(error)}`);
} finally {
  if (bookingIds.length) {
    await remove('credit ledger rows', admin.from('credit_ledger').delete().in('booking_id', bookingIds));
    await remove('test bookings', admin.from('bookings').delete().in('id', bookingIds));
  }
  if (users.length) {
    await remove('test notifications', admin.from('notifications').delete().in('user_id', users));
    await remove('test roles', admin.from('user_roles').delete().in('user_id', users));
    await remove('test profiles', admin.from('users').delete().in('id', users));
    for (const id of users) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error && !/not found/i.test(error.message)) {
        fail++;
        console.error(`❌ cleanup Auth user — ${error.message}`);
      }
    }
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
