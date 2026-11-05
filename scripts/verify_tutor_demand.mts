import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { api, initSupabase, tutorEarnedAmount } from '../packages/core/src/index.ts';
import { DEV_PASSWORD } from './_devPassword.mjs';

const URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const ANON = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
assert(['127.0.0.1', 'localhost'].includes(new globalThis.URL(URL).hostname), 'local Supabase only');

const service = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
const core = initSupabase({ url: URL, anonKey: ANON });
const users: { id: string; email: string }[] = [];
let checks = 0;

function pass(label: string, condition: boolean) {
  assert.ok(condition, label);
  console.log(`✅ ${label}`);
  checks += 1;
}

function must(error: { message: string } | null, label: string) {
  if (error) throw new Error(`${label}: ${error.message}`);
}

async function createUser(role: 'student' | 'tutor') {
  const email = `tutor-demand-${role}-${crypto.randomUUID()}@crimson.ua.edu`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: DEV_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('missing user');
  users.push({ id: data.user.id, email });
  const { error: roleError } = await service.from('user_roles')
    .upsert({ user_id: data.user.id, role }, { onConflict: 'user_id,role' });
  must(roleError, 'create fixture role');
  return { id: data.user.id, email };
}

async function digestNotifications(userId: string) {
  const { data, error } = await service.from('notifications')
    .select('title, body, data')
    .eq('user_id', userId)
    .eq('type', 'system');
  must(error, 'read fixture notifications');
  return (data ?? []).filter((row) => row.data?.event === 'tutor_weekly_digest');
}

async function cleanupFixtures(ids: string[]) {
  if (ids.length === 0) return;
  for (const [table, column] of [
    ['notifications', 'user_id'],
    ['tutor_digests_sent', 'tutor_id'],
    ['course_requests', 'student_id'],
    ['analytics_events', 'user_id'],
    ['tutor_courses', 'tutor_id'],
    ['tutor_profiles', 'user_id'],
  ] as const) {
    const { error } = await service.from(table).delete().in(column, ids);
    must(error, `clean up ${table}`);
  }
  for (const column of ['student_id', 'tutor_id'] as const) {
    const { error } = await service.from('bookings').delete().in(column, ids);
    must(error, `clean up bookings by ${column}`);
  }
  for (const id of ids) {
    const { error } = await service.auth.admin.deleteUser(id);
    if (error && !error.message.toLowerCase().includes('user not found')) {
      console.warn(`Could not delete tutor-demand fixture ${id}: ${error.message}`);
    }
  }
}

