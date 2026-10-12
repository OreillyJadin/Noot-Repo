// Verify configurable session reminders against the LOCAL stack.
//
// Needs: supabase db reset, node supabase/seed_demo.mjs, supabase functions serve
//   pnpm dlx tsx scripts/verify_session_reminders.mts
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { api, auth, initSupabase } from '../packages/core/src/index.ts';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const studentEmail = 'student@crimson.ua.edu';
const tutorEmail = 'sara@crimson.ua.edu';
const PASSWORD = 'password123';

let pass = 0;
let fail = 0;
const step = (ok: boolean, label: string, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
};
const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });
const bookings: string[] = [];
let studentId = '';
let tutorId = '';
let oldStudentPrefs: Record<string, unknown> | null = null;
let oldTutorPrefs: Record<string, unknown> | null = null;

const setPrefs = async (userId: string, minutes: number[], morning = false) => {
  const { error } = await svc.from('reminder_preferences').upsert({
    user_id: userId, minutes_before: minutes, morning_of: morning,
  }, { onConflict: 'user_id' });
  if (error) throw error;
};
const clearPrefs = async () => {
  const { error } = await svc.from('reminder_preferences').delete().in('user_id', [studentId, tutorId]);
  if (error) throw error;
};
const makeBooking = async (scheduledAt: string, status = 'confirmed') => {
  const { data, error } = await svc.from('bookings').insert({
    student_id: studentId,
    tutor_id: tutorId,
    subject: 'MGT 300',
    scheduled_at: scheduledAt,
    duration_minutes: 60,
    price: 32,
    platform_fee: 5.6,
    tutor_payout_amount: 26.4,
    session_type: 'in_person',
    status,
    cancellation_deadline: new Date(Date.now() - 86400000).toISOString(),
  }).select('id').single();
  if (error || !data) throw error ?? new Error('could not create test booking');
  bookings.push(data.id);
  return data.id as string;
};
const reminders = async (bookingId: string, userId?: string) => {
  let query = svc.from('notifications').select('user_id,title,body,data').contains('data', { bookingId });
  if (userId) query = query.eq('user_id', userId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).filter((row) => row.title === 'Upcoming session' || row.title === 'Session today');
};
const runAt = async (pNow?: string) => {
  const { data, error } = await svc.rpc('send_session_reminders', pNow ? { p_now: pNow } : {});
  if (error) throw error;
  return data as number;
};
const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60000).toISOString();
const central = (time: string) => new Date(`2030-06-15T${time}:00-05:00`).toISOString();

