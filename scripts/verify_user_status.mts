// Verify migration 0051 with an existing access token against the local stack.
// Needs: supabase start && node supabase/seed_demo.mjs
//   pnpm dlx tsx scripts/verify_user_status.mts
import { createClient } from '@supabase/supabase-js';

const URL = 'http://127.0.0.1:54321';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
}

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });
const student = createClient(URL, ANON, { auth: { persistSession: false } });
const sara = createClient(URL, ANON, { auth: { persistSession: false } });
const anon = createClient(URL, ANON, { auth: { persistSession: false } });

const [studentSignIn, saraSignIn] = await Promise.all([
  student.auth.signInWithPassword({ email: 'student@crimson.ua.edu', password: 'password123' }),
  sara.auth.signInWithPassword({ email: 'sara@crimson.ua.edu', password: 'password123' }),
]);
if (studentSignIn.error) throw studentSignIn.error;
if (saraSignIn.error) throw saraSignIn.error;

const studentId = studentSignIn.data.user.id;
const saraId = saraSignIn.data.user.id;
const accessToken = studentSignIn.data.session?.access_token;
if (!accessToken) throw new Error('student sign-in did not return an access token');
const { data: originalUser, error: originalUserError } = await svc
  .from('users')
  .select('first_name')
  .eq('id', studentId)
  .single();
if (originalUserError) throw originalUserError;

