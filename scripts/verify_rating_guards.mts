import { DEV_PASSWORD } from './_devPassword.mjs';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
if (!['127.0.0.1', 'localhost'].includes(new globalThis.URL(URL).hostname)) {
  throw new Error('verify_rating_guards only runs against local Supabase');
}
const ANON =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const PASSWORD = DEV_PASSWORD;
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const tag = Date.now();
const cleanup = { bookings: [] as string[], users: [] as string[] };
let pass = 0;
let fail = 0;

const step = (name: string, ok: boolean, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const makeUser = async (name: string) => {
  const email = `rating-${name}-${tag}@crimson.ua.edu`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error(`Could not create ${name}`);
  const userId = data.user.id;
  cleanup.users.push(userId);
  const { error: updateError } = await admin.from('users').update({
    first_name: `Rating${name}`,
    last_name: 'Verify',
    password_set_at: new Date().toISOString(),
    terms_accepted_at: new Date().toISOString(),
    terms_version: '2026-09-17',
    guidelines_accepted_at: new Date().toISOString(),
    guidelines_version: '2026-10-13',
  }).eq('id', userId);
  if (updateError) throw updateError;
  return { id: userId, email };
};

const loginToken = async (email: string) => {
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !data.session) throw error ?? new Error(`No session for ${email}`);
  return data.session.access_token;
};

const createCompletedBooking = async (studentId: string, tutorId: string) => {
  const scheduledAt = Date.now() - 6 * 60 * 60_000;
  const start = new Date(scheduledAt);
  const end = new Date(scheduledAt + 60 * 60_000);
  const { data, error } = await admin.from('bookings').insert({
    student_id: studentId,
    tutor_id: tutorId,
    subject: 'QA RATING',
    scheduled_at: start.toISOString(),
    scheduled_end: end.toISOString(),
    duration_minutes: 60,
    price: 40,
    platform_fee: 0,
    tutor_payout_amount: 40,
    session_type: 'in_person',
    cancellation_deadline: new Date(scheduledAt - 12 * 60 * 60_000).toISOString(),
    status: 'completed',
  }).select('id').single();
  if (error || !data) throw error ?? new Error('Could not create completed booking');
  cleanup.bookings.push(data.id);
  return data.id as string;
};

const createPendingBooking = async (studentId: string, tutorId: string) => {
  const scheduledAt = Date.now() + 6 * 60 * 60_000;
  const start = new Date(scheduledAt);
  const end = new Date(scheduledAt + 60 * 60_000);
  const { data, error } = await admin.from('bookings').insert({
    student_id: studentId,
    tutor_id: tutorId,
    subject: 'QA RATING',
    scheduled_at: start.toISOString(),
    scheduled_end: end.toISOString(),
    duration_minutes: 60,
    price: 40,
    platform_fee: 0,
    tutor_payout_amount: 40,
    session_type: 'in_person',
    cancellation_deadline: new Date(scheduledAt - 12 * 60 * 60_000).toISOString(),
    status: 'pending',
  }).select('id').single();
  if (error || !data) throw error ?? new Error('Could not create pending booking');
  cleanup.bookings.push(data.id);
  return data.id as string;
};

const call = async (token: string, body: Record<string, unknown>) => {
  const response = await fetch(`${URL}/functions/v1/submit-rating`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) as Record<string, any> };
};

const storedComment = async (bookingId: string, reviewerId: string) => {
  const { data, error } = await admin.from('reviews')
    .select('comment')
    .eq('booking_id', bookingId)
    .eq('reviewer_id', reviewerId)
    .single();
  if (error) throw error;
  return data.comment as string | null;
};

let stage = 'create users';

