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
const PASSWORD = 'NootChat!Verify42';
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

const createBooking = async (
  studentId: string,
  tutorId: string,
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled',
  scheduledAt: number,
) => {
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
    status,
  }).select('id').single();
  if (error || !data) throw error ?? new Error(`Could not create ${status} booking`);
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

const reviewCount = async (bookingId: string) => {
  const { count, error } = await admin.from('reviews')
    .select('id', { count: 'exact', head: true })
    .eq('booking_id', bookingId);
  if (error) throw error;
  return count ?? 0;
};

let stage = 'create users';

try {
  const student = await makeUser('student');
  const tutor = await makeUser('tutor');
  const outsider = await makeUser('outsider');
  const studentId = student.id;
  const tutorId = tutor.id;

  const studentToken = await loginToken(student.email);
  const outsiderToken = await loginToken(outsider.email);
  const now = Date.now();

  stage = 'pending future booking';
  const pendingId = await createBooking(studentId, tutorId, 'pending', now + 24 * 60 * 60_000);
  const pending = await call(studentToken, { bookingId: pendingId, rating: 5 });
  step('pending future booking returns 409 with exact message',
    pending.status === 409 && pending.body.error === "You can rate a session after it's happened.",
    JSON.stringify(pending.body));
  step('pending future booking creates no review', await reviewCount(pendingId) === 0);

  stage = 'confirmed future booking';
  const futureId = await createBooking(studentId, tutorId, 'confirmed', now + 48 * 60 * 60_000);
  const future = await call(studentToken, { bookingId: futureId, rating: 5 });
  step('confirmed future booking returns 409 with exact message',
    future.status === 409 && future.body.error === "You can rate a session after it's happened.",
    JSON.stringify(future.body));
  step('confirmed future booking creates no review', await reviewCount(futureId) === 0);

  stage = 'cancelled booking';
  const cancelledId = await createBooking(studentId, tutorId, 'cancelled', now - 30 * 60 * 60_000);
  const cancelled = await call(studentToken, { bookingId: cancelledId, rating: 5 });
  step('cancelled booking returns 409 with exact message',
    cancelled.status === 409 && cancelled.body.error === "You can rate a session after it's happened.",
    JSON.stringify(cancelled.body));
  step('cancelled booking creates no review', await reviewCount(cancelledId) === 0);

  stage = 'confirmed elapsed booking';
  const confirmedId = await createBooking(studentId, tutorId, 'confirmed', now - 3 * 60 * 60_000);
  const confirmed = await call(studentToken, { bookingId: confirmedId, rating: 5, comment: '  Nice work  ' });
  step('confirmed elapsed booking accepts a rating', confirmed.status === 200, JSON.stringify(confirmed.body));
  const { data: confirmedReview } = await admin.from('reviews')
    .select('comment').eq('booking_id', confirmedId).eq('reviewer_id', studentId).single();
  step('review comments are trimmed before storage', confirmedReview?.comment === 'Nice work', confirmedReview?.comment);

  stage = 'completed booking';
  const completedId = await createBooking(studentId, tutorId, 'completed', now - 6 * 60 * 60_000);
  const completed = await call(studentToken, { bookingId: completedId, rating: 4 });
  step('completed booking accepts a rating', completed.status === 200, JSON.stringify(completed.body));

  stage = 'long comment';
  const longComment = await call(studentToken, {
    bookingId: completedId,
    rating: 4,
    comment: 'x'.repeat(1001),
  });
  step('1001-character comment returns 400 with exact message',
    longComment.status === 400 && longComment.body.error === 'Reviews can be at most 1000 characters.',
    JSON.stringify(longComment.body));

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
