import { createClient } from '@supabase/supabase-js';
import { DEV_PASSWORD } from './_devPassword.mjs';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
if (!['127.0.0.1', 'localhost'].includes(new globalThis.URL(URL).hostname)) {
  throw new Error('verify_tutor_busy_times only runs against local Supabase');
}

const tag = Date.now();
const PASSWORD = DEV_PASSWORD;
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const users: string[] = [];
const bookingIds: string[] = [];
const interviewIds: string[] = [];
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

const makeUser = async (name: string, role: 'student' | 'tutor') => {
  const email = `busy-times-${name}-${tag}@crimson.ua.edu`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error(`createUser failed for ${name}`);
  users.push(data.user.id);
  const { error: profileError } = await admin.from('users').update({
    first_name: 'Busy',
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
  return client;
};

const atOffset = (hours: number) => {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  date.setMinutes(0, 0, 0);
  date.setHours(date.getHours() + hours);
  return date;
};

const createBooking = async (
  studentId: string,
  tutorId: string,
  status: 'pending' | 'confirmed' | 'cancelled',
  start: Date,
) => {
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const { data, error } = await admin.from('bookings').insert({
    student_id: studentId,
    tutor_id: tutorId,
    subject: 'BSC 103',
    scheduled_at: start.toISOString(),
    duration_minutes: 60,
    price: 50,
    platform_fee: 8.75,
    student_fee: 8.5,
    tutor_payout_amount: 41.25,
    session_type: 'in_person',
    status,
    cancellation_deadline: new Date(start.getTime() - 12 * 60 * 60 * 1000).toISOString(),
    refund_status: 'not_applicable',
    accept_by: new Date(start.getTime() - 24 * 60 * 60 * 1000).toISOString(),
  }).select('id, scheduled_at, scheduled_end').single();
  if (error || !data) throw error ?? new Error(`could not create ${status} booking`);
  bookingIds.push(data.id);
  return { id: data.id as string, startsAt: data.scheduled_at as string, endsAt: data.scheduled_end as string };
};

const createInterview = async (tutorId: string, start: Date, cancelled: boolean) => {
  const { data, error } = await admin.from('tutor_interviews').insert({
    tutor_id: tutorId,
    scheduled_at: start.toISOString(),
    details: 'Busy-times verification',
    cancelled_at: cancelled ? new Date().toISOString() : null,
  }).select('id, scheduled_at').single();
  if (error || !data) throw error ?? new Error('could not create interview');
  interviewIds.push(data.id);
  return {
    startsAt: data.scheduled_at as string,
    endsAt: new Date(new Date(data.scheduled_at).getTime() + 60 * 60 * 1000).toISOString(),
  };
};

const sameRanges = (actual: Array<{ starts_at: string; ends_at: string }>, expected: Array<{ startsAt: string; endsAt: string }>) => {
  const normalize = (ranges: Array<{ startsAt?: string; endsAt?: string; starts_at?: string; ends_at?: string }>) =>
    ranges.map((range) => [
      new Date(range.startsAt ?? range.starts_at!).toISOString(),
      new Date(range.endsAt ?? range.ends_at!).toISOString(),
    ].join('/')).sort();
  return JSON.stringify(normalize(actual)) === JSON.stringify(normalize(expected));
};
const hasRange = (
  ranges: Array<{ starts_at: string; ends_at: string }>,
  expected: { startsAt: string; endsAt: string },
) => ranges.some((range) => sameRanges([range], [expected]));

try {
  const tutor = await makeUser('tutor', 'tutor');
  const student = await makeUser('student', 'student');
  const otherStudent = await makeUser('other-student', 'student');
  const studentClient = await signIn(student.email);
  const otherStudentClient = await signIn(otherStudent.email);

  stage = 'create fixtures';
  const base = atOffset(0);
  const pending = await createBooking(student.id, tutor.id, 'pending', new Date(base.getTime() + 60 * 60 * 1000));
  const confirmed = await createBooking(student.id, tutor.id, 'confirmed', new Date(base.getTime() + 3 * 60 * 60 * 1000));
  const cancelled = await createBooking(student.id, tutor.id, 'cancelled', new Date(base.getTime() + 5 * 60 * 60 * 1000));
  const interview = await createInterview(tutor.id, new Date(base.getTime() + 7 * 60 * 60 * 1000), false);
  const cancelledInterview = await createInterview(tutor.id, new Date(base.getTime() + 9 * 60 * 60 * 1000), true);

  const from = new Date(base.getTime() - 60 * 60 * 1000).toISOString();
  const to = new Date(base.getTime() + 12 * 60 * 60 * 1000).toISOString();
  const expected = [pending, confirmed, interview];
  const { data: actual, error: busyError } = await studentClient.rpc('tutor_busy_times', {
    p_tutor: tutor.id,
    p_from: from,
    p_to: to,
    p_exclude_booking: null,
  });
  if (busyError) throw busyError;
  const ranges = (actual ?? []) as Array<{ starts_at: string; ends_at: string }>;
  check('pending and confirmed bookings returned as exact ranges',
    hasRange(ranges, pending) && hasRange(ranges, confirmed),
    `${ranges.length} live ranges`);
  check('cancelled bookings and interviews are not returned',
    ranges.length === 3 && !hasRange(ranges, cancelled) && !hasRange(ranges, cancelledInterview),
    `${ranges.length} returned`);
  check('live interview blocks its scheduled 60-minute range',
    hasRange(ranges, interview));
  check('returned rows expose only starts_at and ends_at',
    ranges.every((range) => Object.keys(range).sort().join(',') === 'ends_at,starts_at'));

  const { data: excluding, error: excludeError } = await studentClient.rpc('tutor_busy_times', {
    p_tutor: tutor.id,
    p_from: from,
    p_to: to,
    p_exclude_booking: pending.id,
  });
  if (excludeError) throw excludeError;
  const excludedRanges = (excluding ?? []) as Array<{ starts_at: string; ends_at: string }>;
  check('p_exclude_booking removes exactly its booking',
    sameRanges(excludedRanges, [confirmed, interview]),
    `${excludedRanges.length} ranges remain`);

  const { data: otherRanges, error: otherError } = await otherStudentClient.rpc('tutor_busy_times', {
    p_tutor: tutor.id,
    p_from: from,
    p_to: to,
    p_exclude_booking: null,
  });
  if (otherError) throw otherError;
  check('a student outside the bookings sees the same busy ranges',
    sameRanges((otherRanges ?? []) as Array<{ starts_at: string; ends_at: string }>, expected));

  const anonymous = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: anonError } = await anonymous.rpc('tutor_busy_times', {
    p_tutor: tutor.id,
    p_from: from,
    p_to: to,
    p_exclude_booking: null,
  });
  check('anon cannot execute the RPC', anonError?.code === '42501', anonError?.code ?? 'no error');

  const { error: longRangeError } = await studentClient.rpc('tutor_busy_times', {
    p_tutor: tutor.id,
    p_from: from,
    p_to: new Date(new Date(from).getTime() + 16 * 24 * 60 * 60 * 1000).toISOString(),
    p_exclude_booking: null,
  });
  check('ranges longer than 15 days are rejected', !!longRangeError, longRangeError?.code ?? '');

  const { error: invalidRangeError } = await studentClient.rpc('tutor_busy_times', {
    p_tutor: tutor.id,
    p_from: to,
    p_to: from,
    p_exclude_booking: null,
  });
  check('p_to <= p_from is rejected', !!invalidRangeError, invalidRangeError?.code ?? '');
} catch (error) {
  fail++;
  console.error(`❌ ${stage} — ${error instanceof Error ? error.message : String(error)}`);
} finally {
  if (bookingIds.length) {
    await remove('bookings', admin.from('bookings').delete().in('id', bookingIds));
  }
  if (interviewIds.length) {
    await remove('interviews', admin.from('tutor_interviews').delete().in('id', interviewIds));
  }
  if (users.length) {
    await remove('user roles', admin.from('user_roles').delete().in('user_id', users));
    await remove('profiles', admin.from('users').delete().in('id', users));
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
