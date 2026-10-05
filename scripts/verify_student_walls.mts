// The student ↔ tutor wall (0038 + 0039). Acts as a fresh student holding only the anon key
// and their own JWT — i.e. a modified client, not the app — and tries every way across:
//   • self-grant the tutor role / switch into tutor mode            (0039: blocked)
//   • create or edit tutor_profiles with server-only fields          (0038: coerced / blocked)
//   • start an application, back out, keep editing — does it reach
//     the admin queue or search?                                     (0038: no)
//   • open a "tutor" chat with someone who isn't an approved tutor   (0039: blocked)
// Plus the things that must still work: ambassador opt-in, editing your own draft, and
// messaging a real tutor. Local stack only; doesn't need Edge Functions.
//   pnpm dlx tsx scripts/verify_student_walls.mts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = 'http://127.0.0.1:54321';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const PASSWORD = 'password123';
const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
}
const blocked = (r: { error: { message: string } | null }, name: string) =>
  check(name, !!r.error, r.error?.message ?? 'ALLOWED');
const allowed = (r: { error: { message: string } | null }, name: string) =>
  check(name, !r.error, r.error?.message ?? '');

async function signIn(email: string): Promise<{ c: SupabaseClient; uid: string }> {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return { c, uid: data.user!.id };
}

const email = `walls+${Date.now()}@crimson.ua.edu`;
const { error: cErr } = await svc.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
if (cErr) throw cErr;
const { c: s, uid } = await signIn(email);
// A student who finished onboarding, where the Terms are accepted — without that the server
// refuses their chat messages (0047), which is not the wall this script is about.
await s.from('users').update({ terms_accepted_at: new Date().toISOString(), terms_version: 'verify_student_walls' }).eq('id', uid);
const { c: other } = await signIn('student@crimson.ua.edu');
const { c: admin } = await signIn('admin@crimson.ua.edu');
const { data: victim } = await svc.from('users').select('id').eq('email', 'student@crimson.ua.edu').single();
const { data: sara } = await svc.from('users').select('id').eq('email', 'sara@crimson.ua.edu').single();

try {
  console.log('— roles —');
  blocked(await s.from('user_roles').insert({ user_id: uid, role: 'tutor' }), 'student cannot self-grant the tutor role');
  blocked(await s.from('user_roles').insert({ user_id: uid, role: 'admin' }), 'student cannot self-grant admin');
  blocked(await s.from('users').update({ active_role: 'tutor' }).eq('id', uid), 'student cannot switch active_role to tutor');
  allowed(await s.from('user_roles').insert({ user_id: uid, role: 'ambassador' }), 'ambassador opt-in still works');
  const del = await s.from('user_roles').delete().eq('user_id', uid).eq('role', 'student').select();
  check('student cannot drop their own student role', !del.error && (del.data ?? []).length === 0);

  console.log('\n— half an application, then back out and keep editing —');
  const ins = await s
    .from('tutor_profiles')
    .insert({ user_id: uid, bio: 'half-way', approval_status: 'approved', submitted_at: new Date().toISOString(), stripe_charges_enabled: true, stripe_payouts_enabled: true, grades_verified_at: new Date().toISOString(), rating_avg: 5 })
    .select('approval_status, submitted_at, stripe_charges_enabled, grades_verified_at, rating_avg')
    .single();
  check(
    'insert asking to be approved lands as a plain draft',
    !ins.error && ins.data?.approval_status === 'pending' && ins.data.submitted_at === null &&
      ins.data.stripe_charges_enabled === false && ins.data.grades_verified_at === null && ins.data.rating_avg === null,
    JSON.stringify(ins.data ?? ins.error?.message),
  );
  for (const [k, v] of [
    ['approval_status', 'approved'],
    ['submitted_at', new Date().toISOString()],
    ['stripe_charges_enabled', true],
    ['grades_verified_at', new Date().toISOString()],
    ['agreement_signed_at', new Date().toISOString()],
  ] as const) {
    blocked(await s.from('tutor_profiles').update({ [k]: v }).eq('user_id', uid), `cannot set ${k} directly`);
  }
  allowed(await s.from('tutor_profiles').update({ bio: 'Backed out, editing anyway' }).eq('user_id', uid), 'can still edit own draft bio');
  allowed(await s.from('tutor_courses').insert({ tutor_id: uid, course_code: 'CS 100', hourly_rate: 25 }), 'can still add a course to own draft');
  allowed(await s.from('tutor_availability').insert({ tutor_id: uid, day_of_week: 1, start_time: '10:00', end_time: '12:00' }), 'can still add availability to own draft');
  blocked(await s.rpc('submit_tutor_application'), 'submit refused while incomplete');
  blocked(await s.rpc('tutor_application_missing', { uid }), 'internal tutor_application_missing() not callable');

  const q = await admin
    .from('tutor_profiles')
    .select('user_id')
    .or('and(approval_status.eq.pending,submitted_at.not.is.null),and(approval_status.eq.approved,transcript_url.not.is.null,grades_verified_at.is.null)');
  check('draft is NOT in the admin approval queue', !q.error && !(q.data ?? []).some((r) => r.user_id === uid));
  const search = await other.from('users').select('id, tutor_profiles!user_id!inner(approval_status)').eq('tutor_profiles.approval_status', 'approved');
  check('draft is NOT in tutor search', !search.error && !(search.data ?? []).some((r) => r.id === uid));
  const peek = await other.from('tutor_profiles').select('user_id').eq('user_id', uid);
  check('another student cannot read the draft', !peek.error && (peek.data ?? []).length === 0);

  console.log('\n— chat —');
  blocked(await s.from('conversations').insert({ student_id: uid, tutor_id: victim!.id }), 'cannot open a "tutor" chat with a plain student');
  blocked(await s.from('conversations').insert({ student_id: victim!.id, tutor_id: uid }), 'cannot open a chat posing as the tutor');
  blocked(await s.from('conversations').insert({ student_id: uid, tutor_id: uid }), 'cannot open a chat with yourself');
  blocked(await s.from('conversations').insert({ kind: 'admin', student_id: null, tutor_id: null }), 'cannot create an admin room');
  const conv = await s.from('conversations').insert({ student_id: uid, tutor_id: sara!.id }).select('id').single();
  allowed(conv, 'can open a chat with an approved tutor');
  if (conv.data) {
    allowed(await s.from('messages').insert({ conversation_id: conv.data.id, sender_id: uid, content: 'hi' }), 'can message that tutor');
  }
} finally {
  await svc.from('conversations').delete().or(`student_id.eq.${uid},tutor_id.eq.${uid}`);
  await svc.auth.admin.deleteUser(uid);
  await svc.from('users').delete().eq('id', uid); // public.users doesn't cascade from auth.users
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
