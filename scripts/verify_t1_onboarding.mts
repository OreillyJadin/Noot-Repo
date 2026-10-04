// Tracker T1 — tutor onboarding data carries forward, with one source of truth.
//
// Walks a throwaway applicant through what steps 2–5 now save, and checks that
// api.profile.getMyTutorProfile() (what steps 4, 5 and 9, Courses & rates and the tutor
// profile read) returns exactly that, including before a tutor_profiles row exists, where
// tutors.getById's inner join comes back empty. Deny case: a second user sees none of the
// applicant's application.
// Local stack only (never reads EXPO_PUBLIC_SUPABASE_URL, which may point at production).
//   pnpm dlx tsx scripts/verify_t1_onboarding.mts
import { createClient } from '@supabase/supabase-js';
import { initSupabase, api, auth } from '../packages/core/src/index.ts';
import { emptyGrid, windowsFromGrid, gridFromWindows } from '../apps/mobile/lib/weekGrid.ts';

const URL = 'http://127.0.0.1:54321';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
}

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });
const PASSWORD = 'password123';
async function makeUser(tag: string) {
  const email = `${tag}+${Date.now()}@crimson.ua.edu`;
  const { data, error } = await svc.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  return { email, id: data.user!.id };
}
const applicant = await makeUser('t1applicant');
const other = await makeUser('t1other');

// Two real catalog codes, so the courses FK / picker constraints are exercised for real.
const { data: cat } = await svc.from('courses').select('course_code').order('course_code').limit(2);
const [codeA, codeB] = (cat ?? []).map((c) => c.course_code as string);
if (!codeA || !codeB) throw new Error('local course catalog is empty — run supabase db reset');

initSupabase({ url: URL, anonKey: ANON });
try {
  const r = await auth.signInWithPassword(applicant.email, PASSWORD);
  if (!r.ok) throw new Error(r.error);

  let p = await api.profile.getMyTutorProfile();
  check('fresh applicant: nothing saved, no application row', p.courses.length === 0 && p.approvalStatus === null);

  // Courses saved before any tutor_profiles row exists: the old reader (inner join on
  // tutor_profiles) can't see them; getMyTutorProfile can.
  await api.profile.setTutorCourses([{ courseCode: codeA, grade: 'A', hourlyRate: 0, sessions: 0 }]);
  check('old reader misses courses saved before the application row exists', (await api.tutors.getById(applicant.id)) === null);
  check('getMyTutorProfile sees them', (await api.profile.getMyTutorProfile()).courses.length === 1);

  // Step 2
  await api.profile.updatePersonal({ firstName: 'Landon', lastName: 'Test', year: 'Junior', major: 'Chemistry' });
  await api.profile.updateTutorProfile({ bio: 'I love stoichiometry.' });
  const me = await api.getMe();
  p = await api.profile.getMyTutorProfile();
  check('step 2: name/year/major saved to the user', me?.firstName === 'Landon' && me?.major === 'Chemistry' && me?.year === 'Junior');
  check('step 2: bio saved to the application', p.bio === 'I love stoichiometry.');

  // Step 3 — courses with grades, no rates yet
  await api.profile.setTutorCourses([
    { courseCode: codeA, grade: 'A', hourlyRate: 0, sessions: 0 },
    { courseCode: codeB, grade: 'B+', hourlyRate: 0, sessions: 0 },
  ]);
  p = await api.profile.getMyTutorProfile();
  check(
    'step 3 → step 4: step 4 reads the step-3 courses, not a template',
    p.courses.map((c) => c.courseCode).join(',') === [codeA, codeB].join(','),
    p.courses.map((c) => `${c.courseCode}:${c.grade}`).join(' '),
  );

  // Step 4 — rates, keeping grades
  await api.profile.setTutorCourses(p.courses.map((c, i) => ({ courseCode: c.courseCode, grade: c.grade, hourlyRate: 25 + i * 5, sessions: c.sessions })));
  p = await api.profile.getMyTutorProfile();
  check(
    'step 4: rates saved and grades kept',
    p.courses.every((c) => c.hourlyRate > 0 && c.grade),
    p.courses.map((c) => `${c.courseCode} $${c.hourlyRate} ${c.grade}`).join(', '),
  );

  // Step 5 — availability
  await api.profile.updateAvailability([{ dayOfWeek: 1, startTime: '08:00', endTime: '14:00' }]);
  p = await api.profile.getMyTutorProfile();
  check('step 5: availability saved and readable', p.availability.length === 1 && p.availability[0]!.startTime.startsWith('08:00'));

  // Courses & rates / Availability tabs read the same rows after onboarding
  const tabAvail = await api.tutors.getAvailability(applicant.id);
  check('Set Availability tab sees the step-5 hours', tabAvail.length === 1);

  // ERR-013 — step 5 is hour by hour: a lone hour saves as a one-hour window and the
  // picker reads back exactly the hours that were picked.
  const picked = emptyGrid();
  picked.Mon.add(15);
  picked.Wed.add(9).add(10);
  await api.profile.updateAvailability(windowsFromGrid(picked));
  p = await api.profile.getMyTutorProfile();
  const mon = p.availability.find((w) => w.dayOfWeek === 1);
  check(
    'step 5: a single hour saves as a one-hour window',
    p.availability.length === 2 && !!mon && mon.startTime.startsWith('15:00') && mon.endTime.startsWith('16:00'),
    p.availability.map((w) => `${w.dayOfWeek} ${w.startTime}-${w.endTime}`).join(', '),
  );
  const back = gridFromWindows(p.availability);
  check(
    'step 5: the picker reads back the same hours',
    [...back.Mon].join() === '15' && [...back.Wed].join() === '9,10' && back.Tue.size === 0,
  );

  // DENY: a different user reads only their own (empty) application
  await auth.signOut();
  const r2 = await auth.signInWithPassword(other.email, PASSWORD);
  if (!r2.ok) throw new Error(r2.error);
  const theirs = await api.profile.getMyTutorProfile();
  check('DENY: another user sees none of the applicant\'s courses or hours', theirs.courses.length === 0 && theirs.availability.length === 0 && theirs.bio === '');
  await auth.signOut();
} finally {
  await svc.auth.admin.deleteUser(applicant.id);
  await svc.auth.admin.deleteUser(other.id);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
