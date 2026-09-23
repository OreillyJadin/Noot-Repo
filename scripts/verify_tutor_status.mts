// Throwaway integration check for the tutor verification lifecycle:
//   none -> pending -> approved (role granted, tutor mode persists)
//   none -> pending -> rejected (role withdrawn, mode reset)
// Runs a real user through @noot/core against the live local stack. Uses a throwaway account
// so it can't disturb the seeded ones, and deletes it at the end.
//   pnpm dlx tsx scripts/verify_tutor_status.mts
import { createClient } from '@supabase/supabase-js';
import { initSupabase, api, auth, getSupabase } from '../packages/core/src/index.ts';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
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
const EMAIL = `applicant+${Date.now()}@crimson.ua.edu`;
const PASSWORD = 'password123';

// --- a brand-new user, exactly as signup leaves them ---------------------------------------
const { data: created, error: cErr } = await svc.auth.admin.createUser({
  email: EMAIL, password: PASSWORD, email_confirm: true,
});
if (cErr) throw cErr;
const uid = created.user!.id;
await svc.from('users').update({ first_name: 'Casey', last_name: 'Nguyen' }).eq('id', uid);
await svc.from('user_roles').upsert({ user_id: uid, role: 'student' }, { onConflict: 'user_id,role' });
console.log(`applicant ${EMAIL} (${uid})\n`);

initSupabase({ url: URL, anonKey: ANON });
const signIn = await auth.signInWithPassword(EMAIL, PASSWORD);
if (!signIn.ok) throw new Error(signIn.error);

// --- 1. never applied -----------------------------------------------------------------------
check('never applied → "none"', (await api.profile.getTutorStatus()) === 'none');

// --- 2. applies (what t1..t10 leaves behind) -------------------------------------------------
await api.profile.updateTutorProfile({ bio: 'MGT 300, aced it', subjects: ['MGT 300'], hourlyRate: 25 });
// Started but not submitted is a DRAFT (0038) — not in review, not in the admin queue.
check('after starting onboarding → "draft"', (await api.profile.getTutorStatus()) === 'draft');

// Submitting an incomplete application is refused server-side, naming what's missing.
let incomplete = '';
try { await api.profile.submitTutorApplication(); } catch (e) { incomplete = (e as Error).message; }
check('DENY: incomplete application cannot be submitted', /application incomplete: .*photo.*payouts/.test(incomplete), incomplete);

// Complete it the way steps 2–8 do. Photo and Stripe payouts are set by the service role
// here (uploads and Stripe onboarding have their own suites).
await svc.from('users').update({ avatar_url: 'https://example.invalid/a.jpg' }).eq('id', uid);
await api.profile.setTutorCourses([{ courseCode: 'MGT 300', grade: 'A', hourlyRate: 25 }]);
await api.profile.updateAvailability([{ dayOfWeek: 1, startTime: '14:00', endTime: '17:00' }]);
await api.profile.setTranscriptSkipped(true);
await api.profile.signAgreement('Casey Nguyen', 'test-version');
await svc.from('tutor_profiles').update({ stripe_payouts_enabled: true }).eq('user_id', uid);
await api.profile.submitTutorApplication();
check('after submitting → "pending" (in review)', (await api.profile.getTutorStatus()) === 'pending');

const meMid = await api.getMe();
check('pending applicant still holds NO tutor role', !meMid?.roles.includes('tutor'), meMid?.roles.join(',') ?? '');
check(
  'this is why a role check was the wrong signal: "pending" and "none" both read false',
  !meMid?.roles.includes('tutor'),
);

// A pending tutor must not be findable/bookable by students.
const beforeApproval = await api.tutors.search({});
check('pending tutor is NOT in student search', !beforeApproval.some((t) => t.userId === uid));

// They CAN set up ahead of approval, so approval flips them live with no extra setup.
await api.profile.updateAvailability([{ dayOfWeek: 2, startTime: '15:00', endTime: '16:00' }]);
check('pending tutor can set availability ahead of approval',
  (await api.tutors.getAvailability(uid)).length === 1);

