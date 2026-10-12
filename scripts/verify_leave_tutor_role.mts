// Verify leaving a tutor role against the LOCAL stack.
//
// Needs: supabase db reset, node supabase/seed_demo.mjs, supabase functions serve
//   pnpm dlx tsx scripts/verify_leave_tutor_role.mts
import { createClient } from '@supabase/supabase-js';
import { initSupabase, auth, api } from '../packages/core/src/index.ts';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const PASSWORD = 'TutorExit!9026';
const TAG = `leave-tutor-${Date.now()}`;

let pass = 0;
let fail = 0;
const step = (ok: boolean, label: string, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });
const accounts: { id: string; email: string; token: string }[] = [];
const createAccount = async (name: string) => {
  const email = `${TAG}-${name}@crimson.ua.edu`;
  const { data, error } = await svc.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error || !data.user) throw error ?? new Error(`could not create ${name}`);
  const id = data.user.id;
  accounts.push({ id, email, token: '' });
  const { error: roleErr } = await svc.from('user_roles').upsert(
    { user_id: id, role: 'student' },
    { onConflict: 'user_id,role' },
  );
  if (roleErr) throw roleErr;
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const signedIn = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signedIn.error || !signedIn.data.session) throw signedIn.error ?? new Error(`could not sign in ${name}`);
  accounts[accounts.length - 1]!.token = signedIn.data.session.access_token;
  return { id, email, token: signedIn.data.session.access_token };
};

