// Verify currently-taking course rules and course-specific booking fees against the LOCAL stack.
// Course writes use a signed-in tutor client; the service role is limited to setup and cleanup.
import { createClient } from '@supabase/supabase-js';
import { initSupabase, api, auth } from '../packages/core/src/index.ts';
import { authorizeHold, cancelHold, stripeTestMode } from './_stripe_test.mts';

const URL = 'http://127.0.0.1:54321';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const PASSWORD = 'NootTest123!';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
}

async function rejects(fn: () => Promise<unknown>): Promise<{ message: string; code?: string }> {
  try {
    await fn();
    return { message: '' };
  } catch (e) {
    const error = e as { message?: string; code?: string };
    return { message: error.message ?? String(e), code: error.code };
  }
}

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });
const { data: catalog, error: catalogError } = await svc
  .from('courses')
  .select('course_code')
  .order('course_code')
  .limit(8);
if (catalogError) throw catalogError;
const codes = (catalog ?? []).map((row) => row.course_code as string);
if (codes.length < 7) throw new Error('Need seven catalog courses to verify currently-taking rules.');
const [codeGrade, codeCurrent, codeBad, codeNewNow, codeDirectNow, codeDirectGrade, codeRpcGrade] = codes;

const email = `currently-taking+${Date.now()}@crimson.ua.edu`;
const { data: created, error: createError } = await svc.auth.admin.createUser({
  email,
  password: PASSWORD,
  email_confirm: true,
});
if (createError) throw createError;
const tutorId = created.user!.id;
const rawTutor = createClient(URL, ANON, { auth: { persistSession: false } });
const bookingIds: string[] = [];
const paymentIntentIds: string[] = [];
let feeTutorId = '';
let previousFeeProfile: {
  grades_verified_at: string | null;
  grades_verified_by: string | null;
  stripe_charges_enabled: boolean;
} | null = null;
let previousFeeCourses: { course_code: string; grade: string | null; currently_taking: boolean }[] = [];