// Tutor mode can't persist yet — the 0007 trigger rejects a role they don't hold.
let blocked = false;
try { await api.profile.setActiveRole('tutor'); } catch { blocked = true; }
check('pending tutor cannot persist tutor mode (0007 guard)', blocked);

// --- 3. approval: the step that was missing ---------------------------------------------------
// Mirrors approve-tutor's service-role writes.
await svc.from('tutor_profiles')
  .update({ approval_status: 'approved', reviewed_at: new Date().toISOString() }).eq('user_id', uid);
await svc.from('user_roles').upsert({ user_id: uid, role: 'tutor' }, { onConflict: 'user_id,role' });

check('after approval → "approved"', (await api.profile.getTutorStatus()) === 'approved');
const meApproved = await api.getMe();
check('approval GRANTS the tutor role', !!meApproved?.roles.includes('tutor'), meApproved?.roles.join(','));

await api.profile.setActiveRole('tutor');
check('approved tutor can now persist tutor mode', (await api.getMe())?.activeRole === 'tutor');

// Checked from ANOTHER user's session: search() now excludes the signed-in user, so asking
// the applicant whether they can see their own card tests the wrong thing (and would fail by
// design). Sign back in afterwards — the rejection section below acts as the applicant.
const asOther = await auth.signInWithPassword('student@crimson.ua.edu', 'password123');
if (!asOther.ok) throw new Error(asOther.error);
const afterApproval = await api.tutors.search({});
check('approved tutor appears in search FOR A STUDENT', afterApproval.some((t) => t.userId === uid));
check('…but the tutor does not see their own card',
  !(await (async () => {
    const back = await auth.signInWithPassword(EMAIL, PASSWORD);
    if (!back.ok) throw new Error(back.error);
    return api.tutors.search({});
  })()).some((t) => t.userId === uid));

// --- 4. rejection ------------------------------------------------------------------------------
await svc.from('tutor_profiles').update({ approval_status: 'rejected' }).eq('user_id', uid);
await svc.from('user_roles').delete().eq('user_id', uid).eq('role', 'tutor');
await svc.from('users').update({ active_role: 'student' }).eq('id', uid).eq('active_role', 'tutor');

check('after rejection → "rejected"', (await api.profile.getTutorStatus()) === 'rejected');
const meRejected = await api.getMe();
check('rejection WITHDRAWS the tutor role', !meRejected?.roles.includes('tutor'), meRejected?.roles.join(','));
check('rejection resets them out of tutor mode', meRejected?.activeRole === 'student', String(meRejected?.activeRole));
// Again from another user's session, for the same reason.
const asOther2 = await auth.signInWithPassword('student@crimson.ua.edu', 'password123');
if (!asOther2.ok) throw new Error(asOther2.error);
check('rejected tutor disappears from student search',
  !(await api.tutors.search({})).some((t) => t.userId === uid));

// --- cleanup -------------------------------------------------------------------------------------
// Two deletes, not one. Migration 0026 detached users from auth.users so that deleting an
// identity can't cascade away the retained financial record — which also means removing the
// auth row alone now leaves the app row behind. That is the intended trade-off, so a test
// that cleans up after itself has to delete both.
await svc.auth.admin.deleteUser(uid);
const { data: appRowStillThere } = await svc.from('users').select('id').eq('id', uid).maybeSingle();
check('app row survives auth deletion (0026 detachment)', !!appRowStillThere);
await svc.from('users').delete().eq('id', uid);
const { data: gone } = await svc.from('users').select('id').eq('id', uid).maybeSingle();
check('throwaway account fully cleaned up', !gone);

console.log(`\n${fail === 0 ? '✅ all' : `❌ ${fail} failed,`} ${pass} passed`);
process.exit(fail === 0 ? 0 : 1);
