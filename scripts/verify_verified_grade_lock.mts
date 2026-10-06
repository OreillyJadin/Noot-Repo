// ERR-012 — once an admin has verified a tutor's grades, the tutor can't change what was
// verified (migration 0048).
//
// Drives the real @noot/core and a raw client (the way a tampered app would write) against
// the LOCAL stack as a throwaway tutor. Checks:
//   • before verification nothing is locked: courses, grades and the transcript all save
//   • after it, a NEW course, a CHANGED grade and a REPLACED transcript are refused — through
//     the app's save, through direct table writes, and in Storage
//   • a verified tutor can still change a rate and remove a course, and stays verified
//   • a refused save leaves the course list exactly as it was (no half-applied replace)
// Verification is set with the service role here; the approve-tutor function that sets it
// for real is covered by verify_t4_t6_application.mts. No Edge Functions needed.
// Local stack only (never reads EXPO_PUBLIC_SUPABASE_URL, which may point at production).
//   pnpm dlx tsx scripts/verify_verified_grade_lock.mts
import { createClient } from '@supabase/supabase-js';
import { initSupabase, api, auth } from '../packages/core/src/index.ts';

const URL = 'http://127.0.0.1:54321';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const PASSWORD = 'password123';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
}
async function rejects(fn: () => PromiseLike<{ error: unknown } | unknown>): Promise<string> {
  try {
    const r = (await fn()) as { error?: { message?: string } | null } | undefined;
    return r && typeof r === 'object' && 'error' in r && r.error ? String(r.error.message ?? r.error) : '';
  } catch (e) {
    return (e as { message?: string }).message ?? String(e);
  }
}

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });
const EMAIL = `gradelock+${Date.now()}@crimson.ua.edu`;
const { data: created, error: cErr } = await svc.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
if (cErr) throw cErr;
const uid = created.user!.id;
const { data: cat } = await svc.from('courses').select('course_code').order('course_code').limit(3);
const [codeA, codeB, codeC] = cat!.map((c) => c.course_code as string) as [string, string, string];

// A raw client for direct table and Storage writes, the way a tampered app would make them.
const raw = createClient(URL, ANON, { auth: { persistSession: false } });
await raw.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
initSupabase({ url: URL, anonKey: ANON });
const signIn = await auth.signInWithPassword(EMAIL, PASSWORD);
if (!signIn.ok) throw new Error(signIn.error);

/** The saved list as "CODE:grade:rate:sessions", read with the service role. */
const saved = async () =>
  ((await svc.from('tutor_courses').select('course_code, grade, hourly_rate, sessions').eq('tutor_id', uid).order('course_code')).data ?? [])
    .map((r) => `${r.course_code}:${r.grade}:${Number(r.hourly_rate)}:${r.sessions}`)
    .join(' | ');
const verified = async () =>
  (await svc.from('tutor_profiles').select('grades_verified_at').eq('user_id', uid).single()).data?.grades_verified_at != null;
const pdf = (text: string) => new TextEncoder().encode(`%PDF-1.4 ${text}`);