try {
  const student = await makeUser('student');
  const tutor = await makeUser('tutor');
  const outsider = await makeUser('outsider');
  const studentId = student.id;
  const tutorId = tutor.id;

  const studentToken = await loginToken(student.email);
  const tutorToken = await loginToken(tutor.email);
  const outsiderToken = await loginToken(outsider.email);
  const completedId = await createCompletedBooking(studentId, tutorId);
  const pendingId = await createPendingBooking(studentId, tutorId);

  stage = 'pending future booking';
  const pendingRating = await call(studentToken, {
    bookingId: pendingId,
    rating: 4,
    comment: 'Not completed',
  });
  const { data: pendingReview, error: pendingReviewError } = await admin.from('reviews')
    .select('id')
    .eq('booking_id', pendingId)
    .eq('reviewer_id', studentId)
    .maybeSingle();
  step('future pending booking returns the completed-only 409',
    pendingRating.status === 409 &&
      pendingRating.body.error === 'You can rate a session once it is complete.' &&
      !pendingReviewError && !pendingReview,
    JSON.stringify(pendingRating.body));

  stage = '500-character comment';
  const fiveHundred = 'x'.repeat(500);
  const accepted = await call(studentToken, { bookingId: completedId, rating: 4, comment: fiveHundred });
  step('500-character comment returns 200', accepted.status === 200, JSON.stringify(accepted.body));
  step('500-character comment is stored', await storedComment(completedId, studentId) === fiveHundred);

  stage = '501-character comment';
  const longComment = await call(studentToken, {
    bookingId: completedId,
    rating: 4,
    comment: 'x'.repeat(501),
  });
  step('501-character comment returns 400 with exact message',
    longComment.status === 400 && longComment.body.error === 'Reviews can be at most 500 characters.',
    JSON.stringify(longComment.body));
  step('rejected long comment leaves stored comment unchanged',
    await storedComment(completedId, studentId) === fiveHundred);

  stage = 'trimmed comment';
  const padded = await call(studentToken, { bookingId: completedId, rating: 4, comment: '  Nice work  ' });
  step('whitespace-padded comment returns 200', padded.status === 200, JSON.stringify(padded.body));
  step('whitespace-padded comment is stored trimmed',
    await storedComment(completedId, studentId) === 'Nice work');

  stage = 'tutor rates student';
  const tutorRating = await call(tutorToken, { bookingId: completedId, rating: 5, comment: 'Prepared and punctual' });
  step('tutor can rate the student on a completed booking', tutorRating.status === 200, JSON.stringify(tutorRating.body));
  const { data: bothReviews, error: bothError } = await admin.from('reviews')
    .select('reviewer_id, subject_user_id, approval_status')
    .eq('booking_id', completedId);
  step('two independent pending reviews target the opposite participants',
    !bothError && bothReviews?.length === 2 &&
      bothReviews.some((r) => r.reviewer_id === tutorId && r.subject_user_id === studentId && r.approval_status === 'pending') &&
      bothReviews.some((r) => r.reviewer_id === studentId && r.subject_user_id === tutorId && r.approval_status === 'pending'),
    bothError?.message);
  const earlyTutorRating = await call(tutorToken, { bookingId: pendingId, rating: 5 });
  step('tutor also cannot rate an incomplete booking', earlyTutorRating.status === 409, JSON.stringify(earlyTutorRating.body));

  stage = 'non-party check';
  const nonParty = await call(outsiderToken, { bookingId: completedId, rating: 5 });
  step('non-party returns 403', nonParty.status === 403, JSON.stringify(nonParty.body));

  stage = 'rating validation';
  const invalidRating = await call(studentToken, { bookingId: completedId, rating: 6 });
  step('rating 6 returns 400', invalidRating.status === 400, JSON.stringify(invalidRating.body));
} catch (error) {
  step(`verification setup/error at ${stage}`, false, error instanceof Error ? error.message : String(error));
} finally {
  if (cleanup.bookings.length) {
    const { error: reviewsError } = await admin.from('reviews').delete().in('booking_id', cleanup.bookings);
    if (reviewsError) step('cleanup reviews', false, reviewsError.message);
    const { error: bookingsError } = await admin.from('bookings').delete().in('id', cleanup.bookings);
    if (bookingsError) step('cleanup bookings', false, bookingsError.message);
  }
  for (const userId of cleanup.users) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) step('cleanup verification user', false, error.message);
  }
  console.log(`${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}
