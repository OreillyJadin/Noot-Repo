// Verify the admin calendar data layer against the LOCAL Supabase stack.
// Needs: supabase start (migrations applied) and the demo seed.
//   pnpm dlx tsx scripts/verify_admin_calendar.mts
import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { api, auth, initSupabase } from '../packages/core/src/index.ts';

const URL = 'http://127.0.0.1:54321';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const PASSWORD = 'NootCalendar!2026';
const service = createClient(URL, SERVICE, { auth: { persistSession: false } });
const tag = `calendar-${Date.now()}`;
const createdUsers: { id: string; email: string }[] = [];
const bookingIds: string[] = [];
const interviewIds: string[] = [];
let passed = 0;
let failed = 0;

function step(ok: boolean, message: string) {
  console.log(`${ok ? '✅ PASS' : '❌ FAIL'} — ${message}`);
  if (ok) passed++;
  else failed++;
}

function decodeBase32(secret: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const character of secret.toUpperCase().replace(/=+$/, '')) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) throw new Error('Invalid base32 secret');
    value = (value << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function totp(secret: string): string {
  const counter = BigInt(Math.floor(Date.now() / 30_000));
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(counter);
  const digest = createHmac('sha1', decodeBase32(secret)).update(message).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

async function verifyTotp(factorId: string, secret: string) {
  let result = await auth.mfa.verifyCode(factorId, totp(secret));
  if (!result.ok) {
    const delay = 30_000 - (Date.now() % 30_000) + 50;
    await new Promise((resolve) => setTimeout(resolve, delay));
    result = await auth.mfa.verifyCode(factorId, totp(secret));
  }
  if (!result.ok) throw new Error(result.error ?? 'Could not verify the temporary admin TOTP');
}

async function createUser(name: string, firstName: string, lastName: string) {
  const email = `${tag}-${name}@crimson.ua.edu`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: firstName, last_name: lastName },
  });
  if (error || !data.user) throw error ?? new Error(`Could not create ${name}`);
  const user = { id: data.user.id, email };
  createdUsers.push(user);
  const { error: nameError } = await service
    .from('users')
    .update({ first_name: firstName, last_name: lastName })
    .eq('id', user.id);
  if (nameError) throw nameError;
  return user;
}

async function addRole(userId: string, role: 'tutor' | 'admin') {
  const { error } = await service.from('user_roles').upsert(
    { user_id: userId, role },
    { onConflict: 'user_id,role' },
  );
  if (error) throw error;
}

initSupabase({ url: URL, anonKey: ANON });