const leave = async (token: string) => {
  const response = await fetch(`${URL}/functions/v1/leave-tutor-role`, {
    method: 'POST',
    headers: { apikey: ANON, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: '{}',
  });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
};

const cleanup = async () => {
  const ids = accounts.map((u) => u.id);
  if (!ids.length) return;
  await Promise.all(ids.map(async (id) => {
    const { data } = await svc.storage.from('transcripts').list(id);
    const paths = (data ?? []).map((o) => `${id}/${o.name}`);
    if (paths.length) await svc.storage.from('transcripts').remove(paths);
  }));
  await svc.from('bookings').delete().in('tutor_id', ids);
  await svc.from('tutor_interviews').delete().in('tutor_id', ids);
  await svc.from('tutor_courses').delete().in('tutor_id', ids);
  await svc.from('tutor_availability').delete().in('tutor_id', ids);
  await svc.from('tutor_profiles').delete().in('user_id', ids);
  await svc.from('user_roles').delete().in('user_id', ids);
  await svc.from('users').delete().in('id', ids);
  await Promise.all(accounts.map((u) => svc.auth.admin.deleteUser(u.id)));
};

const makeTutor = async (name: string) => {
  const user = await createAccount(name);
  const { error: roleErr } = await svc.from('user_roles').upsert(
    { user_id: user.id, role: 'tutor' },
    { onConflict: 'user_id,role' },
  );
  if (roleErr) throw roleErr;
  const { error: userErr } = await svc.from('users').update({ active_role: 'tutor', status: 'active' }).eq('id', user.id);
  if (userErr) throw userErr;
  const { error: profileErr } = await svc.from('tutor_profiles').upsert({
    user_id: user.id,
    bio: 'A tutor bio to keep',
    subjects: ['MGT 300'],
    hourly_rate: 32,
    transcript_url: `${user.id}/resume.pdf`,
    transcript_skipped: true,
    approval_status: 'approved',
    submitted_at: new Date(Date.now() - 86400000).toISOString(),
    reviewed_by: null,
    reviewed_at: new Date(Date.now() - 3600000).toISOString(),
    grades_verified_at: new Date(Date.now() - 3600000).toISOString(),
    grades_verified_by: null,
    verified_grade: 'A',
    agreement_signed_at: new Date(Date.now() - 86400000).toISOString(),
    agreement_signed_name: 'Test Tutor',
    agreement_version: 'test-version',
    stripe_connect_account_id: `acct_fake_${user.id.slice(0, 8)}`,
    stripe_charges_enabled: true,
    stripe_payouts_enabled: true,
    stripe_onboarded_at: new Date(Date.now() - 86400000).toISOString(),
    rating_avg: 4.8,
    total_sessions: 12,
  }, { onConflict: 'user_id' });
  if (profileErr) throw profileErr;
  const { error: courseErr } = await svc.from('tutor_courses').insert({
    tutor_id: user.id,
    course_code: 'MGT 300',
    grade: 'A',
    hourly_rate: 32,
    sessions: 12,
  });
  if (courseErr) throw courseErr;
  const { error: availabilityErr } = await svc.from('tutor_availability').insert({
    tutor_id: user.id,
    day_of_week: 1,
    start_time: '09:00',
    end_time: '10:00',
  });
  if (availabilityErr) throw availabilityErr;
  const { error: fileErr } = await svc.storage.from('transcripts').upload(`${user.id}/resume.pdf`, 'test transcript', {
    contentType: 'application/pdf',
  });
  if (fileErr) throw fileErr;
  return user;
};

try {
  const { data: seededStudent, error: seededErr } = await svc
    .from('users')
    .select('id')
    .eq('email', 'student@crimson.ua.edu')
    .single();
  if (seededErr || !seededStudent) throw new Error('seeded student not found — run node supabase/seed_demo.mjs');

  const tutor = await makeTutor('active');
  const { data: interview, error: interviewErr } = await svc
    .from('tutor_interviews')
    .insert({
      tutor_id: tutor.id,
      scheduled_at: new Date(Date.now() + 86400000).toISOString(),
      details: 'test interview',
    })
    .select('id')
    .single();
  if (interviewErr || !interview) throw interviewErr ?? new Error('could not create interview');

  const { data: booking, error: bookingErr } = await svc.from('bookings').insert({
    student_id: seededStudent.id,
    tutor_id: tutor.id,
    subject: 'MGT 300',
    scheduled_at: new Date(Date.now() + 86400000).toISOString(),
    duration_minutes: 60,
    price: 32,
    platform_fee: 5.6,
    tutor_payout_amount: 26.4,
    session_type: 'in_person',
    status: 'confirmed',
    cancellation_deadline: new Date(Date.now() - 86400000).toISOString(),
  }).select('id').single();
  if (bookingErr || !booking) throw bookingErr ?? new Error('could not create booking');

  initSupabase({ url: URL, anonKey: ANON });
  const studentSignIn = await auth.signInWithPassword('student@crimson.ua.edu', 'password123');
  if (!studentSignIn.ok) throw new Error(studentSignIn.error);
  step((await api.tutors.search()).some((row) => row.userId === tutor.id), 'approved tutor appears in the core browse query before leaving');

  const blocked = await leave(tutor.token);
  const { data: blockedRole } = await svc.from('user_roles').select('role').eq('user_id', tutor.id).eq('role', 'tutor').maybeSingle();
  const { data: blockedUser } = await svc.from('users').select('active_role').eq('id', tutor.id).single();
  const { data: blockedProfile } = await svc.from('tutor_profiles').select('approval_status').eq('user_id', tutor.id).single();
  const { data: blockedInterview } = await svc.from('tutor_interviews').select('cancelled_at').eq('id', interview.id).single();
  const { data: blockedFiles } = await svc.storage.from('transcripts').list(tutor.id);
  step(
    blocked.status === 409
      && blocked.body.error === 'You have an upcoming session as a tutor. Cancel it before deleting your tutor profile.'
      && blockedRole?.role === 'tutor'
      && blockedUser?.active_role === 'tutor'
      && blockedProfile?.approval_status === 'approved'
      && blockedInterview?.cancelled_at === null
      && (blockedFiles ?? []).some((file) => file.name === 'resume.pdf'),
    'a confirmed tutor booking blocks the request without changing anything',
    `HTTP ${blocked.status}`,
  );

  const { error: cancelErr } = await svc.from('bookings').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', booking.id);
  if (cancelErr) throw cancelErr;
  const succeeded = await leave(tutor.token);
  step(succeeded.status === 200 && succeeded.body.ok === true, 'leaving tutor role succeeds after the live booking is cancelled', `HTTP ${succeeded.status}`);

  const { data: roleAfter } = await svc.from('user_roles').select('role').eq('user_id', tutor.id).eq('role', 'tutor').maybeSingle();
  const { data: userAfter } = await svc.from('users').select('active_role').eq('id', tutor.id).single();
  const { data: profileAfter } = await svc.from('tutor_profiles')
    .select('approval_status, submitted_at, reviewed_by, reviewed_at, grades_verified_at, grades_verified_by, verified_grade, agreement_signed_at, agreement_signed_name, agreement_version, transcript_url, transcript_skipped, bio, subjects, hourly_rate, stripe_connect_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_onboarded_at, rating_avg, total_sessions')
    .eq('user_id', tutor.id)
    .single();
  const { data: interviewAfter } = await svc.from('tutor_interviews').select('cancelled_at').eq('id', interview.id).single();
  const { data: filesAfter } = await svc.storage.from('transcripts').list(tutor.id);
  const { data: coursesAfter } = await svc.from('tutor_courses').select('course_code').eq('tutor_id', tutor.id);
  const { data: availabilityAfter } = await svc.from('tutor_availability').select('id').eq('tutor_id', tutor.id);
  step(!roleAfter && userAfter?.active_role === 'student', 'tutor role is removed and active_role is student');
  step(
    profileAfter?.approval_status === 'pending'
      && profileAfter.submitted_at === null
      && profileAfter.reviewed_by === null
      && profileAfter.reviewed_at === null
      && profileAfter.grades_verified_at === null
      && profileAfter.grades_verified_by === null
      && profileAfter.verified_grade === null
      && profileAfter.agreement_signed_at === null
      && profileAfter.agreement_signed_name === null
      && profileAfter.agreement_version === null
      && profileAfter.transcript_url === null
      && profileAfter.transcript_skipped === false,
    'application, approval, agreement, and transcript fields reset to a fresh draft',
  );
  step(
    profileAfter?.bio === 'A tutor bio to keep'
      && profileAfter.subjects?.includes('MGT 300')
      && Number(profileAfter.hourly_rate) === 32
      && profileAfter.stripe_connect_account_id === `acct_fake_${tutor.id.slice(0, 8)}`
      && profileAfter.stripe_charges_enabled === true
      && profileAfter.stripe_payouts_enabled === true
      && profileAfter.stripe_onboarded_at !== null
      && Number(profileAfter.rating_avg) === 4.8
      && profileAfter.total_sessions === 12
      && coursesAfter?.length === 1
      && availabilityAfter?.length === 1,
    'profile details, courses, availability, Stripe account/status, and tutor stats are preserved',
  );
  step(interviewAfter?.cancelled_at !== null, 'open tutor interview is cancelled');
  step((filesAfter ?? []).length === 0, 'transcript files are removed from Storage');
  step(!(await api.tutors.search()).some((row) => row.userId === tutor.id), 'reset tutor no longer appears in approved-tutor browse');

  const repeated = await leave(tutor.token);
  step(repeated.status === 400 && repeated.body.error === "You don't have a tutor profile.", 'a second leave request is rejected', `HTTP ${repeated.status}`);

  const plain = await createAccount('student');
  const plainResult = await leave(plain.token);
  step(plainResult.status === 400 && plainResult.body.error === "You don't have a tutor profile.", 'a plain student cannot leave a tutor role', `HTTP ${plainResult.status}`);

  const orphan = await createAccount('tutor-no-profile');
  const { error: orphanRoleErr } = await svc.from('user_roles').upsert(
    { user_id: orphan.id, role: 'tutor' },
    { onConflict: 'user_id,role' },
  );
  if (orphanRoleErr) throw orphanRoleErr;
  const { error: orphanUserErr } = await svc.from('users').update({ active_role: 'tutor' }).eq('id', orphan.id);
  if (orphanUserErr) throw orphanUserErr;
  const orphanResult = await leave(orphan.token);
  const { data: orphanRole } = await svc.from('user_roles').select('role').eq('user_id', orphan.id).eq('role', 'tutor').maybeSingle();
  const { data: orphanUser } = await svc.from('users').select('active_role').eq('id', orphan.id).single();
  step(orphanResult.status === 200 && !orphanRole && orphanUser?.active_role === 'student', 'a tutor role without a profile can be removed', `HTTP ${orphanResult.status}`);

  const suspended = await makeTutor('suspended');
  const { error: suspendErr } = await svc.from('users').update({ status: 'suspended' }).eq('id', suspended.id);
  if (suspendErr) throw suspendErr;
  const suspendedResult = await leave(suspended.token);
  step(suspendedResult.status === 403, 'a suspended tutor is rejected by the active-user guard', `HTTP ${suspendedResult.status}`);
} finally {
  await auth.signOut().catch(() => {});
  await cleanup();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
