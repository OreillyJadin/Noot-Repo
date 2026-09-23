// Tracker T4 + T6 — tutor application gating, verification, and the self-approval hole.
//
// Drives the real @noot/core + approve-tutor Edge Function against the LOCAL stack as three
// people: a throwaway applicant, the seeded student, and the seeded admin. Checks:
//   • the 0038 guard: a client can't insert itself as approved or set server-only fields
//   • draft → submit (refused while incomplete) → in review → approved (unverified)
//   • drafts stay out of the admin queue; submitted ones and ungraded transcripts come in
//   • grade verification: admin-only, needs a transcript, and is what search shows as verified
// Local stack only (never reads EXPO_PUBLIC_SUPABASE_URL, which may point at production).
// Needs `supabase functions serve` running.
//   pnpm dlx tsx scripts/verify_t4_t6_application.mts
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
    return (e as Error).message;
  }
}

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });
const EMAIL = `t4t6+${Date.now()}@crimson.ua.edu`;
const { data: created, error: cErr } = await svc.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
if (cErr) throw cErr;
const uid = created.user!.id;
await svc.from('users').update({ first_name: 'Quinn', last_name: 'Park' }).eq('id', uid);
const { data: cat } = await svc.from('courses').select('course_code').order('course_code').limit(1);
const code = cat![0]!.course_code as string;

// A raw client for direct table writes, the way a tampered app would make them.
const raw = createClient(URL, ANON, { auth: { persistSession: false } });
await raw.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
initSupabase({ url: URL, anonKey: ANON });
const as = async (email: string) => {
  const r = await auth.signInWithPassword(email, PASSWORD);
  if (!r.ok) throw new Error(`${email}: ${r.error}`);
};