try {
  const preexisting = await svc.from('tutor_courses').select('currently_taking').limit(20);
  check(
    'pre-existing course rows default to currently_taking=false',
    !preexisting.error &&
      !!preexisting.data?.length &&
      preexisting.data.every((row) => row.currently_taking === false),
    preexisting.error?.message ?? `${preexisting.data?.length ?? 0} rows`,
  );

  const rawSignIn = await rawTutor.auth.signInWithPassword({ email, password: PASSWORD });
  if (rawSignIn.error) throw rawSignIn.error;
  initSupabase({ url: URL, anonKey: ANON });
  const tutorSignIn = await auth.signInWithPassword(email, PASSWORD);
  if (!tutorSignIn.ok) throw new Error(tutorSignIn.error);

  await api.profile.setTutorCourses([
    { courseCode: codeGrade!, grade: 'A', hourlyRate: 25, currentlyTaking: false },
    { courseCode: codeCurrent!, grade: null, hourlyRate: 30, currentlyTaking: true },
  ]);
  const { data: unverifiedRows } = await svc
    .from('tutor_courses')
    .select('course_code, grade, currently_taking')
    .eq('tutor_id', tutorId);
  const unverifiedCurrent = unverifiedRows?.find((row) => row.course_code === codeCurrent);
  check(
    'unverified tutor saves a graded course and a currently-taking course',
    unverifiedRows?.length === 2 &&
      unverifiedCurrent?.currently_taking === true &&
      unverifiedCurrent.grade === null,
    JSON.stringify(unverifiedRows),
  );

  const invalidRpc = await rejects(() =>
    api.profile.setTutorCourses([
      { courseCode: codeBad!, grade: 'A', hourlyRate: 25, currentlyTaking: true },
    ]),
  );
  check(
    'RPC rejects a grade on a currently-taking course',
    invalidRpc.message.includes("A course you're taking now can't have a grade yet"),
    invalidRpc.message,
  );
  const invalidInsert = await rawTutor.from('tutor_courses').insert({
    tutor_id: tutorId,
    course_code: codeBad,
    grade: 'A',
    hourly_rate: 25,
    currently_taking: true,
  });
  check(
    'direct insert rejects a grade on a currently-taking course',
    invalidInsert.error?.code === '23514',
    invalidInsert.error?.message ?? 'insert unexpectedly succeeded',
  );

  const verificationTime = new Date().toISOString();
  const { error: verifyError } = await svc
    .from('tutor_profiles')
    .upsert({ user_id: tutorId, grades_verified_at: verificationTime }, { onConflict: 'user_id' });
  if (verifyError) throw verifyError;

  await api.profile.setTutorCourses([
    { courseCode: codeGrade!, grade: 'A', hourlyRate: 25, currentlyTaking: false },
    { courseCode: codeCurrent!, grade: null, hourlyRate: 30, currentlyTaking: true },
    { courseCode: codeNewNow!, grade: null, hourlyRate: 35, currentlyTaking: true },
  ]);
  const { data: addedCurrent } = await svc
    .from('tutor_courses')
    .select('grade, currently_taking')
    .eq('tutor_id', tutorId)
    .eq('course_code', codeNewNow)
    .maybeSingle();
  check(
    'verified tutor adds a new currently-taking course through RPC',
    addedCurrent?.currently_taking === true && addedCurrent.grade === null,
    JSON.stringify(addedCurrent),
  );

  const directCurrent = await rawTutor.from('tutor_courses').insert({
    tutor_id: tutorId,
    course_code: codeDirectNow,
    grade: null,
    hourly_rate: 35,
    currently_taking: true,
  });
  check(
    'verified tutor can directly insert a currently-taking course',
    !directCurrent.error,
    directCurrent.error?.message ?? '',
  );
  const directGraded = await rawTutor.from('tutor_courses').insert({
    tutor_id: tutorId,
    course_code: codeDirectGrade,
    grade: 'B',
    hourly_rate: 35,
    currently_taking: false,
  });
  check(
    'verified tutor cannot directly insert a graded course',
    !!directGraded.error && /course list is locked/.test(directGraded.error.message),
    directGraded.error?.message ?? 'insert unexpectedly succeeded',
  );

  const addGraded = await rejects(() =>
    api.profile.setTutorCourses([
      { courseCode: codeGrade!, grade: 'A', hourlyRate: 25, currentlyTaking: false },
      { courseCode: codeCurrent!, grade: null, hourlyRate: 30, currentlyTaking: true },
      { courseCode: codeNewNow!, grade: null, hourlyRate: 35, currentlyTaking: true },
      { courseCode: codeDirectNow!, grade: null, hourlyRate: 35, currentlyTaking: true },
      { courseCode: codeRpcGrade!, grade: 'A', hourlyRate: 40, currentlyTaking: false },
    ]),
  );
  check(
    'verified tutor cannot add a new graded course through RPC',
    addGraded.message.includes("Your grades are verified, so they're locked."),
    addGraded.message,
  );

  const flipCurrentRpc = await rejects(() =>
    api.profile.setTutorCourses([
      { courseCode: codeGrade!, grade: 'A', hourlyRate: 25, currentlyTaking: false },
      { courseCode: codeCurrent!, grade: 'A', hourlyRate: 30, currentlyTaking: false },
      { courseCode: codeNewNow!, grade: null, hourlyRate: 35, currentlyTaking: true },
      { courseCode: codeDirectNow!, grade: null, hourlyRate: 35, currentlyTaking: true },
    ]),
  );
  check(
    'verified tutor cannot change a currently-taking course to graded through RPC',
    flipCurrentRpc.message.includes("Your grades are verified, so they're locked."),
    flipCurrentRpc.message,
  );
  const flipCurrentDirect = await rawTutor
    .from('tutor_courses')
    .update({ grade: 'A', currently_taking: false })
    .eq('tutor_id', tutorId)
    .eq('course_code', codeCurrent);
  check(
    'verified tutor cannot directly change a currently-taking course to graded',
    !!flipCurrentDirect.error && /they are locked/.test(flipCurrentDirect.error.message),
    flipCurrentDirect.error?.message ?? 'update unexpectedly succeeded',
  );

  const flipGradedRpc = await rejects(() =>
    api.profile.setTutorCourses([
      { courseCode: codeGrade!, grade: null, hourlyRate: 25, currentlyTaking: true },
      { courseCode: codeCurrent!, grade: null, hourlyRate: 30, currentlyTaking: true },
      { courseCode: codeNewNow!, grade: null, hourlyRate: 35, currentlyTaking: true },
      { courseCode: codeDirectNow!, grade: null, hourlyRate: 35, currentlyTaking: true },
    ]),
  );
  check(
    'verified tutor cannot change a graded course to currently taking through RPC',
    flipGradedRpc.message.includes("Your grades are verified, so they're locked."),
    flipGradedRpc.message,
  );
  const flipGradedDirect = await rawTutor
    .from('tutor_courses')
    .update({ grade: null, currently_taking: true })
    .eq('tutor_id', tutorId)
    .eq('course_code', codeGrade);
  check(
    'verified tutor cannot directly change a graded course to currently taking',
    !!flipGradedDirect.error && /they are locked/.test(flipGradedDirect.error.message),
    flipGradedDirect.error?.message ?? 'update unexpectedly succeeded',
  );

  await api.profile.setTutorCourses([
    { courseCode: codeGrade!, grade: 'A', hourlyRate: 25, currentlyTaking: false },
    { courseCode: codeNewNow!, grade: null, hourlyRate: 35, currentlyTaking: true },
  ]);
  const { data: removedCurrent } = await svc
    .from('tutor_courses')
    .select('id')
    .eq('tutor_id', tutorId)
    .eq('course_code', codeCurrent)
    .maybeSingle();
  check('verified tutor removes a currently-taking course through RPC', !removedCurrent);

  await auth.signOut();
  const studentSignIn = await auth.signInWithPassword('student@crimson.ua.edu', 'password123');
  if (!studentSignIn.ok) throw new Error(studentSignIn.error);
  const tutors = await api.tutors.search();
  const feeTutor = tutors.find(
    (candidate) => candidate.courses.length > 1 && candidate.courses.some((course) => !!course.grade),
  );
  if (!feeTutor) throw new Error('No seeded tutor has both a graded course and another course for fee checks.');
  const feeGradedCourse = feeTutor.courses.find((course) => !!course.grade && !course.currentlyTaking);
  const feeTakingCourse = feeTutor.courses.find(
    (course) => course.courseCode !== feeGradedCourse?.courseCode && course.hourlyRate > 0,
  );
  if (!feeGradedCourse || !feeTakingCourse) throw new Error('Could not find distinct graded and currently-taking fee courses.');
  feeTutorId = feeTutor.userId;

  const { data: feeProfile, error: feeProfileError } = await svc
    .from('tutor_profiles')
    .select('grades_verified_at, grades_verified_by, stripe_charges_enabled')
    .eq('user_id', feeTutorId)
    .single();
  if (feeProfileError) throw feeProfileError;
  previousFeeProfile = feeProfile;
  const { data: feeRows, error: feeRowsError } = await svc
    .from('tutor_courses')
    .select('course_code, grade, currently_taking')
    .eq('tutor_id', feeTutorId)
    .in('course_code', [feeTakingCourse.courseCode, feeGradedCourse.courseCode]);
  if (feeRowsError) throw feeRowsError;
  previousFeeCourses = feeRows ?? [];

  const { error: profileUpdateError } = await svc
    .from('tutor_profiles')
    .update({ grades_verified_at: new Date().toISOString(), stripe_charges_enabled: true })
    .eq('user_id', feeTutorId);
  if (profileUpdateError) throw profileUpdateError;
  const { error: takingUpdateError } = await svc
    .from('tutor_courses')
    .update({ grade: null, currently_taking: true })
    .eq('tutor_id', feeTutorId)
    .eq('course_code', feeTakingCourse.courseCode);
  if (takingUpdateError) throw takingUpdateError;
  const { error: gradedUpdateError } = await svc
    .from('tutor_courses')
    .update({ currently_taking: false })
    .eq('tutor_id', feeTutorId)
    .eq('course_code', feeGradedCourse.courseCode);
  if (gradedUpdateError) throw gradedUpdateError;
  const { data: existingBookings, error: existingBookingsError } = await svc
    .from('bookings')
    .select('scheduled_at, duration_minutes')
    .eq('tutor_id', feeTutorId)
    .in('status', ['pending', 'confirmed'])
    .gte('scheduled_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  if (existingBookingsError) throw existingBookingsError;
  const slotMs = 30 * 60 * 1000;
  const durationMs = 60 * 60 * 1000;
  const existingIntervals = (existingBookings ?? []).map((booking) => ({
    start: Date.parse(booking.scheduled_at),
    end: Date.parse(booking.scheduled_at) + Number(booking.duration_minutes) * 60 * 1000,
  }));
  const feeSlots: string[] = [];
  for (
    let at = Math.ceil((Date.now() + 24 * 60 * 60 * 1000) / slotMs) * slotMs;
    at + durationMs <= Date.now() + 6 * 24 * 60 * 60 * 1000 && feeSlots.length < 2;
    at += slotMs
  ) {
    const conflictsWithExisting = existingIntervals.some((interval) => at < interval.end && at + durationMs > interval.start);
    const conflictsWithFeeCheck = feeSlots.some((slot) => {
      const start = Date.parse(slot);
      return at < start + durationMs && at + durationMs > start;
    });
    if (!conflictsWithExisting && !conflictsWithFeeCheck) feeSlots.push(new Date(at).toISOString());
  }
  if (feeSlots.length < 2) throw new Error('Could not find two free one-hour slots for fee checks.');

  const bookAndCheckFee = async (courseCode: string, scheduledAt: string, feeRate: number, label: string) => {
    const pi = await api.createPaymentIntent({
      tutorId: feeTutorId,
      courseCode,
      durationMinutes: 60,
      scheduledAt,
    });
    paymentIntentIds.push(pi.paymentIntentId);
    check(`${label}: confirm-booking uses a real test PaymentIntent`, pi.paymentIntentId.startsWith('pi_'), pi.paymentIntentId);
    if (pi.paymentIntentId.startsWith('pi_')) {
      const authorized = await authorizeHold(pi.paymentIntentId);
      check(`${label}: PaymentIntent is authorized`, authorized?.status === 'requires_capture', authorized?.status ?? 'no status');
    }
    const booking = await api.bookings.confirm({
      tutorId: feeTutorId,
      courseCode,
      scheduledAt,
      durationMinutes: 60,
      sessionType: 'in_person',
      message: 'Currently-taking fee check',
      paymentIntentId: pi.paymentIntentId,
    });
    bookingIds.push(booking.bookingId);
    const { data: stored, error } = await svc
      .from('bookings')
      .select('price, platform_fee, tutor_payout_amount')
      .eq('id', booking.bookingId)
      .single();
    const price = Number(stored?.price);
    const expectedFee = Math.round(price * feeRate * 100) / 100;
    const expectedPayout = Math.round((price - expectedFee) * 100) / 100;
    check(
      `${label}: confirm-booking locks the expected fee`,
      !error && Number(stored?.platform_fee) === expectedFee && Number(stored?.tutor_payout_amount) === expectedPayout,
      error?.message ??
        `fee $${stored?.platform_fee} (expected $${expectedFee}), payout $${stored?.tutor_payout_amount} (expected $${expectedPayout})`,
    );
  };

  await bookAndCheckFee(feeTakingCourse.courseCode, feeSlots[0]!, 0.325, 'currently-taking course');
  await bookAndCheckFee(feeGradedCourse.courseCode, feeSlots[1]!, 0.175, 'graded course');
} finally {
  await auth.signOut().catch(() => {});
  for (const id of paymentIntentIds) {
    if (stripeTestMode() && id.startsWith('pi_')) await cancelHold(id).catch(() => {});
  }
  if (bookingIds.length) await svc.from('bookings').delete().in('id', bookingIds);
  if (feeTutorId && previousFeeProfile) {
    for (const row of previousFeeCourses) {
      await svc
        .from('tutor_courses')
        .update({ grade: row.grade, currently_taking: row.currently_taking })
        .eq('tutor_id', feeTutorId)
        .eq('course_code', row.course_code);
    }
    await svc
      .from('tutor_profiles')
      .update({
        grades_verified_at: previousFeeProfile.grades_verified_at,
        grades_verified_by: previousFeeProfile.grades_verified_by,
        stripe_charges_enabled: previousFeeProfile.stripe_charges_enabled,
      })
      .eq('user_id', feeTutorId);
  }
  await svc.auth.admin.deleteUser(tutorId);
  await svc.from('users').delete().eq('id', tutorId);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
