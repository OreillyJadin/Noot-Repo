import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = 'http://127.0.0.1:54321';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const PASSWORD = 'NootQA!Rate_B42';
const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });
const tag = Date.now();

type TestTutor = { id: string; client: SupabaseClient };

const createdUserIds: string[] = [];
let passed = 0;
let failed = 0;

const check = (id: string, name: string, ok: boolean, detail = '') => {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} [${id}] ${name}${detail ? ` — ${detail}` : ''}`);
};

const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

const mk = async (): Promise<TestTutor> => {
  const email = `qa-rate-bounds-${tag}@crimson.ua.edu`;
  const { data, error } = await svc.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('createUser returned no user');
  createdUserIds.push(data.user.id);

  const now = new Date().toISOString();
  const { error: userError } = await svc.from('users').update({
    first_name: 'Rate',
    last_name: 'QA',
    password_set_at: now,
    terms_accepted_at: now,
    terms_version: '2026-09-17',
    guidelines_accepted_at: now,
    guidelines_version: '2026-10-13',
  }).eq('id', data.user.id);
  if (userError) throw userError;

  const { error: tutorRoleError } = await svc.from('user_roles').upsert(
    { user_id: data.user.id, role: 'tutor' },
    { onConflict: 'user_id,role' },
  );
  if (tutorRoleError) throw tutorRoleError;

  const { error: profileError } = await svc.from('tutor_profiles').upsert({
    user_id: data.user.id,
    bio: 'QA tutor for hourly-rate bounds verification.',
    approval_status: 'approved',
    grades_verified_at: null,
  }, { onConflict: 'user_id' });
  if (profileError) throw profileError;

  const client = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (signInError) throw signInError;
  return { id: data.user.id, client };
};

const getRate = async (tutorId: string, courseCode: string) => {
  const { data, error } = await svc.from('tutor_courses')
    .select('hourly_rate')
    .eq('tutor_id', tutorId)
    .eq('course_code', courseCode)
    .maybeSingle();
  if (error) throw error;
  return Number(data?.hourly_rate);
};

const cleanup = async () => {
  for (const userId of createdUserIds) {
    const { error: coursesError } = await svc.from('tutor_courses').delete().eq('tutor_id', userId);
    if (coursesError) check('cleanup-courses', 'test tutor courses removed', false, coursesError.message);
    const { error } = await svc.auth.admin.deleteUser(userId);
    if (error) check('cleanup-users', 'test tutor removed', false, error.message);
  }
};

try {
  const { data: courses, error: courseError } = await svc.from('courses')
    .select('course_code')
    .eq('is_active', true)
    .order('course_code')
    .limit(2);
  if (courseError || !courses || courses.length < 2) {
    throw courseError ?? new Error('at least two active courses are needed for the fixture');
  }
  const courseCode = courses[0]!.course_code as string;
  const insertCourseCode = courses[1]!.course_code as string;

  const tutor = await mk();
  const { data: course, error: insertError } = await svc.from('tutor_courses').insert({
    tutor_id: tutor.id,
    course_code: courseCode,
    grade: 'A',
    hourly_rate: 30,
  }).select('hourly_rate').single();
  if (insertError || !course) throw insertError ?? new Error('tutor course insert returned no row');
  check('fixture', 'unverified tutor course created at $30/hr', Number(course.hourly_rate) === 30);

  const rejectDirectRate = async (rate: number) => {
    const { error } = await tutor.client.from('tutor_courses')
      .update({ hourly_rate: rate })
      .eq('tutor_id', tutor.id)
      .eq('course_code', courseCode)
      .select('hourly_rate')
      .maybeSingle();
    const storedRate = await getRate(tutor.id, courseCode);
    check(`direct-${rate}`, `direct update to ${rate} is rejected without changing the stored rate`,
      error?.code === '23514' && storedRate === 30,
      `error=${error?.code ?? 'none'} stored=${storedRate}`);
  };

  await rejectDirectRate(121);
  await rejectDirectRate(5000);
  await rejectDirectRate(-1);
  // TUT-4 (0087): the app's $10/hr floor is enforced by the database too.
  await rejectDirectRate(9);
  await rejectDirectRate(9.99);
  await rejectDirectRate(0);

  const directFloor = await tutor.client.from('tutor_courses')
    .update({ hourly_rate: 10 })
    .eq('tutor_id', tutor.id)
    .eq('course_code', courseCode)
    .select('hourly_rate')
    .maybeSingle();
  check('direct-10', 'direct update to exactly $10/hr (the floor) succeeds',
    !directFloor.error && Number(directFloor.data?.hourly_rate) === 10, directFloor.error?.message ?? `stored=${directFloor.data?.hourly_rate}`);

  const directUpdate = await tutor.client.from('tutor_courses')
    .update({ hourly_rate: 45 })
    .eq('tutor_id', tutor.id)
    .eq('course_code', courseCode)
    .select('hourly_rate')
    .maybeSingle();
  const directStoredRate = await getRate(tutor.id, courseCode);
  check('direct-45', 'direct update to $45/hr succeeds',
    !directUpdate.error && Number(directUpdate.data?.hourly_rate) === 45 && directStoredRate === 45,
    directUpdate.error?.message ?? `stored=${directStoredRate}`);

  const tooHigh = await tutor.client.rpc('set_tutor_courses', {
    p_courses: [{ course_code: courseCode, grade: 'A', hourly_rate: 121, currently_taking: false }],
  });
  check('rpc-121', 'set_tutor_courses still rejects $121/hr', !!tooHigh.error, tooHigh.error?.message ?? 'accepted');

  for (const low of [9, 0, 0.5]) {
    const tooLow = await tutor.client.rpc('set_tutor_courses', {
      p_courses: [{ course_code: courseCode, grade: 'A', hourly_rate: low, currently_taking: false }],
    });
    const storedLow = await getRate(tutor.id, courseCode);
    check(`rpc-${low}`, `set_tutor_courses rejects $${low}/hr and keeps the stored rate`,
      !!tooLow.error && /\$10 to \$120/.test(tooLow.error.message) && storedLow === 45,
      tooLow.error?.message ?? `accepted, stored=${storedLow}`);
  }
  const floorRate = await tutor.client.rpc('set_tutor_courses', {
    p_courses: [{ course_code: courseCode, grade: 'A', hourly_rate: 10, currently_taking: false }],
  });
  check('rpc-10', 'set_tutor_courses accepts exactly $10/hr',
    !floorRate.error && (await getRate(tutor.id, courseCode)) === 10, floorRate.error?.message ?? `stored=${await getRate(tutor.id, courseCode)}`);

  const validRate = await tutor.client.rpc('set_tutor_courses', {
    p_courses: [{ course_code: courseCode, grade: 'A', hourly_rate: 30, currently_taking: false }],
  });
  const rpcStoredRate = await getRate(tutor.id, courseCode);
  check('rpc-30', 'set_tutor_courses still accepts $30/hr',
    !validRate.error && rpcStoredRate === 30,
    validRate.error?.message ?? `stored=${rpcStoredRate}`);

  for (const rate of [500, 0, 9.5]) {
    const serviceInsert = await svc.from('tutor_courses').insert({
      tutor_id: tutor.id,
      course_code: insertCourseCode,
      grade: 'A',
      hourly_rate: rate,
    });
    check(`service-insert-${rate}`, `service-role insert at $${rate}/hr is rejected by the database bound constraint`,
      serviceInsert.error?.code === '23514'
        && serviceInsert.error.message.includes('tutor_courses_hourly_rate_bounds'),
      `${serviceInsert.error?.code ?? 'none'} ${serviceInsert.error?.message ?? 'inserted'}`);
  }
} catch (error) {
  check('setup', 'verification setup and requests complete', false, errorText(error));
} finally {
  await cleanup();
}

console.log(`\nTOTAL ${passed + failed} — PASS ${passed} FAIL ${failed}`);
if (failed > 0) process.exitCode = 1;
