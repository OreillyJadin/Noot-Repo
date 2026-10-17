import { createClient } from '@supabase/supabase-js';
import { api, auth, initSupabase } from '../packages/core/src/index.ts';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
if (!['127.0.0.1', 'localhost'].includes(new globalThis.URL(URL).hostname)) {
  throw new Error('verify_past_scope only runs against local Supabase');
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

initSupabase({ url: URL, anonKey: ANON });

const makeUser = async (name: string) => {
  const email = `past-scope-${name}-${tag}@crimson.ua.edu`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error(`Could not create ${name}`);
  const userId = data.user.id;
  cleanup.users.push(userId);
  const { error: updateError } = await admin.from('users').update({
    first_name: `Past${name}`,
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

const addRole = async (userId: string, role: 'student' | 'tutor') => {
  const { error } = await admin.from('user_roles').upsert(
    { user_id: userId, role },
    { onConflict: 'user_id,role' },
  );
  if (error) throw error;
};

const makeBooking = async (
  studentId: string,
  tutorId: string,
  status: 'completed' | 'no_show',
  hoursAgo: number,
) => {
  const start = Date.now() - hoursAgo * 60 * 60_000;
  const { data, error } = await admin.from('bookings').insert({
    student_id: studentId,
    tutor_id: tutorId,
    subject: 'QA PAST SCOPE',
    scheduled_at: new Date(start).toISOString(),
    scheduled_end: new Date(start + 60 * 60_000).toISOString(),
    duration_minutes: 60,
    price: 40,
    platform_fee: 0,
    tutor_payout_amount: 40,
    session_type: 'in_person',
    cancellation_deadline: new Date(start - 12 * 60 * 60_000).toISOString(),
    status,
    ...(status === 'no_show'
      ? { no_show_party: 'student', refund_status: 'not_refunded', refund_percent: 0 }
      : {}),
  }).select('id').single();
  if (error || !data) throw error ?? new Error(`Could not create ${status} booking`);
  cleanup.bookings.push(data.id);
  return data.id as string;
};

let stage = 'create users';

try {
  const user = await makeUser('dual');
  const student = await makeUser('student');
  const tutor = await makeUser('tutor');

  await addRole(user.id, 'student');
  await addRole(user.id, 'tutor');
  await addRole(student.id, 'student');
  await addRole(tutor.id, 'tutor');

  const studentCompletedId = await makeBooking(user.id, tutor.id, 'completed', 3);
  const tutorCompletedId = await makeBooking(student.id, user.id, 'completed', 6);
  const noShowId = await makeBooking(user.id, tutor.id, 'no_show', 9);

  stage = 'sign in as dual-role user';
  const signIn = await auth.signInWithPassword(user.email, PASSWORD);
  if (!signIn.ok) throw new Error(signIn.error);

  stage = 'student-side past list';
  const studentPast = await api.listPast('student');
  const studentIds = studentPast.map((booking) => booking.id);
  step('student-side list includes U-as-student completed session', studentIds.includes(studentCompletedId));
  step('student-side list includes the past no-show', studentIds.includes(noShowId));
  step('student-side list excludes U-as-tutor session', !studentIds.includes(tutorCompletedId));

  stage = 'tutor-side past list';
  const tutorPast = await api.listPast('tutor');
  const tutorIds = tutorPast.map((booking) => booking.id);
  step('tutor-side list includes U-as-tutor completed session', tutorIds.includes(tutorCompletedId));
  step('tutor-side list excludes U-as-student completed session', !tutorIds.includes(studentCompletedId));
  step('tutor-side list excludes U-as-student no-show', !tutorIds.includes(noShowId));

  stage = 'unscoped past list';
  const allPast = await api.listPast();
  const allIds = allPast.map((booking) => booking.id);
  step('unscoped list preserves both roles and includes no-show',
    allIds.includes(studentCompletedId) && allIds.includes(tutorCompletedId) && allIds.includes(noShowId));
} catch (error) {
  step(`verification setup/error at ${stage}`, false, error instanceof Error ? error.message : String(error));
} finally {
  if (cleanup.bookings.length) {
    const { error } = await admin.from('bookings').delete().in('id', cleanup.bookings);
    if (error) step('cleanup bookings', false, error.message);
  }
  for (const userId of cleanup.users) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) step('cleanup verification user', false, error.message);
  }
  console.log(`${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}
