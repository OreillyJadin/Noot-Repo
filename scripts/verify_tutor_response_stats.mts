import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { api, auth, initSupabase } from '../packages/core/src/index.ts';
import { DEV_PASSWORD } from './_devPassword.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const host = new URL(SUPABASE_URL).hostname;
if (!['127.0.0.1', 'localhost'].includes(host)) throw new Error('Local Supabase only');

const service = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
const users: string[] = [];
const bookings: string[] = [];
let passed = 0;
let failed = 0;
let bookingSequence = 0;

function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  ok ? passed++ : failed++;
}

async function createUser(label: string, role: 'student' | 'tutor') {
  const email = `response-stats-${label}-${crypto.randomUUID()}@crimson.ua.edu`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: DEV_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('Could not create fixture user');
  const id = data.user.id;
  users.push(id);
  const now = new Date().toISOString();
  const { error: userError } = await service.from('users').update({
    first_name: `Response ${label}`,
    last_name: 'Fixture',
    terms_accepted_at: now,
    terms_version: 'verify_tutor_response_stats',
  }).eq('id', id);
  if (userError) throw userError;
  const { error: roleError } = await service.from('user_roles').upsert(
    { user_id: id, role },
    { onConflict: 'user_id,role' },
  );
  if (roleError) throw roleError;
  if (role === 'tutor') {
    const { error: profileError } = await service.from('tutor_profiles').upsert({
      user_id: id,
      bio: 'I teach with focused practice and clear explanations.',
      subjects: ['MATH 125'],
      hourly_rate: 30,
      approval_status: 'approved',
      submitted_at: now,
    }, { onConflict: 'user_id' });
    if (profileError) throw profileError;
  }
  return { id, email };
}

async function signIn(email: string): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: DEV_PASSWORD });
  if (error) throw error;
  return client;
}

type BookingFixture = {
  createdAt: number;
  status: 'confirmed' | 'cancelled' | 'pending';
  acceptedDelay?: number;
  cancelReason?: 'tutor_no_response';
};

async function addBooking(studentId: string, tutorId: string, fixture: BookingFixture) {
  const scheduledAt = Date.now() + 7 * 24 * 60 * 60_000 + bookingSequence++ * 2 * 60 * 60_000;
  const acceptedAt = fixture.acceptedDelay == null
    ? null
    : new Date(fixture.createdAt + fixture.acceptedDelay * 60_000).toISOString();
  const cancelledAt = fixture.cancelReason
    ? new Date(fixture.createdAt + 12 * 60 * 60_000).toISOString()
    : null;
  const { data, error } = await service.from('bookings').insert({
    student_id: studentId,
    tutor_id: tutorId,
    subject: 'MATH 125',
    scheduled_at: new Date(scheduledAt).toISOString(),
    duration_minutes: 60,
    price: 30,
    student_fee: 5.1,
    platform_fee: 6,
    tutor_payout_amount: 24,
    session_type: 'in_person',
    status: fixture.status,
    cancellation_deadline: new Date(scheduledAt - 12 * 60 * 60_000).toISOString(),
    created_at: new Date(fixture.createdAt).toISOString(),
    accept_by: new Date(fixture.createdAt + 12 * 60 * 60_000).toISOString(),
    accepted_at: acceptedAt,
    cancelled_at: cancelledAt,
    cancel_reason: fixture.cancelReason ?? null,
    refund_percent: fixture.cancelReason ? 100 : 0,
    refund_status: fixture.cancelReason ? 'refunded' : 'not_applicable',
  }).select('id').single();
  if (error || !data) throw error ?? new Error('Booking fixture insert returned no row');
  bookings.push(data.id);
  return data.id;
}

