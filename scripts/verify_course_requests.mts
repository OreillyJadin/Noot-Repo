import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { api, initSupabase } from '../packages/core/src/index.ts';
import { DEV_PASSWORD } from './_devPassword.mjs';

const URL = 'http://127.0.0.1:54321';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const service = createClient(URL, SERVICE, { auth: { persistSession: false } });
const anon = createClient(URL, ANON, { auth: { persistSession: false } });
const core = initSupabase({ url: URL, anonKey: ANON });
const tag = `course-requests-${Date.now()}`;
const users: { id: string; email: string }[] = [];
const bookingIds: string[] = [];
const tutorCourseIds: string[] = [];
const signedInClients: ReturnType<typeof createClient>[] = [];
let checks = 0;
let originalMfaSetting: unknown;
let mfaSettingChanged = false;

function pass(message: string, condition = true): void {
  assert.ok(condition, message);
  checks++;
  console.log(`✅ ${message}`);
}

function must(error: unknown): void {
  if (error) throw error;
}

async function createFixtureUser(name: string, role?: 'tutor' | 'admin') {
  const email = `${tag}-${name}@crimson.ua.edu`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: DEV_PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: 'Course', last_name: 'Request' },
  });
  must(error);
  if (!data.user) throw new Error(`Could not create ${name}`);
  const fixture = { id: data.user.id, email };
  users.push(fixture);
  must((await service.from('users').update({
    first_name: 'Course',
    last_name: 'Request',
    terms_accepted_at: new Date().toISOString(),
    terms_version: '2026-08-11',
  }).eq('id', fixture.id)).error);
  if (role) {
    must((await service.from('user_roles').upsert({ user_id: fixture.id, role })).error);
  }
  if (role === 'tutor') {
    must((await service.from('tutor_profiles').insert({ user_id: fixture.id, hourly_rate: 30 })).error);
  }
  return fixture;
}

async function signIn(email: string) {
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  signedInClients.push(client);
  const { error } = await client.auth.signInWithPassword({ email, password: DEV_PASSWORD });
  must(error);
  return client;
}