const savedPath = `${studentId}/status-check-${Date.now()}.txt`;
try {
  const { data: userRow, error: userError } = await student
    .from('users')
    .select('id')
    .eq('id', studentId);
  check('active student can read their own users row', !userError && userRow?.length === 1, userError?.message ?? `${userRow?.length ?? 0} rows`);

  const { data: campusRows, error: campusError } = await student.from('campuses').select('domain');
  check('active student can read campuses', !campusError && (campusRows?.length ?? 0) > 0, campusError?.message ?? `${campusRows?.length ?? 0} rows`);

  const { error: bookingsError } = await student
    .from('bookings')
    .select('id')
    .eq('student_id', studentId);
  check('active student can query their bookings', !bookingsError, bookingsError?.message ?? 'query allowed');

  const { error: setStatusError } = await svc
    .from('users')
    .update({ status: 'suspended' })
    .eq('id', studentId);
  if (setStatusError) throw setStatusError;

  const { data: sessionAfterSuspend } = await student.auth.getSession();
  check(
    'same student access token remains valid after status is suspended',
    sessionAfterSuspend.session?.access_token === accessToken,
  );

  const [userRows, campusRowsAfterSuspend, bookingRows, messageRows] = await Promise.all([
    student.from('users').select('id').eq('id', studentId),
    student.from('campuses').select('domain'),
    student.from('bookings').select('id').eq('student_id', studentId),
    student.from('messages').select('id'),
  ]);
  check('suspended student sees no users rows', !userRows.error && userRows.data?.length === 0, userRows.error?.message ?? `${userRows.data?.length ?? 0} rows`);
  check('suspended student sees no campus rows', !campusRowsAfterSuspend.error && campusRowsAfterSuspend.data?.length === 0, campusRowsAfterSuspend.error?.message ?? `${campusRowsAfterSuspend.data?.length ?? 0} rows`);
  check('suspended student sees no booking rows', !bookingRows.error && bookingRows.data?.length === 0, bookingRows.error?.message ?? `${bookingRows.data?.length ?? 0} rows`);
  check('suspended student sees no message rows', !messageRows.error && messageRows.data?.length === 0, messageRows.error?.message ?? `${messageRows.data?.length ?? 0} rows`);

  const { data: anonymousCampuses, error: anonymousCampusError } = await anon.from('campuses').select('domain');
  const { data: anonymousCourses, error: anonymousCourseError } = await anon.from('courses').select('course_id').limit(1);
  check(
    'anon can still read campuses and courses before signup',
    !anonymousCampusError && !anonymousCourseError && (anonymousCampuses?.length ?? 0) > 0 && (anonymousCourses?.length ?? 0) > 0,
    anonymousCampusError?.message ?? anonymousCourseError?.message ?? `campuses=${anonymousCampuses?.length ?? 0}, courses=${anonymousCourses?.length ?? 0}`,
  );

  const insert = await student
    .from('saved_tutors')
    .insert({ student_id: studentId, tutor_id: saraId });
  check('suspended student cannot insert a saved tutor', !!insert.error, insert.error?.message ?? 'insert succeeded');

  const update = await student
    .from('users')
    .update({ first_name: 'Suspended write attempt' })
    .eq('id', studentId)
    .select('id');
  const { data: unchangedUser } = await svc.from('users').select('first_name').eq('id', studentId).single();
  check(
    'suspended student cannot update their own users row',
    !!update.error || update.data?.length === 0,
    update.error?.message ?? `${update.data?.length ?? 0} rows affected`,
  );
  check(
    'users row was not changed by the suspended update',
    unchangedUser?.first_name === originalUser.first_name,
    unchangedUser?.first_name ?? 'missing users row',
  );

  const upload = await student.storage
    .from('avatars')
    .upload(savedPath, new Uint8Array([110, 111, 111, 116]), { contentType: 'text/plain' });
  check('suspended student cannot upload an avatar', !!upload.error, upload.error?.message ?? 'upload succeeded');

  const { error: claimError } = await student.rpc('claim_invite', { p_code: 'NOOT-INVALID' });
  check(
    'suspended student cannot call claim_invite',
    !!claimError && claimError.message.includes('account is not active'),
    claimError?.message ?? 'RPC succeeded',
  );

  const { error: inviteCodeError } = await student.rpc('my_invite_code');
  check(
    'suspended student cannot call my_invite_code',
    !!inviteCodeError && inviteCodeError.message.includes('account is not active'),
    inviteCodeError?.message ?? 'RPC succeeded',
  );

  const { error: creditBalanceError } = await student.rpc('my_credit_balance');
  check(
    'suspended student cannot call my_credit_balance',
    !!creditBalanceError && creditBalanceError.message.includes('account is not active'),
    creditBalanceError?.message ?? 'RPC succeeded',
  );

  const edgeResponse = await fetch(`${URL}/functions/v1/submit-rating`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  const edgeBody = await edgeResponse.json().catch(() => ({}));
  check(
    'suspended token receives 403 from submit-rating',
    edgeResponse.status === 403 && edgeBody.error === 'Account is not active',
    `HTTP ${edgeResponse.status}: ${JSON.stringify(edgeBody)}`,
  );

  const { data: saraRow, error: saraError } = await sara
    .from('users')
    .select('id, status')
    .eq('id', saraId);
  check(
    'active Sara can still read her users row',
    !saraError && saraRow?.length === 1 && saraRow[0].status === 'active',
    saraError?.message ?? JSON.stringify(saraRow),
  );
  const { data: saraCampuses, error: saraCampusError } = await sara.from('campuses').select('domain');
  check('active Sara can still read campuses', !saraCampusError && (saraCampuses?.length ?? 0) > 0, saraCampusError?.message ?? `${saraCampuses?.length ?? 0} rows`);
} catch (error) {
  check('unexpected verifier error', false, String(error));
} finally {
  const { error: restoreError } = await svc
    .from('users')
    .update({ status: 'active', first_name: originalUser.first_name })
    .eq('id', studentId);
  check('student status restored to active', !restoreError, restoreError?.message ?? '');

  const { data: restoredRows, error: restoredError } = await student
    .from('users')
    .select('id, status')
    .eq('id', studentId);
  check(
    'student access returns after status restoration',
    !restoredError && restoredRows?.length === 1 && restoredRows[0].status === 'active',
    restoredError?.message ?? JSON.stringify(restoredRows),
  );

  await svc.from('saved_tutors').delete().eq('student_id', studentId).eq('tutor_id', saraId);
  await svc.storage.from('avatars').remove([savedPath]);
  await student.auth.signOut();
  await sara.auth.signOut();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