try {
  // --- unverified: nothing is locked --------------------------------------------------------
  await api.profile.setTutorCourses([
    { courseCode: codeA, grade: 'B+', hourlyRate: 20 },
    { courseCode: codeB, grade: 'A-', hourlyRate: 25 },
  ]);
  check('unverified tutor saves a course list', (await saved()) === `${codeA}:B+:20:0 | ${codeB}:A-:25:0`, await saved());
  await api.profile.setTutorCourses([
    { courseCode: codeA, grade: 'A', hourlyRate: 22 },
    { courseCode: codeB, grade: 'A-', hourlyRate: 25 },
    { courseCode: codeC, grade: 'B', hourlyRate: 30 },
  ]);
  check('unverified tutor can change a grade and add a course', (await saved()) === `${codeA}:A:22:0 | ${codeB}:A-:25:0 | ${codeC}:B:30:0`, await saved());
  const firstPath = await api.profile.uploadTranscript(pdf('first'), 'pdf', 'application/pdf');
  await api.profile.uploadTranscript(pdf('second'), 'pdf', 'application/pdf');
  check('unverified tutor can upload and replace a transcript', firstPath.startsWith(`${uid}/`));

  const dup = await rejects(() => raw.rpc('set_tutor_courses', { p_courses: [{ course_code: codeA, grade: 'A', hourly_rate: 20 }, { course_code: codeA, grade: 'A', hourly_rate: 25 }] }));
  check('DENY: the same course twice in one save', /listed twice/.test(dup), dup);
  const noRate = await rejects(() => raw.rpc('set_tutor_courses', { p_courses: [{ course_code: codeA, grade: 'A' }] }));
  check('DENY: a course with no rate', /code and a rate/.test(noRate), noRate);

  const nan = await rejects(() => raw.rpc('set_tutor_courses', { p_courses: [{ course_code: codeA, grade: 'A', hourly_rate: 'NaN' }] }));
  const huge = await rejects(() => raw.rpc('set_tutor_courses', { p_courses: [{ course_code: codeA, grade: 'A', hourly_rate: 99999 }] }));
  check('DENY: a rate that is not a number, or over $120', /up to \$120/.test(nan) && /up to \$120/.test(huge), `${nan} / ${huge}`);
  check('…and those refused saves changed nothing', (await saved()) === `${codeA}:A:22:0 | ${codeB}:A-:25:0 | ${codeC}:B:30:0`, await saved());

  // Sessions a course has earned must survive a save (the old save rewrote the rows).
  await svc.from('tutor_courses').update({ sessions: 7 }).eq('tutor_id', uid).eq('course_code', codeA);

  // --- an admin verifies the grades (what approve-tutor does) --------------------------------
  await svc.from('tutor_profiles').update({ grades_verified_at: new Date().toISOString() }).eq('user_id', uid);
  const locked = `${codeA}:A:22:7 | ${codeB}:A-:25:0 | ${codeC}:B:30:0`;
  check('tutor is verified, list as checked', (await verified()) && (await saved()) === locked, await saved());

  // --- verified: through the app's save -----------------------------------------------------
  const { data: more } = await svc.from('courses').select('course_code').order('course_code').range(3, 3);
  const codeNew = more![0]!.course_code as string;
  const addMsg = await rejects(() =>
    api.profile.setTutorCourses([
      { courseCode: codeA, grade: 'A', hourlyRate: 22 },
      { courseCode: codeB, grade: 'A-', hourlyRate: 25 },
      { courseCode: codeC, grade: 'B', hourlyRate: 30 },
      { courseCode: codeNew, grade: 'A+', hourlyRate: 40 },
    ]),
  );
  check('DENY: verified tutor cannot add a course', /grades are verified/.test(addMsg), addMsg);
  const gradeMsg = await rejects(() =>
    api.profile.setTutorCourses([
      { courseCode: codeA, grade: 'A', hourlyRate: 22 },
      { courseCode: codeB, grade: 'A+', hourlyRate: 25 },
      { courseCode: codeC, grade: 'B', hourlyRate: 30 },
    ]),
  );
  check('DENY: verified tutor cannot change a grade', /grades are verified/.test(gradeMsg), gradeMsg);
  // Dropping a course and adding another in the same save must not half-apply.
  const swapMsg = await rejects(() =>
    api.profile.setTutorCourses([
      { courseCode: codeA, grade: 'A', hourlyRate: 22 },
      { courseCode: codeNew, grade: 'A+', hourlyRate: 40 },
    ]),
  );
  check('DENY: verified tutor cannot swap one course for another', /grades are verified/.test(swapMsg), swapMsg);
  check('…and every refused save left the list untouched', (await saved()) === locked, await saved());

  // --- verified: direct table writes ---------------------------------------------------------
  const rawInsert = await rejects(() => raw.from('tutor_courses').insert({ tutor_id: uid, course_code: codeNew, grade: 'A+', hourly_rate: 40 }));
  check('DENY: direct insert of a course', /course list is locked/.test(rawInsert), rawInsert);
  const rawGrade = await rejects(() => raw.from('tutor_courses').update({ grade: 'A+' }).eq('tutor_id', uid));
  check('DENY: direct grade change', /they are locked/.test(rawGrade), rawGrade);
  const rawCode = await rejects(() => raw.from('tutor_courses').update({ course_code: codeNew }).eq('tutor_id', uid).eq('course_code', codeC));
  check('DENY: direct change of which course a grade is for', /they are locked/.test(rawCode), rawCode);
  // What an app build from before 0048 does to save a rate: delete everything, re-insert.
  const rawDelete = await rejects(() => raw.from('tutor_courses').delete().eq('tutor_id', uid));
  check('DENY: direct delete (an old build’s save fails before it can empty the list)', /course list is locked/.test(rawDelete), rawDelete);
  check('…and the list is still untouched', (await saved()) === locked, await saved());

  // --- verified: the transcript ---------------------------------------------------------------
  const rawPath = await rejects(() => raw.from('tutor_profiles').update({ transcript_url: `${uid}/other.pdf` }).eq('user_id', uid));
  check('DENY: pointing the profile at another transcript', /transcript is locked/.test(rawPath), rawPath);
  const rawSkip = await rejects(() => raw.from('tutor_profiles').update({ transcript_skipped: true }).eq('user_id', uid));
  check('DENY: flipping the "signed up unverified" choice', /transcript is locked/.test(rawSkip), rawSkip);
  const reupload = await rejects(() => api.profile.uploadTranscript(pdf('swapped'), 'pdf', 'application/pdf'));
  check('DENY: uploading a replacement transcript', reupload !== '', reupload);
  const newFile = await raw.storage.from('transcripts').upload(`${uid}/extra.pdf`, pdf('extra'), { contentType: 'application/pdf' });
  check('DENY: adding another file to the transcript folder', !!newFile.error, newFile.error?.message ?? 'uploaded');
  await raw.storage.from('transcripts').remove([firstPath]);
  const kept = await svc.storage.from('transcripts').download(firstPath);
  const keptText = kept.data ? await kept.data.text() : '';
  check('the verified transcript file is still there, unchanged', keptText === '%PDF-1.4 second', keptText || (kept.error?.message ?? 'missing'));
  const okBio = await rejects(() => raw.from('tutor_profiles').update({ bio: 'still mine to edit' }).eq('user_id', uid));
  check('ALLOW: verified tutor can still edit their bio', okBio === '', okBio);

  // --- verified: what stays open ---------------------------------------------------------------
  await api.profile.setTutorCourses([
    { courseCode: codeA, grade: 'A', hourlyRate: 35 },
    { courseCode: codeB, grade: 'A-', hourlyRate: 25 },
    { courseCode: codeC, grade: 'B', hourlyRate: 30 },
  ]);
  check('ALLOW: verified tutor changes a rate (sessions kept)', (await saved()) === `${codeA}:A:35:7 | ${codeB}:A-:25:0 | ${codeC}:B:30:0`, await saved());
  const rawRate = await rejects(() => raw.from('tutor_courses').update({ hourly_rate: 36 }).eq('tutor_id', uid).eq('course_code', codeA));
  check('ALLOW: a direct rate change too', rawRate === '', rawRate);
  await api.profile.setTutorCourses([
    { courseCode: codeA, grade: 'A', hourlyRate: 36 },
    { courseCode: codeB, grade: 'A-', hourlyRate: 25 },
  ]);
  check('ALLOW: verified tutor removes a course', (await saved()) === `${codeA}:A:36:7 | ${codeB}:A-:25:0`, await saved());
  const backMsg = await rejects(() =>
    api.profile.setTutorCourses([
      { courseCode: codeA, grade: 'A', hourlyRate: 36 },
      { courseCode: codeB, grade: 'A-', hourlyRate: 25 },
      { courseCode: codeC, grade: 'B', hourlyRate: 30 },
    ]),
  );
  check('DENY: a removed course cannot be added back by the tutor', /grades are verified/.test(backMsg), backMsg);
  const emptyMsg = await rejects(() => api.profile.setTutorCourses([]));
  check('DENY: verified tutor cannot empty the list', /at least one course/.test(emptyMsg), emptyMsg);
  // With no course rows the app would show tutor_profiles.subjects under the Verified badge.
  const subjMsg = await rejects(() => raw.from('tutor_profiles').update({ subjects: [codeNew] }).eq('user_id', uid));
  check('DENY: verified tutor cannot rewrite the profile’s subject list', /course list is locked/.test(subjMsg), subjMsg);

  // A grade stored as '' before 0048 (direct inserts were never cleaned up) must not lock
  // its owner out: the unchanged list still saves, and a real grade still can't be added.
  await svc.from('tutor_courses').update({ grade: '' }).eq('tutor_id', uid).eq('course_code', codeB);
  const blankOk = await rejects(() =>
    api.profile.setTutorCourses([
      { courseCode: codeA, grade: 'A', hourlyRate: 37 },
      { courseCode: codeB, grade: null, hourlyRate: 25 },
    ]),
  );
  check('ALLOW: a course stored with a blank grade still saves', blankOk === '', blankOk);
  const blankUp = await rejects(() =>
    api.profile.setTutorCourses([
      { courseCode: codeA, grade: 'A', hourlyRate: 37 },
      { courseCode: codeB, grade: 'A+', hourlyRate: 25 },
    ]),
  );
  check('DENY: …but it cannot be given a grade', /grades are verified/.test(blankUp), blankUp);
  check('still verified after all of it', await verified());

  // --- someone else's rows are still someone else's -------------------------------------------
  const { data: sara } = await svc.from('users').select('id').eq('email', 'sara@crimson.ua.edu').single();
  const before = (await svc.from('tutor_courses').select('id', { count: 'exact', head: true }).eq('tutor_id', sara!.id)).count;
  await raw.from('tutor_courses').update({ hourly_rate: 1 }).eq('tutor_id', sara!.id);
  const cheap = (await svc.from('tutor_courses').select('id', { count: 'exact', head: true }).eq('tutor_id', sara!.id).eq('hourly_rate', 1)).count;
  check('DENY: no tutor can touch another tutor’s courses', (before ?? 0) > 0 && cheap === 0, `rows ${before}, changed ${cheap}`);
} finally {
  await auth.signOut().catch(() => {});
  await svc.storage.from('transcripts').list(uid).then(async ({ data }) => {
    if (data?.length) await svc.storage.from('transcripts').remove(data.map((f) => `${uid}/${f.name}`));
  });
  await svc.auth.admin.deleteUser(uid);
  await svc.from('users').delete().eq('id', uid); // 0026 detached users from auth.users
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