async function allCatalogCodes(): Promise<string[]> {
  const rows: { course_code: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await service.from('courses')
      .select('course_code')
      .eq('is_active', true)
      .order('course_code')
      .range(from, from + 999);
    must(error);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return [...new Set(rows.map((row) => row.course_code))].sort();
}

async function allTutorCourseCodes(): Promise<Set<string>> {
  const rows: { course_code: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await service.from('tutor_courses')
      .select('course_code')
      .order('course_code')
      .range(from, from + 999);
    must(error);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return new Set(rows.map((row) => row.course_code));
}

async function addTutorCourse(tutorId: string, courseCode: string): Promise<void> {
  const { data, error } = await service.from('tutor_courses')
    .insert({ tutor_id: tutorId, course_code: courseCode, grade: 'A', hourly_rate: 30 })
    .select('id')
    .single();
  must(error);
  if (data?.id) tutorCourseIds.push(data.id);
}

async function notificationCount(userId: string, courseCode: string): Promise<number> {
  const { data, error } = await service.from('notifications')
    .select('data')
    .eq('user_id', userId)
    .eq('type', 'system');
  must(error);
  return (data ?? []).filter((row) =>
    row.data?.event === 'course_request_covered' && row.data?.courseCode === courseCode,
  ).length;
}

try {
  const activeCodes = await allCatalogCodes();
  const alreadyOffered = await allTutorCourseCodes();
  const { data: activeRequests, error: requestsError } = await service.from('course_requests')
    .select('course_code')
    .eq('status', 'open');
  must(requestsError);
  const alreadyRequested = new Set((activeRequests ?? []).map((row) => row.course_code));
  const unoffered = activeCodes.filter((code) => !alreadyOffered.has(code) && !alreadyRequested.has(code));
  const byPrefix = new Map<string, string[]>();
  for (const code of unoffered) {
    const prefix = code.trim().split(/\s+/)[0]!;
    byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), code]);
  }
  const allByPrefix = new Map<string, number>();
  for (const code of activeCodes) {
    const prefix = code.trim().split(/\s+/)[0]!;
    allByPrefix.set(prefix, (allByPrefix.get(prefix) ?? 0) + 1);
  }
  const pair = [...byPrefix].find(([prefix, codes]) => codes.length >= 2 && (allByPrefix.get(prefix) ?? 0) <= 50);
  if (!pair) throw new Error('No pair of unused real catalog codes with a searchable prefix was found');
  const prefix = pair[0];
  const coveredCode = pair[1][0]!;
  const uncoveredCode = pair[1][1]!;
  const otherCodes = unoffered.filter((code) => code !== coveredCode && code !== uncoveredCode);
  if (otherCodes.length < 6) throw new Error('At least six additional unused real catalog codes are required');
  const requestCodes = [uncoveredCode, ...otherCodes.slice(0, 3)];
  const approvalCode = otherCodes[3]!;
  const coveredRequestCode = otherCodes[4]!;
  const staleCode = otherCodes[5]!;
  pass(`selected real, seed-unoffered catalog codes (${prefix})`);

  const studentOne = await createFixtureUser('student-one');
  const studentTwo = await createFixtureUser('student-two');
  const tutorOne = await createFixtureUser('tutor-one', 'tutor');
  const tutorTwo = await createFixtureUser('tutor-two', 'tutor');
  const admin = await createFixtureUser('admin', 'admin');
  const studentTwoClient = await signIn(studentTwo.email);
  const studentOneLogin = await core.auth.signInWithPassword({ email: studentOne.email, password: DEV_PASSWORD });
  must(studentOneLogin.error);

  const created = await core.rpc('request_course_tutor', { p_course_code: coveredCode });
  must(created.error);
  pass('student request is created', created.data?.created === true);
  const first = await api.courseRequests.request(coveredCode);
  pass('core request API maps the course request', first.courseCode === coveredCode && first.status === 'open');
  const firstStored = await service.from('course_requests').select('id, created_at')
    .eq('student_id', studentOne.id).eq('course_code', coveredCode).eq('status', 'open').single();
  must(firstStored.error);
  const duplicate = await core.rpc('request_course_tutor', { p_course_code: coveredCode });
  must(duplicate.error);
  pass('repeat request is idempotent and retains the request id',
    duplicate.data?.created === false && duplicate.data?.id === firstStored.data!.id);

  const { error: invalidCodeError } = await core.rpc('request_course_tutor', { p_course_code: 'ZZZZ 999' });
  pass('non-catalog course code is rejected with 23514',
    invalidCodeError?.code === '23514' && invalidCodeError.message === 'Choose a course from the catalog.');

  const secondRequest = await studentTwoClient.rpc('request_course_tutor', { p_course_code: coveredCode });
  must(secondRequest.error);
  pass('another student can create a request for the same course', secondRequest.data?.created === true);

  pass('student cannot directly insert course requests',
    !!(await core.from('course_requests').insert({ student_id: studentOne.id, course_code: staleCode })).error);
  pass('student cannot directly update course requests',
    !!(await core.from('course_requests').update({ status: 'fulfilled' }).eq('id', firstStored.data!.id)).error);
  pass('student cannot directly delete course requests',
    !!(await core.from('course_requests').delete().eq('id', firstStored.data!.id)).error);
  const isolated = await core.from('course_requests').select('id').eq('student_id', studentTwo.id);
  must(isolated.error);
  pass('RLS hides another student’s requests', (isolated.data ?? []).length === 0);

  const anonRequest = await anon.rpc('request_course_tutor', { p_course_code: coveredCode });
  pass('anonymous request RPC is denied', !!anonRequest.error);
  const anonAdminQuery = await anon.rpc('admin_course_requests');
  pass('anonymous admin aggregate is denied', !!anonAdminQuery.error);
  const anonSearch = await anon.rpc('search_courses', { p_query: prefix, p_limit: 5 });
  pass('anonymous course search RPC is denied', !!anonSearch.error);
  const studentAdminQuery = await core.rpc('admin_course_requests');
  pass('student is denied the admin course-request aggregate', studentAdminQuery.error?.code === '42501');

  must((await service.from('users').update({ status: 'suspended' }).eq('id', studentOne.id)).error);
  const suspended = await core.rpc('request_course_tutor', { p_course_code: coveredCode });
  pass('suspended student is denied with 42501',
    suspended.error?.code === '42501' && suspended.error.message === 'account is not active');
  const suspendedSearch = await core.rpc('search_courses', { p_query: prefix, p_limit: 5 });
  pass('suspended student is denied course search with 42501', suspendedSearch.error?.code === '42501');
  must((await service.from('users').update({ status: 'active' }).eq('id', studentOne.id)).error);

  for (const courseCode of requestCodes) {
    const { data, error } = await core.rpc('request_course_tutor', { p_course_code: courseCode });
    must(error);
    pass(`student request for ${courseCode} created`, data?.created === true);
  }
  const mine = await api.courseRequests.listMine();
  pass('core listMine returns only the student’s active open requests',
    mine.length === 5 && mine.every((request) => request.status === 'open'));
  const sixth = await core.rpc('request_course_tutor', { p_course_code: staleCode });
  pass('sixth distinct request in 24 hours is denied with P0001',
    sixth.error?.code === 'P0001' && sixth.error.message === 'You can request up to 5 courses a day.');

  must((await service.from('tutor_profiles').update({ approval_status: 'approved' }).eq('user_id', tutorOne.id)).error);
  await addTutorCourse(tutorOne.id, coveredCode);
  pass('coverage on tutor-course insert notifies open requesters once',
    await notificationCount(studentOne.id, coveredCode) === 1 &&
    await notificationCount(studentTwo.id, coveredCode) === 1);
  const notified = await service.from('course_requests').select('notified_at')
    .eq('student_id', studentOne.id).eq('course_code', coveredCode).eq('status', 'open').single();
  must(notified.error);
  pass('coverage stamps notified_at', !!notified.data!.notified_at);
  const notification = await service.from('notifications').select('title, body, data')
    .eq('user_id', studentOne.id).eq('type', 'system').limit(20);
  must(notification.error);
  const coverageNotice = (notification.data ?? []).find((row) =>
    row.data?.event === 'course_request_covered' && row.data?.courseCode === coveredCode,
  );
  pass('coverage notification carries the specified title, body, and course event',
    coverageNotice?.title === `A tutor for ${coveredCode} is on Noot` &&
    coverageNotice.body === 'Tap to see who teaches it and book a session.');

  const search = await api.courses.search(prefix, 50);
  const coveredIndex = search.findIndex((course) => course.courseCode === coveredCode);
  const uncoveredIndex = search.findIndex((course) => course.courseCode === uncoveredCode);
  pass('course search returns covered course before uncovered course with accurate flags',
    coveredIndex >= 0 && uncoveredIndex >= 0 && coveredIndex < uncoveredIndex &&
    search[coveredIndex]?.hasTutor === true && search[uncoveredIndex]?.hasTutor === false);
  const byCode = await api.courses.byCodes([coveredCode, uncoveredCode]);
  pass('byCodes marks course coverage unknown as false',
    byCode[coveredCode]?.hasTutor === false && byCode[uncoveredCode]?.hasTutor === false);

  await addTutorCourse(tutorTwo.id, approvalCode);
  const approvalRequest = await studentTwoClient.rpc('request_course_tutor', { p_course_code: approvalCode });
  must(approvalRequest.error);
  pass('request for a pending tutor is created', approvalRequest.data?.created === true);
  pass('pending tutor offering does not notify', await notificationCount(studentTwo.id, approvalCode) === 0);
  must((await service.from('tutor_profiles').update({ approval_status: 'approved' }).eq('user_id', tutorTwo.id)).error);
  pass('tutor approval transition notifies its open requesters',
    await notificationCount(studentTwo.id, approvalCode) === 1);

  await addTutorCourse(tutorTwo.id, coveredCode);
  pass('a second tutor adding the covered course does not re-notify students',
    await notificationCount(studentOne.id, coveredCode) === 1 &&
    await notificationCount(studentTwo.id, coveredCode) === 1);

  await addTutorCourse(tutorOne.id, coveredRequestCode);
  const coveredRequest = await studentTwoClient.rpc('request_course_tutor', { p_course_code: coveredRequestCode });
  must(coveredRequest.error);
  pass('a student may create a request even when the course is already covered',
    coveredRequest.data?.created === true);

  const adminClient = await signIn(admin.email);
  const setting = await service.from('app_settings').select('value').eq('key', 'require_admin_mfa').single();
  must(setting.error);
  originalMfaSetting = setting.data!.value;
  const adminRows = await adminClient.rpc('admin_course_requests');
  must(adminRows.error);
  const adminCourse = (adminRows.data ?? []).find((row) => row.course_code === coveredCode);
  pass('admin aggregate includes the open count and current coverage',
    adminCourse?.requests === 2 && adminCourse.covered === true && !!adminCourse.latest_at);
  pass('admin aggregate contains no student identities',
    !!adminCourse && Object.keys(adminCourse).sort().join(',') ===
      ['course_code', 'course_title', 'requests', 'latest_at', 'covered'].sort().join(','));

  await core.auth.signOut();
  const adminLogin = await core.auth.signInWithPassword({ email: admin.email, password: DEV_PASSWORD });
  must(adminLogin.error);
  const mappedAdminRows = await api.admin.courseRequests();
  const mappedAdminCourse = mappedAdminRows.find((row) => row.courseCode === coveredCode);
  pass('core admin API maps aggregate fields to camel case',
    mappedAdminCourse?.requests === 2 && mappedAdminCourse.covered === true &&
    mappedAdminCourse.courseTitle.length > 0);

  must((await service.from('app_settings').update({ value: true }).eq('key', 'require_admin_mfa')).error);
  mfaSettingChanged = true;
  const mfaDenied = await adminClient.rpc('admin_course_requests');
  pass('admin aggregate enforces the configured MFA requirement', mfaDenied.error?.code === '42501');
  must((await service.from('app_settings').update({ value: originalMfaSetting }).eq('key', 'require_admin_mfa')).error);
  mfaSettingChanged = false;

  const bookingAt = new Date(Date.now() + 86400000);
  const booking = await service.from('bookings').insert({
    student_id: studentOne.id,
    tutor_id: tutorOne.id,
    subject: coveredCode,
    scheduled_at: bookingAt.toISOString(),
    duration_minutes: 60,
    price: 30,
    platform_fee: 6,
    tutor_payout_amount: 24,
    session_type: 'in_person',
    location: 'UA campus',
    cancellation_deadline: new Date(Date.now()).toISOString(),
  }).select('id').single();
  must(booking.error);
  bookingIds.push(booking.data!.id);
  const fulfilled = await service.from('course_requests').select('status, fulfilled_at')
    .eq('student_id', studentOne.id).eq('course_code', coveredCode).single();
  must(fulfilled.error);
  pass('booking insert fulfills the student’s matching request',
    fulfilled.data!.status === 'fulfilled' && !!fulfilled.data!.fulfilled_at);

  const staleCreatedAt = new Date(Date.now() - 31 * 86400000).toISOString();
  const stale = await service.from('course_requests').insert({
    student_id: studentTwo.id,
    course_code: staleCode,
    status: 'open',
    created_at: staleCreatedAt,
  }).select('id').single();
  must(stale.error);
  const reRequest = await studentTwoClient.rpc('request_course_tutor', { p_course_code: staleCode });
  must(reRequest.error);
  const oldStale = await service.from('course_requests').select('status')
    .eq('id', stale.data!.id).single();
  must(oldStale.error);
  const freshStale = await service.from('course_requests').select('id, status, created_at')
    .eq('student_id', studentTwo.id).eq('course_code', staleCode).eq('status', 'open').single();
  must(freshStale.error);
  pass('stale open request expires and a fresh request is created',
    reRequest.data?.created === true && oldStale.data!.status === 'expired' &&
    freshStale.data!.id === reRequest.data?.id && freshStale.data!.status === 'open');

  console.log(`\n${checks} passed, 0 failed`);
} catch (error) {
  console.error(`❌ FAIL — ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  if (mfaSettingChanged) {
    must((await service.from('app_settings').update({ value: originalMfaSetting }).eq('key', 'require_admin_mfa')).error);
  }
  for (const client of signedInClients) await client.auth.signOut({ scope: 'local' });
  await core.auth.signOut({ scope: 'local' });
  if (bookingIds.length) must((await service.from('bookings').delete().in('id', bookingIds)).error);
  if (tutorCourseIds.length) must((await service.from('tutor_courses').delete().in('id', tutorCourseIds)).error);
  if (users.length) {
    const userIds = users.map((user) => user.id);
    must((await service.from('course_requests').delete().in('student_id', userIds)).error);
    must((await service.from('users').delete().in('id', userIds)).error);
    for (const user of users) must((await service.auth.admin.deleteUser(user.id)).error);
  }
}