try {
  const student = await createUser('student', 'Calendar', 'Student');
  const tutor = await createUser('tutor', 'Calendar', 'Tutor');
  const admin = await createUser('admin', 'Calendar', 'Admin');
  await addRole(tutor.id, 'tutor');
  await addRole(admin.id, 'admin');

  const now = Date.now();
  const fromIso = new Date(now - 60_000).toISOString();
  const toIso = new Date(now + 2 * 86_400_000).toISOString();
  const bookingAt = new Date(now + 3_600_000).toISOString();
  const interviewAt = new Date(now + 2 * 3_600_000).toISOString();
  const outsideAt = new Date(now + 7 * 86_400_000).toISOString();

  for (const scheduledAt of [bookingAt, outsideAt]) {
    const { data, error } = await service
      .from('bookings')
      .insert({
        student_id: student.id,
        tutor_id: tutor.id,
        subject: 'CAL 101',
        scheduled_at: scheduledAt,
        duration_minutes: 50,
        price: 40,
        platform_fee: 7,
        tutor_payout_amount: 33,
        session_type: 'in_person',
        location: 'Local calendar verification',
        status: 'confirmed',
        cancellation_deadline: new Date(Date.parse(scheduledAt) - 24 * 60 * 60_000).toISOString(),
      })
      .select('id')
      .single();
    if (error || !data) throw error ?? new Error('Could not insert a verification booking');
    bookingIds.push(data.id);
  }

  const { data: interview, error: interviewError } = await service
    .from('tutor_interviews')
    .insert({ tutor_id: tutor.id, scheduled_at: interviewAt, details: 'Local calendar interview' })
    .select('id')
    .single();
  if (interviewError || !interview) throw interviewError ?? new Error('Could not insert a verification interview');
  interviewIds.push(interview.id);

  const signedIn = await auth.signInWithPassword(admin.email, PASSWORD);
  if (!signedIn.ok) throw new Error(`Admin sign-in failed: ${signedIn.error}`);
  const mfa = await auth.mfa.status();
  if (mfa.state === 'enroll') {
    const enrollment = await auth.mfa.enrollTotp();
    await verifyTotp(enrollment.factorId, enrollment.secret);
  } else if (mfa.state === 'challenge') {
    throw new Error('The newly created verification admin unexpectedly has an existing TOTP factor');
  }

  const events = await api.admin.calendar(fromIso, toIso);
  const bookingId = bookingIds[0]!;
  const outsideBookingId = bookingIds[1]!;
  const bookingEvent = events.find((event) => event.id === bookingId);
  const interviewEvent = events.find((event) => event.id === interview.id);
  step(
    bookingEvent?.kind === 'booking' &&
      bookingEvent.title === 'CAL 101' &&
      bookingEvent.minutes === 50 &&
      bookingEvent.studentName === 'Calendar Student' &&
      bookingEvent.tutorName === 'Calendar Tutor' &&
      bookingEvent.studentId === student.id &&
      bookingEvent.tutorId === tutor.id &&
      bookingEvent.status === 'confirmed',
    'admin receives the in-window booking with names, subject, status and duration',
  );
  step(
    interviewEvent?.kind === 'interview' &&
      interviewEvent.title === 'Tutor interview' &&
      interviewEvent.minutes === null &&
      interviewEvent.studentName === null &&
      interviewEvent.tutorName === 'Calendar Tutor' &&
      interviewEvent.tutorId === tutor.id &&
      interviewEvent.details === 'Local calendar interview' &&
      interviewEvent.status === null,
    'admin receives the in-window interview with tutor name and details',
  );
  step(!events.some((event) => event.id === outsideBookingId), 'booking outside the requested window is excluded');

  await auth.signOut();
  const { data: seededStudent, error: studentLookupError } = await service
    .from('users')
    .select('id')
    .eq('email', 'student@crimson.ua.edu')
    .single();
  if (studentLookupError || !seededStudent) {
    throw studentLookupError ?? new Error('Run node supabase/seed_demo.mjs first');
  }
  const studentSignIn = await auth.signInWithPassword('student@crimson.ua.edu', 'password123');
  if (!studentSignIn.ok) throw new Error(`Seeded student sign-in failed: ${studentSignIn.error}`);
  const studentEvents = await api.admin.calendar(fromIso, toIso);
  step(
    studentEvents.every(
      (event) =>
        event.kind === 'booking' &&
        (event.studentId === seededStudent.id || event.tutorId === seededStudent.id),
    ) && !studentEvents.some((event) => event.kind === 'interview'),
    'plain seeded student sees only their own bookings and no interviews',
  );
  step(
    !studentEvents.some((event) => bookingIds.includes(event.id) || interviewIds.includes(event.id)),
    'plain seeded student cannot see the inserted users’ bookings or interview',
  );
} finally {
  await auth.signOut().catch(() => {});
  if (bookingIds.length) {
    const { error } = await service.from('bookings').delete().in('id', bookingIds);
    if (error) throw error;
  }
  if (interviewIds.length) {
    const { error } = await service.from('tutor_interviews').delete().in('id', interviewIds);
    if (error) throw error;
  }
  for (const user of createdUsers) {
    await service.auth.admin.deleteUser(user.id);
    const { error } = await service.from('users').delete().eq('id', user.id);
    if (error) throw error;
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
