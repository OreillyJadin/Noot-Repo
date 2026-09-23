// Throwaway integration check that drives the REAL approve-tutor Edge Function (not a
// re-implementation of it) end to end: an admin approves, then rejects, a throwaway
// applicant, and we assert the role grant/withdrawal it is now responsible for.
//
// Needs the local edge runtime:  supabase functions serve approve-tutor
//   pnpm dlx tsx scripts/verify_approve_tutor_fn.mts
import { createClient } from '@supabase/supabase-js';
import { initSupabase, api, auth } from '../packages/core/src/index.ts';

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
const roleOf = async (uid: string) =>
  ((await svc.from('user_roles').select('role').eq('user_id', uid)).data ?? []).map((r) => r.role).sort().join(',');
const activeRoleOf = async (uid: string) =>
  (await svc.from('users').select('active_role').eq('id', uid).single()).data?.active_role;

// A throwaway applicant sitting at 'pending', which is where t1..t10 leaves someone.
const EMAIL = `applicant+fn${Date.now()}@crimson.ua.edu`;
const { data: created, error: cErr } = await svc.auth.admin.createUser({
  email: EMAIL, password: 'password123', email_confirm: true,
});
if (cErr) throw cErr;
const uid = created.user!.id;
await svc.from('users').update({ first_name: 'Robin', last_name: 'Ellis' }).eq('id', uid);
await svc.from('user_roles').upsert({ user_id: uid, role: 'student' }, { onConflict: 'user_id,role' });
await svc.from('tutor_profiles').upsert(
  // submitted_at: approve-tutor only decides SUBMITTED applications (0038).
  { user_id: uid, bio: 'applied', subjects: ['MGT 300'], hourly_rate: 25, submitted_at: new Date().toISOString() },
  { onConflict: 'user_id' },
);
console.log(`applicant ${EMAIL} (${uid})\n`);
check('starts pending with no tutor role', (await roleOf(uid)) === 'student');

// Sign in as a real admin — the function re-verifies is_admin() server-side.
initSupabase({ url: URL, anonKey: ANON });
const adminIn = await auth.signInWithPassword('admin@crimson.ua.edu', 'password123');
if (!adminIn.ok) throw new Error(`admin sign-in: ${adminIn.error}`);

// --- approve ------------------------------------------------------------------------------
const approved = await api.admin.approveTutor(uid, 'approved');
check('function reports approved', approved.approvalStatus === 'approved', JSON.stringify(approved));
check('function GRANTED the tutor role', (await roleOf(uid)) === 'student,tutor', await roleOf(uid));

// Put them in tutor mode, so rejection has something to reset.
await svc.from('users').update({ active_role: 'tutor' }).eq('id', uid);
check('approved tutor can hold active_role=tutor', (await activeRoleOf(uid)) === 'tutor');

// --- reject -------------------------------------------------------------------------------
const rejected = await api.admin.approveTutor(uid, 'rejected');
check('function reports rejected', rejected.approvalStatus === 'rejected', JSON.stringify(rejected));
check('function WITHDREW the tutor role', (await roleOf(uid)) === 'student', await roleOf(uid));
check('function reset them out of tutor mode', (await activeRoleOf(uid)) === 'student', String(await activeRoleOf(uid)));

// --- a non-admin must not be able to call it -------------------------------------------------
const studentIn = await auth.signInWithPassword('student@crimson.ua.edu', 'password123');
if (!studentIn.ok) throw new Error(studentIn.error);
let refused = false;
try {
  await api.admin.approveTutor(uid, 'approved');
} catch {
  refused = true;
}
check('non-admin cannot approve', refused);
check('…and no role leaked from the attempt', (await roleOf(uid)) === 'student', await roleOf(uid));

// Both rows — see 0026: auth deletion no longer cascades to public.users.
await svc.auth.admin.deleteUser(uid);
await svc.from('users').delete().eq('id', uid);
console.log(`\n${fail === 0 ? '✅ all' : `❌ ${fail} failed,`} ${pass} passed`);
process.exit(fail === 0 ? 0 : 1);
