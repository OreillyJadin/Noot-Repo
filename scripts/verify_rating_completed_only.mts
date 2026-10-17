import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { authorizeHold, cancelHold } from './_stripe_test.mts';

const URL = 'http://127.0.0.1:54321';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const PASSWORD = 'NootQA!Rating_B42';
const RATING_ERROR = 'You can rate a session once it is complete.';
const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });
const tag = Date.now();

type TestUser = { id: string; email: string; client: SupabaseClient; token: string };
type BookingFixture = { id: string; paymentIntentId: string };

const createdUserIds: string[] = [];
const bookingIds: string[] = [];
const paymentIntentIds: string[] = [];
let passed = 0;
let failed = 0;

const check = (id: string, name: string, ok: boolean, detail = '') => {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} [${id}] ${name}${detail ? ` — ${detail}` : ''}`);
};

const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

const mk = async (name: string, firstName: string): Promise<TestUser> => {
  const email = `qa-rating-${name}-${tag}@crimson.ua.edu`;
  const { data, error } = await svc.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('createUser returned no user');
  createdUserIds.push(data.user.id);

  const now = new Date().toISOString();
  const { error: userError } = await svc.from('users').update({
    first_name: firstName,
    last_name: 'QA',
    password_set_at: now,
    terms_accepted_at: now,
    terms_version: '2026-09-17',
    guidelines_accepted_at: now,
    guidelines_version: '2026-10-13',
  }).eq('id', data.user.id);
  if (userError) throw userError;

  const { error: roleError } = await svc.from('user_roles').upsert(
    { user_id: data.user.id, role: 'student' },
    { onConflict: 'user_id,role' },
  );
  if (roleError) throw roleError;

  const client = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: session, error: signInError } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (signInError || !session.session) throw signInError ?? new Error('sign-in returned no session');
  return { id: data.user.id, email, client, token: session.session.access_token };
};

const fn = async (name: string, body: unknown, user: TestUser) => {
  const response = await fetch(`${URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.token}`,
    },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    body: (await response.json().catch(() => ({}))) as Record<string, unknown>,
  };
};

const atHoursUtc = (hours: number) => {
  const date = new Date(Date.now() + hours * 3600e3);
  date.setUTCMinutes(0, 0, 0);
  return date.toISOString();
};

const book = async (
  tutor: TestUser,
  student: TestUser,
  courseCode: string,
  scheduledAt: string,
): Promise<BookingFixture> => {
  const intent = await fn('create-payment-intent', {
    tutorId: tutor.id,
    courseCode,
    durationMinutes: 60,
    scheduledAt,
  }, student);
  if (intent.status !== 200) {
    throw new Error(`create-payment-intent ${intent.status} ${JSON.stringify(intent.body)}`);
  }

  const paymentIntentId = String(intent.body.paymentIntentId ?? '');
  if (!paymentIntentId) throw new Error('create-payment-intent returned no paymentIntentId');
  paymentIntentIds.push(paymentIntentId);
  if (paymentIntentId.startsWith('pi_')) await authorizeHold(paymentIntentId);

  const confirmation = await fn('confirm-booking', {
    tutorId: tutor.id,
    courseCode,
    scheduledAt,
    durationMinutes: 60,
    sessionType: 'in_person',
    location: 'Gorgas Library',
    paymentIntentId,
    message: 'Rating completion verification',
  }, student);
  if (confirmation.status !== 200) {
    throw new Error(`confirm-booking ${confirmation.status} ${JSON.stringify(confirmation.body)}`);
  }

  const id = String(confirmation.body.bookingId ?? '');
  if (!id) throw new Error('confirm-booking returned no bookingId');
  bookingIds.push(id);
  return { id, paymentIntentId };
};

const toSim = async (booking: BookingFixture) => {
  if (booking.paymentIntentId.startsWith('pi_')) {
    await cancelHold(booking.paymentIntentId).catch(() => {});
  }
  const { error } = await svc.from('bookings')
    .update({ stripe_payment_intent_id: `sim_pi_qa_${booking.id.slice(0, 8)}` })
    .eq('id', booking.id);
  if (error) throw error;
};

const statusOf = async (bookingId: string) => {
  const { data, error } = await svc.from('bookings')
    .select('status')
    .eq('id', bookingId)
    .maybeSingle();
  if (error) throw error;
  return data?.status;
};

const assertRatingBlocked = async (id: string, name: string, bookingId: string, user: TestUser) => {
  const response = await fn('submit-rating', { bookingId, rating: 5 }, user);
  check(`${id}-409`, `${name} rating is rejected`, response.status === 409 && response.body.error === RATING_ERROR,
    `${response.status} ${JSON.stringify(response.body)}`);

  const { data, error } = await svc.from('reviews').select('id').eq('booking_id', bookingId);
  check(`${id}-no-review`, `${name} rejection creates no review row`, !error && data?.length === 0,
    error?.message ?? `rows=${data?.length}`);
};

const cleanup = async () => {
  for (const paymentIntentId of paymentIntentIds) {
    if (paymentIntentId.startsWith('pi_')) {
      await cancelHold(paymentIntentId).catch(() => {});
    }
  }
  if (bookingIds.length) {
    const { error: reviewsError } = await svc.from('reviews').delete().in('booking_id', bookingIds);
    if (reviewsError) check('cleanup-reviews', 'test reviews removed', false, reviewsError.message);
    const { error: bookingsError } = await svc.from('bookings').delete().in('id', bookingIds);
    if (bookingsError) check('cleanup-bookings', 'test bookings removed', false, bookingsError.message);
  }
  for (const userId of createdUserIds) {
    const { error } = await svc.auth.admin.deleteUser(userId);
    if (error) check('cleanup-users', 'test users removed', false, error.message);
  }
};

try {
  const { data: course, error: courseError } = await svc.from('courses')
    .select('course_code')
    .eq('is_active', true)
    .order('course_code')
    .limit(1)
    .maybeSingle();
  if (courseError || !course?.course_code) {
    throw courseError ?? new Error('no active course in catalog');
  }

  const tutor = await mk('tutor', 'Tutor');
  const student = await mk('student', 'Student');

  const { error: tutorRoleError } = await svc.from('user_roles').upsert(
    { user_id: tutor.id, role: 'tutor' },
    { onConflict: 'user_id,role' },
  );
  if (tutorRoleError) throw tutorRoleError;

  const { error: profileError } = await svc.from('tutor_profiles').upsert({
    user_id: tutor.id,
    bio: 'QA tutor for completed-session rating verification.',
    subjects: [course.course_code],
    approval_status: 'approved',
    stripe_charges_enabled: true,
  }, { onConflict: 'user_id' });
  if (profileError) throw profileError;

  const { error: tutorCourseError } = await svc.from('tutor_courses').insert({
    tutor_id: tutor.id,
    course_code: course.course_code,
    grade: 'A',
    hourly_rate: 30,
  });
  if (tutorCourseError) throw tutorCourseError;

  check('fixtures', 'service-role users and approved tutor fixture created', true);

  const pending = await book(tutor, student, course.course_code, atHoursUtc(48));
  check('pending-status', 'new booking is pending', await statusOf(pending.id) === 'pending');
  await assertRatingBlocked('pending', 'pending booking', pending.id, tutor);

  const confirmed = await book(tutor, student, course.course_code, atHoursUtc(50));
  const accepted = await fn('respond-booking-request', { bookingId: confirmed.id, action: 'accept' }, tutor);
  check('confirmed-status', 'tutor accepts booking', accepted.status === 200 && await statusOf(confirmed.id) === 'confirmed',
    `${accepted.status} ${JSON.stringify(accepted.body)}`);
  await assertRatingBlocked('confirmed', 'confirmed booking', confirmed.id, tutor);

  const cancelled = await book(tutor, student, course.course_code, atHoursUtc(52));
  const cancelledAccept = await fn('respond-booking-request', { bookingId: cancelled.id, action: 'accept' }, tutor);
  const cancelledResponse = cancelledAccept.status === 200
    ? await fn('cancel-booking', { bookingId: cancelled.id }, tutor)
    : cancelledAccept;
  check('cancelled-status', 'confirmed booking is cancelled by tutor',
    cancelledResponse.status === 200 && await statusOf(cancelled.id) === 'cancelled',
    `${cancelledResponse.status} ${JSON.stringify(cancelledResponse.body)}`);
  await assertRatingBlocked('cancelled', 'cancelled booking', cancelled.id, tutor);

  const completed = await book(tutor, student, course.course_code, atHoursUtc(54));
  const completedAccept = await fn('respond-booking-request', { bookingId: completed.id, action: 'accept' }, tutor);
  if (completedAccept.status !== 200) {
    throw new Error(`accept completed fixture ${completedAccept.status} ${JSON.stringify(completedAccept.body)}`);
  }
  await toSim(completed);
  const { error: scheduleError } = await svc.from('bookings')
    .update({ scheduled_at: new Date(Date.now() - 3 * 3600e3).toISOString() })
    .eq('id', completed.id);
  if (scheduleError) throw scheduleError;

  const completion = await fn('complete-session', { bookingId: completed.id }, tutor);
  check('completed-status', 'tutor completes an elapsed booking',
    completion.status === 200 && await statusOf(completed.id) === 'completed',
    `${completion.status} ${JSON.stringify(completion.body)}`);

  const tutorRating = await fn('submit-rating', { bookingId: completed.id, rating: 5 }, tutor);
  const studentRating = await fn('submit-rating', { bookingId: completed.id, rating: 4 }, student);
  check('completed-tutor-rating', 'tutor can rate after completion',
    tutorRating.status === 200 && Boolean(tutorRating.body.reviewId),
    `${tutorRating.status} ${JSON.stringify(tutorRating.body)}`);
  check('completed-student-rating', 'student can rate after completion',
    studentRating.status === 200 && Boolean(studentRating.body.reviewId),
    `${studentRating.status} ${JSON.stringify(studentRating.body)}`);

  const { data: reviews, error: reviewsError } = await svc.from('reviews')
    .select('reviewer_id, subject_user_id, approval_status')
    .eq('booking_id', completed.id);
  check('completed-review-rows', 'both completed-session reviews are stored',
    !reviewsError && reviews?.length === 2
      && reviews.some((review) => review.reviewer_id === tutor.id && review.subject_user_id === student.id)
      && reviews.some((review) => review.reviewer_id === student.id && review.subject_user_id === tutor.id),
    reviewsError?.message ?? JSON.stringify(reviews));
} catch (error) {
  check('setup', 'verification setup and requests complete', false, errorText(error));
} finally {
  await cleanup();
}

console.log(`\nTOTAL ${passed + failed} — PASS ${passed} FAIL ${failed}`);
if (failed > 0) process.exitCode = 1;