try {
  initSupabase({ url: SUPABASE_URL, anonKey: ANON });
  const student = await createUser('student', 'student');
  const tutor = await createUser('covered', 'tutor');
  const sparseTutor = await createUser('sparse', 'tutor');
  const studentClient = await signIn(student.email);
  const now = Date.now();

  for (const [index, delay] of [10, 30, 50].entries()) {
    await addBooking(student.id, tutor.id, {
      createdAt: now - (5 - index) * 24 * 60 * 60_000,
      status: 'confirmed',
      acceptedDelay: delay,
    });
  }
  await addBooking(student.id, tutor.id, {
    createdAt: now - 2 * 24 * 60 * 60_000,
    status: 'cancelled',
    cancelReason: 'tutor_no_response',
  });
  await addBooking(student.id, tutor.id, {
    createdAt: now - 60 * 60_000,
    status: 'pending',
  });
  await addBooking(student.id, sparseTutor.id, {
    createdAt: now - 2 * 24 * 60 * 60_000,
    status: 'confirmed',
    acceptedDelay: 45,
  });
  await addBooking(student.id, sparseTutor.id, {
    createdAt: now - 24 * 60 * 60_000,
    status: 'confirmed',
    acceptedDelay: 90,
  });

  const { data: stats, error: statsError } = await service
    .from('tutor_response_stats')
    .select('requests, responded, median_response_minutes')
    .eq('tutor_id', tutor.id)
    .single();
  check(
    'three accepted plus one no-response count as four requests, with a 30-minute median',
    !statsError && stats?.requests === 4 && stats.responded === 3 && stats.median_response_minutes === 30,
    statsError?.message ?? JSON.stringify(stats),
  );

  const publicStats = await studentClient
    .from('tutor_public_profiles')
    .select('response_rate, response_median_minutes')
    .eq('id', tutor.id)
    .maybeSingle();
  check(
    'student sees a 75% response rate and 30-minute median',
    !publicStats.error && publicStats.data?.response_rate === 75 &&
      publicStats.data?.response_median_minutes === 30,
    publicStats.error?.message ?? JSON.stringify(publicStats.data),
  );
  const sparseStats = await studentClient
    .from('tutor_public_profiles')
    .select('response_rate, response_median_minutes')
    .eq('id', sparseTutor.id)
    .maybeSingle();
  check(
    'student sees null response fields with fewer than three requests',
    !sparseStats.error && sparseStats.data?.response_rate === null &&
      sparseStats.data?.response_median_minutes === null,
    sparseStats.error?.message ?? JSON.stringify(sparseStats.data),
  );

  const privateStats = await studentClient.from('tutor_response_stats').select('tutor_id');
  check('student cannot select tutor_response_stats', !!privateStats.error, privateStats.error?.message ?? 'query succeeded');
  const refresh = await studentClient.rpc('refresh_tutor_response_stats', { p_tutor: tutor.id });
  check('student cannot call refresh_tutor_response_stats', !!refresh.error, refresh.error?.message ?? 'RPC succeeded');

  const insertId = await addBooking(student.id, sparseTutor.id, {
    createdAt: now - 30 * 60_000,
    status: 'pending',
  });
  check('booking insertion succeeds with the stats trigger installed', !!insertId);

  const { data: sparseAfterPending, error: sparseAfterPendingError } = await service
    .from('tutor_response_stats')
    .select('requests, responded')
    .eq('tutor_id', sparseTutor.id)
    .single();
  check(
    'pending bookings do not count as requests',
    !sparseAfterPendingError && sparseAfterPending?.requests === 2 && sparseAfterPending.responded === 2,
    sparseAfterPendingError?.message ?? JSON.stringify(sparseAfterPending),
  );

  const login = await auth.signInWithPassword(student.email, DEV_PASSWORD);
  if (!login.ok) throw new Error(login.error);
  const mapped = await api.tutors.getById(tutor.id);
  check(
    'core tutor mapper returns response rate and median',
    mapped?.responseRate === 75 && mapped.responseMinutes === 30,
    JSON.stringify(mapped && { responseRate: mapped.responseRate, responseMinutes: mapped.responseMinutes }),
  );

  const { error: backdateError } = await service.from('bookings')
    .update({ created_at: new Date(now - 91 * 24 * 60 * 60_000).toISOString() })
    .eq('tutor_id', tutor.id);
  check('fixture bookings can age out without changing booking response fields', !backdateError, backdateError?.message);
  const refreshAll = await service.rpc('refresh_all_tutor_response_stats');
  check('service role can refresh all tutor response stats', !refreshAll.error, refreshAll.error?.message);
  const agedOutStats = await studentClient
    .from('tutor_public_profiles')
    .select('response_rate, response_median_minutes')
    .eq('id', tutor.id)
    .maybeSingle();
  check(
    'daily refresh clears public response fields after bookings age out',
    !agedOutStats.error && agedOutStats.data?.response_rate === null &&
      agedOutStats.data?.response_median_minutes === null,
    agedOutStats.error?.message ?? JSON.stringify(agedOutStats.data),
  );

  await auth.signOut();
  await studentClient.auth.signOut();
} finally {
  await auth.signOut().catch(() => {});
  if (bookings.length) await service.from('bookings').delete().in('id', bookings);
  for (const id of users) await service.auth.admin.deleteUser(id);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