try {
  // --- the hole 0038 closes ---------------------------------------------------------------
  const ins = await raw.from('tutor_profiles').insert({ user_id: uid, approval_status: 'approved', submitted_at: new Date().toISOString(), grades_verified_at: new Date().toISOString(), stripe_payouts_enabled: true }).select('approval_status, submitted_at, grades_verified_at, stripe_payouts_enabled').single();
  check(
    'DENY: inserting yourself as approved/submitted/verified/payouts-ready is reset to a fresh draft',
    ins.data?.approval_status === 'pending' && ins.data?.submitted_at === null && ins.data?.grades_verified_at === null && ins.data?.stripe_payouts_enabled === false,
    JSON.stringify(ins.data ?? ins.error),
  );
  for (const [field, value] of [
    ['approval_status', 'approved'],
    ['submitted_at', new Date().toISOString()],
    ['grades_verified_at', new Date().toISOString()],
    ['stripe_payouts_enabled', true],
    ['agreement_signed_at', new Date().toISOString()],
    ['rating_avg', 5],
  ] as const) {
    const msg = await rejects(() => raw.from('tutor_profiles').update({ [field]: value }).eq('user_id', uid));
    check(`DENY: tutor cannot set ${field} directly`, /only be set by the server/.test(msg), msg);
  }
  const okWrite = await raw.from('tutor_profiles').update({ bio: 'still allowed', transcript_skipped: true }).eq('user_id', uid);
  check('ALLOW: tutor can still edit their own bio and transcript choice', !okWrite.error, okWrite.error?.message ?? '');

  // --- draft → submit ---------------------------------------------------------------------
  await as(EMAIL);
  check('fresh application is a draft', (await api.profile.getTutorStatus()) === 'draft');

  await as('admin@crimson.ua.edu');
  check('drafts are NOT in the admin queue', !(await api.admin.listPendingTutors()).some((p) => p.userId === uid));
  const draftApprove = await rejects(() => api.admin.approveTutor(uid, 'approved'));
  check('DENY: admin cannot approve an unsubmitted draft', /not been submitted/.test(draftApprove), draftApprove);

  await as(EMAIL);
  const blankSig = await rejects(() => api.profile.signAgreement('   ', 'v1'));
  check('DENY: agreement needs a typed name', /full name/.test(blankSig), blankSig);
  const early = await rejects(() => api.profile.submitTutorApplication());
  check('DENY: incomplete application is refused with what is missing', /application incomplete: photo, courses, rates, availability, agreement, payouts/.test(early), early);

  await svc.from('users').update({ avatar_url: 'https://example.invalid/q.jpg' }).eq('id', uid);
  await api.profile.setTutorCourses([{ courseCode: code, grade: 'A', hourlyRate: 5 }]);
  await api.profile.updateAvailability([{ dayOfWeek: 3, startTime: '14:00', endTime: '17:00' }]);
  const signedAt = await api.profile.signAgreement('Quinn Park', 'test-v1');
  check('agreement signature is server-stamped', !Number.isNaN(Date.parse(signedAt)), signedAt);
  await svc.from('tutor_profiles').update({ stripe_payouts_enabled: true }).eq('user_id', uid); // what connect-status caches
  const lowRate = await rejects(() => api.profile.submitTutorApplication());
  check('DENY: a course under $10/hr still blocks submission', /application incomplete: rates$/.test(lowRate), lowRate);

  await api.profile.setTutorCourses([{ courseCode: code, grade: 'A', hourlyRate: 28 }]);
  await api.profile.submitTutorApplication();
  const standing = await api.profile.getTutorStanding();
  check('complete application submits → in review, unverified', standing.status === 'pending' && !standing.gradesVerified, JSON.stringify(standing));

  // --- admin: approve without a transcript --------------------------------------------------
  await as('student@crimson.ua.edu');
  const notAdmin = await rejects(() => api.admin.approveTutor(uid, 'approved'));
  check('DENY: a non-admin cannot approve', /Forbidden/i.test(notAdmin), notAdmin);

  await as('admin@crimson.ua.edu');
  const queued = (await api.admin.listPendingTutors()).find((p) => p.userId === uid);
  check('submitted application is in the admin queue as unverified', queued?.awaiting === 'application' && queued?.hasTranscript === false, JSON.stringify(queued && { awaiting: queued.awaiting, hasTranscript: queued.hasTranscript }));
  const noTranscript = await rejects(() => api.admin.verifyTutorGrades(uid));
  check('DENY: grades cannot be verified with no transcript', /No transcript/.test(noTranscript), noTranscript);
  const approved = await api.admin.approveTutor(uid, 'approved');
  check('admin approves → live, still unverified', approved.approvalStatus === 'approved' && approved.gradesVerified === false);

  await as('student@crimson.ua.edu');
  let card = (await api.tutors.search({})).find((t) => t.userId === uid);
  check('students can find the approved tutor, with no Verified badge', !!card && card.verified === false, String(card?.verified));

  // --- later: transcript → grade check → Verified -------------------------------------------
  await as(EMAIL);
  await api.profile.uploadTranscript(new TextEncoder().encode('%PDF-1.4 test'), 'pdf', 'application/pdf');
  await as('admin@crimson.ua.edu');
  const gradeQueue = (await api.admin.listPendingTutors()).find((p) => p.userId === uid);
  check('a live tutor who uploads a transcript enters the grade-check queue', gradeQueue?.awaiting === 'grades', gradeQueue?.awaiting ?? 'not queued');
  const verified = await api.admin.verifyTutorGrades(uid);
  check('admin verifies grades', verified.gradesVerified === true);
  check('verified tutor leaves the queue', !(await api.admin.listPendingTutors()).some((p) => p.userId === uid));

  await as('student@crimson.ua.edu');
  card = (await api.tutors.search({})).find((t) => t.userId === uid);
  check('search now shows the tutor as Verified', card?.verified === true);
  await as(EMAIL);
  check('the tutor sees gradesVerified on their own standing', (await api.profile.getTutorStanding()).gradesVerified === true);
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