try {
  const { data: users, error: usersErr } = await svc.from('users').select('id,email').in('email', [studentEmail, tutorEmail]);
  if (usersErr) throw usersErr;
  studentId = users?.find((u) => u.email === studentEmail)?.id ?? '';
  tutorId = users?.find((u) => u.email === tutorEmail)?.id ?? '';
  if (!studentId || !tutorId) throw new Error('run node supabase/seed_demo.mjs first');

  const { data: oldStudent } = await svc.from('reminder_preferences').select('*').eq('user_id', studentId).maybeSingle();
  const { data: oldTutor } = await svc.from('reminder_preferences').select('*').eq('user_id', tutorId).maybeSingle();
  oldStudentPrefs = oldStudent;
  oldTutorPrefs = oldTutor;
  await clearPrefs();

  initSupabase({ url: URL, anonKey: ANON });
  const signIn = await auth.signInWithPassword(studentEmail, PASSWORD);
  if (!signIn.ok) throw new Error(signIn.error);
  const initialSettings = await api.notifications.getReminderSettings();
  step(initialSettings.minutesBefore.join(',') === '60' && initialSettings.morningOf, 'core defaults to 60 minutes and morning-of');
  await api.notifications.setReminderSettings({ minutesBefore: [30, 60, 30], morningOf: false });
  const savedSettings = await api.notifications.getReminderSettings();
  step(savedSettings.minutesBefore.join(',') === '60,30' && !savedSettings.morningOf, 'core deduplicates and sorts reminder choices');

  await setPrefs(studentId, [60, 30], false);
  await setPrefs(tutorId, [60, 30], false);
  const first = await makeBooking(central('15:00'));
  await runAt(central('14:31'));
  let found = await reminders(first);
  step(found.length === 2 && found.every((n) => n.title === 'Upcoming session' && n.body.includes('30 minutes')), '29 minutes out sends one 30-minute reminder to each participant');
  await runAt(central('14:31'));
  found = await reminders(first);
  step(found.length === 2, 'a second run does not duplicate reminders');

  await clearPrefs();
  const defaultBefore = await makeBooking(central('15:00'));
  await runAt(central('14:31'));
  found = await reminders(defaultBefore);
  step(found.length === 2 && found.every((n) => n.body.includes('29 minutes')), 'no-row defaults send only the 60-minute offset');

  await setPrefs(studentId, [10], false);
  await clearPrefsForTutor();
  const ten = await makeBooking(minutesFromNow(9));
  await runAt();
  const tenStudent = await reminders(ten, studentId);
  const tenTutor = await reminders(ten, tutorId);
  step(tenStudent.length === 1 && tenStudent[0]?.body.includes('10 minutes'), 'student-selected 10-minute reminder uses its offset label');
  step(tenTutor.length === 1 && tenTutor[0]?.body.includes('9 minutes'), 'no-row tutor default sends the 60-minute reminder with actual remaining time');

  await setPrefs(studentId, [], false);
  await setPrefs(tutorId, [], false);
  const off = await makeBooking(minutesFromNow(9));
  await runAt();
  step((await reminders(off, studentId)).length === 0, 'empty offset preferences turn before-reminders off');

  const pending = await makeBooking(minutesFromNow(9), 'pending');
  await runAt();
  step((await reminders(pending)).length === 0, 'pending bookings do not receive reminders');

  await setPrefs(studentId, [30], false);
  await setPrefs(tutorId, [30], false);
  const moved = await makeBooking(minutesFromNow(25));
  await runAt();
  step((await reminders(moved)).length === 2, 'the initial scheduled time is reminded');
  const { error: moveErr } = await svc.from('bookings').update({ scheduled_at: minutesFromNow(20) }).eq('id', moved);
  if (moveErr) throw moveErr;
  await runAt();
  const rescheduledReminders = await reminders(moved);
  step(
    rescheduledReminders.length === 4 &&
      rescheduledReminders.filter((n) => n.user_id === studentId).length === 2 &&
      rescheduledReminders.filter((n) => n.user_id === tutorId).length === 2,
    'a changed scheduled_at gets fresh reminders for both participants',
  );

  const morningPrefs = async (morning: boolean) => {
    await setPrefs(studentId, [], morning);
    await setPrefs(tutorId, [], morning);
  };
  await morningPrefs(true);
  const today = await makeBooking(central('15:00'));
  await runAt(central('06:55'));
  step((await reminders(today)).length === 0, 'morning reminder is not sent before 7 AM Chicago time');
  await runAt(central('07:05'));
  const morningSent = await reminders(today);
  step(morningSent.length === 2 && morningSent.every((n) => n.title === 'Session today' && n.body.endsWith('today.')), 'morning reminder sends to both participants at 7:05');

  const lateMorning = await makeBooking(central('15:00'));
  await runAt(central('07:20'));
  step((await reminders(lateMorning)).length === 0, 'morning reminder is not sent after the 15-minute window');
  const tooEarlySession = await makeBooking(central('07:45'));
  await runAt(central('07:05'));
  step((await reminders(tooEarlySession)).length === 0, 'morning reminder is skipped for a session before 8 AM');

  await setPrefs(studentId, [60], true);
  await setPrefs(tutorId, [60], true);
  const exactlyEight = await makeBooking(central('08:00'));
  await runAt(central('07:00'));
  const eightAmReminders = await reminders(exactlyEight);
  const eightAmBefore = eightAmReminders.filter((n) => n.title === 'Upcoming session');
  const eightAmMorning = eightAmReminders.filter((n) => n.title === 'Session today');
  step(
    eightAmBefore.length === 2 &&
      eightAmBefore.every((n) => n.body.includes('1 hour')) &&
      eightAmMorning.length === 0,
    'an 8 AM session gets the 60-minute reminder but no morning reminder',
  );

  await morningPrefs(true);
  const shortlyAfterEight = await makeBooking(central('08:15'));
  await runAt(central('07:05'));
  const eightFifteenReminders = await reminders(shortlyAfterEight);
  step(
    eightFifteenReminders.length === 2 &&
      eightFifteenReminders.every((n) => n.title === 'Session today'),
    'an 8:15 AM session gets the 7:05 morning reminder',
  );

  await morningPrefs(false);
  const morningOff = await makeBooking(central('15:00'));
  await runAt(central('07:05'));
  step((await reminders(morningOff)).length === 0, 'morning_of=false disables the morning reminder');

  await clearPrefs();
  const { data: studentClientAuth, error: studentAuthErr } = await createClient(URL, ANON, {
    auth: { persistSession: false },
  }).auth.signInWithPassword({ email: studentEmail, password: PASSWORD });
  if (studentAuthErr || !studentClientAuth.session) throw studentAuthErr ?? new Error('student sign in failed');
  const studentClient = createClient(URL, ANON, { auth: { persistSession: false } });
  await studentClient.auth.setSession({
    access_token: studentClientAuth.session.access_token,
    refresh_token: studentClientAuth.session.refresh_token,
  });

  const noRow = await studentClient.from('reminder_preferences').select('*').eq('user_id', studentId);
  const ownWrite = await studentClient.from('reminder_preferences').insert({
    user_id: studentId, minutes_before: [30, 60], morning_of: true,
  });
  const ownRead = await studentClient.from('reminder_preferences').select('minutes_before,morning_of').eq('user_id', studentId).maybeSingle();
  step(!noRow.error && (noRow.data ?? []).length === 0 && !ownWrite.error && ownRead.data?.morning_of, 'authenticated user can read and write their own preferences');
  const crossRead = await studentClient.from('reminder_preferences').select('*').eq('user_id', tutorId);
  step(!crossRead.error && (crossRead.data ?? []).length === 0, 'authenticated user cannot read another user preference');
  const crossWrite = await studentClient.from('reminder_preferences').insert({
    user_id: tutorId, minutes_before: [60], morning_of: true,
  });
  step(!!crossWrite.error, 'authenticated user cannot write another user preference');
  const anonClient = createClient(URL, ANON, { auth: { persistSession: false } });
  const anonRead = await anonClient.from('reminder_preferences').select('*');
  step(!!anonRead.error, 'anon cannot read reminder preferences');
  const invalid = await studentClient.from('reminder_preferences').update({ minutes_before: [7] }).eq('user_id', studentId);
  const overLimit = await studentClient.from('reminder_preferences').update({ minutes_before: [5, 10, 15, 30, 60] }).eq('user_id', studentId);
  step(!!invalid.error && !!overLimit.error, 'invalid offsets and more than four values are rejected');
  const rpcDenied = await studentClient.rpc('send_session_reminders');
  step(!!rpcDenied.error, 'authenticated users cannot execute send_session_reminders');

  const cronJob = execFileSync('docker', [
    'exec', 'supabase_db_noot', 'psql', '-U', 'postgres', '-d', 'postgres', '-Atc',
    "select jobname from cron.job where jobname = 'send-session-reminders'",
  ], { encoding: 'utf8' }).trim();
  step(cronJob === 'send-session-reminders', 'pg_cron has the send-session-reminders job');
} finally {
  if (studentId && tutorId) {
    await svc.from('notifications').delete().in('user_id', [studentId, tutorId]).in('data->>bookingId', bookings);
    if (bookings.length) await svc.from('bookings').delete().in('id', bookings);
    await clearPrefs();
    if (oldStudentPrefs) await svc.from('reminder_preferences').upsert(oldStudentPrefs, { onConflict: 'user_id' });
    if (oldTutorPrefs) await svc.from('reminder_preferences').upsert(oldTutorPrefs, { onConflict: 'user_id' });
  }
  await auth.signOut().catch(() => {});
}

async function clearPrefsForTutor() {
  const { error } = await svc.from('reminder_preferences').delete().eq('user_id', tutorId);
  if (error) throw error;
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