try {
  const { data: staleFixtures, error: staleFixturesError } = await service.from('users')
    .select('id')
    .like('email', 'tutor-demand-%');
  must(staleFixturesError, 'find stale tutor-demand fixtures');
  await cleanupFixtures((staleFixtures ?? []).map((user) => user.id));

  const tutor = await createUser('tutor');
  const zeroActivityTutor = await createUser('tutor');
  const students = await Promise.all([
    createUser('student'),
    createUser('student'),
    createUser('student'),
  ]);
  const suspendedViewer = await createUser('student');
  const bookingStudents = await Promise.all([
    createUser('student'),
    createUser('student'),
  ]);
  const { data: catalogRows, error: catalogError } = await service.from('courses')
    .select('course_code')
    .eq('is_active', true)
    .order('course_code')
    .limit(1000);
  must(catalogError, 'read catalog courses');
  const { data: existingOpenRequests, error: existingOpenRequestsError } = await service.from('course_requests')
    .select('course_code')
    .eq('status', 'open');
  must(existingOpenRequestsError, 'read existing course requests');
  const alreadyRequested = new Set((existingOpenRequests ?? []).map((request) => request.course_code));
  const courseCodes = [...new Set((catalogRows ?? []).map((row) => row.course_code).filter(Boolean))]
    .filter((code) => !alreadyRequested.has(code));
  if (courseCodes.length < 3) throw new Error('three active catalog course codes are required');
  const [courseA, courseB, courseC] = courseCodes as [string, string, string];

  for (const fixtureTutor of [tutor, zeroActivityTutor]) {
    const { error } = await service.from('tutor_profiles').insert({
      user_id: fixtureTutor.id,
      hourly_rate: 30,
      approval_status: 'approved',
    });
    must(error, 'create approved tutor profile');
  }
  const { error: coursesError } = await service.from('tutor_courses').insert([
    { tutor_id: tutor.id, course_code: courseA, grade: 'A', hourly_rate: 30 },
    { tutor_id: tutor.id, course_code: courseB, grade: 'A', hourly_rate: 30 },
  ]);
  must(coursesError, 'create tutor courses');

  const now = new Date();
  const { error: suspendViewerError } = await service.from('users')
    .update({ status: 'suspended' })
    .eq('id', suspendedViewer.id);
  must(suspendViewerError, 'suspend profile view fixture');
  const oldRequestAt = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000).toISOString();
  const { error: requestError } = await service.from('course_requests').insert([
    { student_id: students[0]!.id, course_code: courseA, created_at: now.toISOString() },
    { student_id: students[1]!.id, course_code: courseA, created_at: now.toISOString() },
    { student_id: students[2]!.id, course_code: courseB, created_at: now.toISOString() },
    { student_id: students[0]!.id, course_code: courseC, created_at: now.toISOString() },
    { student_id: tutor.id, course_code: courseA, created_at: now.toISOString() },
    { student_id: students[2]!.id, course_code: courseA, created_at: oldRequestAt },
  ]);
  must(requestError, 'create course request fixtures');

  const { error: viewError } = await service.from('analytics_events').insert([
    ...Array.from({ length: 5 }, () => ({
      user_id: students[0]!.id,
      event: 'tutor_profile_viewed',
      props: { tutorId: tutor.id },
      created_at: now.toISOString(),
    })),
    {
      user_id: tutor.id,
      event: 'tutor_profile_viewed',
      props: { tutorId: tutor.id },
      created_at: now.toISOString(),
    },
  ]);
  must(viewError, 'create profile view fixtures');

  const earnings = [
    {
      status: 'completed' as const,
      refundStatus: 'not_applicable' as const,
      refundPercent: 0,
      refundedCents: null,
    },
    {
      status: 'cancelled' as const,
      refundStatus: 'refunded' as const,
      refundPercent: 50,
      refundedCents: null,
    },
  ];
  for (let index = 0; index < earnings.length; index += 1) {
    const fixture = earnings[index]!;
    const scheduledAt = new Date(now.getTime() - (index + 1) * 24 * 60 * 60 * 1000);
    const { data, error } = await service.from('bookings').insert({
      student_id: bookingStudents[index]!.id,
      tutor_id: tutor.id,
      subject: courseA,
      scheduled_at: scheduledAt.toISOString(),
      duration_minutes: 60,
      price: 40,
      student_fee: 5.25,
      credit_applied: 2.5,
      platform_fee: 7,
      tutor_payout_amount: 33.25,
      session_type: 'in_person',
      status: fixture.status,
      cancellation_deadline: new Date(scheduledAt.getTime() - 12 * 60 * 60 * 1000).toISOString(),
      refund_status: fixture.refundStatus,
      refund_percent: fixture.refundPercent,
      refunded_cents: fixture.refundedCents,
    }).select('id').single();
    must(error, 'create earnings booking');
    if (!data) throw new Error('missing booking id');
  }

  const studentClient = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const studentLogin = await studentClient.auth.signInWithPassword({
    email: students[0]!.email,
    password: DEV_PASSWORD,
  });
  must(studentLogin.error, 'sign in fixture student');
  const studentDemand = await studentClient.rpc('my_tutor_demand');
  pass('student without a tutor profile is denied my_tutor_demand with 42501',
    studentDemand.error?.code === '42501');
  const anonDemand = await anon.rpc('my_tutor_demand');
  pass('anonymous caller is denied my_tutor_demand', !!anonDemand.error);
  const directDemand = await studentClient.rpc('tutor_demand_for', {
    p_tutor: tutor.id,
    p_since: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
  pass('student cannot call tutor_demand_for', !!directDemand.error);
  const directDigest = await studentClient.rpc('send_tutor_weekly_digest', { p_now: now.toISOString() });
  pass('student cannot call send_tutor_weekly_digest', !!directDigest.error);
  const sentTable = await studentClient.from('tutor_digests_sent').select('*');
  pass('student cannot read tutor_digests_sent', !!sentTable.error);

  const tutorLogin = await core.auth.signInWithPassword({ email: tutor.email, password: DEV_PASSWORD });
  must(tutorLogin.error, 'sign in fixture tutor');
  const demand = await api.tutorDemand();
  pass('five same-day profile views from one active viewer count as one',
    demand.profileViews === 1 && demand.uniqueViewers === 1);
  pass('profile views exclude self-views', demand.profileViews === 1 && demand.uniqueViewers === 1);

  const { error: otherViewerError } = await service.from('analytics_events').insert({
    user_id: students[1]!.id,
    event: 'tutor_profile_viewed',
    props: { tutorId: tutor.id },
    created_at: now.toISOString(),
  });
  must(otherViewerError, 'create second active viewer event');
  const demandWithOtherViewer = await api.tutorDemand();
  pass('a second active viewer counts once',
    demandWithOtherViewer.profileViews === 2 && demandWithOtherViewer.uniqueViewers === 2);

  const { error: suspendedViewError } = await service.from('analytics_events').insert({
    user_id: suspendedViewer.id,
    event: 'tutor_profile_viewed',
    props: { tutorId: tutor.id },
    created_at: now.toISOString(),
  });
  must(suspendedViewError, 'create suspended viewer event');
  const demandWithSuspendedViewer = await api.tutorDemand();
  pass('a suspended viewer event is excluded from both counts',
    demandWithSuspendedViewer.profileViews === 2 && demandWithSuspendedViewer.uniqueViewers === 2);

  const requestsByCourse = new Map(demand.openRequests.map((request) => [request.courseCode, request.requests]));
  pass('open requests include only active requests for the tutor’s courses and other requesters',
    demand.openRequests.length === 2 &&
    requestsByCourse.get(courseA) === 2 &&
    requestsByCourse.get(courseB) === 1 &&
    demand.openRequestTotal === 3);
  const orderedRequests = [...demand.openRequests].sort((a, b) =>
    b.requests - a.requests || a.courseCode.localeCompare(b.courseCode));
  pass('course request entries are sorted by request count descending',
    demand.openRequests.every((request, index) =>
      request.courseCode === orderedRequests[index]?.courseCode));
  const expectedEarnedCents = earnings.reduce((total, fixture) => total + Math.round(tutorEarnedAmount({
    status: fixture.status,
    refundStatus: fixture.refundStatus,
    refundPercent: fixture.refundPercent,
    refundedCents: fixture.refundedCents,
    price: 40,
    studentFee: 5.25,
    creditApplied: 2.5,
    tutorPayoutAmount: 33.25,
  }) * 100), 0);
  pass('SQL earnings match tutorEarnedAmount for completed and 50%-refunded cancelled bookings',
    Math.round(demand.earned * 100) === expectedEarnedCents);
  pass('completed session count includes only completed bookings', demand.sessionsCompleted === 1);

  const pNow = new Date(Date.now() + 1000).toISOString();
  const { error: firstDigestError } = await service.rpc('send_tutor_weekly_digest', { p_now: pNow });
  must(firstDigestError, 'send weekly tutor digest');
  const firstNotifications = await digestNotifications(tutor.id);
  const zeroNotifications = await digestNotifications(zeroActivityTutor.id);
  pass('service digest sends one notification to the active tutor',
    firstNotifications.length === 1 && firstNotifications[0]?.title === 'Your week on Noot');
  pass('service digest skips the zero-activity tutor', zeroNotifications.length === 0);
  pass('digest notification includes demand sections and the weekly event',
    firstNotifications[0]?.data?.event === 'tutor_weekly_digest' &&
    firstNotifications[0]?.data?.weekStart != null &&
    firstNotifications[0]?.body.includes('2 times by 2 students') &&
    firstNotifications[0]?.body.includes(`${courseA}: 2 requests`) &&
    firstNotifications[0]?.body.includes(`${courseB}: 1 request`) &&
    firstNotifications[0]?.body.includes('You earned $49.88 this week.') &&
    firstNotifications[0]?.body.includes('You completed 1 session.'));

  const { error: secondDigestError } = await service.rpc('send_tutor_weekly_digest', { p_now: pNow });
  must(secondDigestError, 'send second weekly tutor digest');
  pass('second same-week call does not duplicate the tutor notification',
    (await digestNotifications(tutor.id)).length === 1);
  const zeroSentRows = await service.from('tutor_digests_sent').select('week_start').eq('tutor_id', zeroActivityTutor.id);
  must(zeroSentRows.error, 'read digest dedupe rows');
  pass('zero-activity tutor has no sent-digest row', (zeroSentRows.data ?? []).length === 0);
  console.log(`${checks} checks passed`);
} finally {
  await core.auth.signOut();
  await cleanupFixtures(users.map((user) => user.id));
}
