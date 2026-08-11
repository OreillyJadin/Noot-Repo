// Throwaway integration check for account deletion (App Store 5.1.1(v)).
//
// Mirrors what the delete-account Edge Function does under the service role, then asserts the
// two things that matter and pull in opposite directions:
//   • the person is GONE — cannot sign in, no personal data left
//   • the MONEY is not — completed bookings survive, de-identified
//
//   pnpm dlx tsx scripts/verify_account_deletion.mts
import { createClient } from '@supabase/supabase-js';
import { initSupabase, auth, api } from '../packages/core/src/index.ts';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '✅' : '❌'} ${n}${d ? ` — ${d}` : ''}`);
  ok ? pass++ : fail++;
};

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });
const EMAIL = `leaver+${Date.now()}@crimson.ua.edu`;

// --- a user with real history: a completed, paid booking and a sent message ----------------
const { data: made, error: cErr } = await svc.auth.admin.createUser({
  email: EMAIL, password: 'password123', email_confirm: true,
});
if (cErr) throw cErr;
const uid = made.user!.id;
await svc.from('users').update({ first_name: 'Robin', last_name: 'Vale', major: 'Finance', avatar_url: 'https://x/y.png' }).eq('id', uid);
await svc.from('user_roles').upsert({ user_id: uid, role: 'student' }, { onConflict: 'user_id,role' });

const { data: tutor } = await svc.from('users').select('id').eq('email', 'sara@crimson.ua.edu').single();
const tutorId = tutor!.id as string;

const { data: booking, error: bErr } = await svc.from('bookings').insert({
  student_id: uid, tutor_id: tutorId, subject: 'MGT 300',
  scheduled_at: new Date(Date.now() - 864e5).toISOString(),
  duration_minutes: 60, price: 28, platform_fee: 4.9, tutor_payout_amount: 23.1,
  status: 'completed', session_type: 'in_person',
  cancellation_deadline: new Date(Date.now() - 2 * 864e5).toISOString(),
}).select('id, price').single();
if (bErr) throw bErr;

const { data: conv } = await svc.from('conversations')
  .upsert({ student_id: uid, tutor_id: tutorId }, { onConflict: 'student_id,tutor_id' })
  .select('id').single();
await svc.from('messages').insert({ conversation_id: conv!.id, sender_id: uid, content: 'see you then' });
console.log(`leaver ${EMAIL} (${uid}) with 1 completed booking + 1 message\n`);

// --- the deletion, as the Edge Function performs it ------------------------------------------
await svc.from('messages').delete().eq('sender_id', uid);
await svc.from('push_tokens').delete().eq('user_id', uid);
await svc.from('users').update({
  email: `deleted+${uid}@removed.invalid`, first_name: 'Deleted', last_name: 'account',
  year: null, major: null, gender: null, courses: [], avatar_url: null,
  deleted_at: new Date().toISOString(),
}).eq('id', uid);
const { error: delErr } = await svc.auth.admin.deleteUser(uid);
check('auth identity deleted without error', !delErr, delErr?.message ?? '');

// --- the person is gone -----------------------------------------------------------------------
initSupabase({ url: URL, anonKey: ANON });
// Deliberately the production sign-in path. An earlier revision used auth.devSignIn, which
// was "sign in OR SIGN UP" — it silently re-created the account we had just deleted and the
// assertion failed for the wrong reason. devSignIn has since been removed from @noot/core.
const signIn = await auth.signInWithPassword(EMAIL, 'password123');
check('deleted user can no longer sign in', !signIn.ok, signIn.ok ? 'STILL SIGNED IN' : `rejected: ${signIn.error}`);

const { data: authRow } = await svc.auth.admin.getUserById(uid);
check('auth.users row is gone', !authRow?.user);

const { data: row } = await svc.from('users').select('*').eq('id', uid).maybeSingle();
check('no personal data left on the retained row',
  !!row && row.first_name === 'Deleted' && !row.major && !row.avatar_url && !row.email.includes('crimson'),
  row ? `${row.first_name} ${row.last_name} / ${row.email}` : 'row missing');
check('row is marked deleted', !!row?.deleted_at);
check('messages they sent are gone',
  ((await svc.from('messages').select('id').eq('sender_id', uid)).data ?? []).length === 0);

// --- the money is not ---------------------------------------------------------------------------
// This is the whole reason 0026 dropped the users -> auth.users FK. Before it, deleting the
// auth identity cascaded through users -> bookings and took the payment record with it.
const { data: keptBooking } = await svc.from('bookings').select('id, price, status').eq('id', booking!.id).maybeSingle();
check('completed booking SURVIVED the deletion', !!keptBooking, keptBooking ? `$${keptBooking.price} ${keptBooking.status}` : 'DESTROYED');
check('booking still joins to the anonymised user',
  ((await svc.from('bookings').select('id, student:users!student_id(first_name)').eq('id', booking!.id)).data?.[0] as any)?.student?.first_name === 'Deleted');

// --- and they aren't visible to anyone else ------------------------------------------------------
// Use a DELETED TUTOR, not a deleted student: a student would never appear in tutor search
// regardless, so asserting it proved nothing. A deleted tutor keeps an approved
// tutor_profiles row, so this is the case that can actually leak.
const { data: leaverTutor } = await svc.auth.admin.createUser({
  email: `leavertutor+${Date.now()}@crimson.ua.edu`, password: 'password123', email_confirm: true,
});
const tUid = leaverTutor!.user!.id;
await svc.from('users').update({ first_name: 'Quinn', last_name: 'Rae' }).eq('id', tUid);
await svc.from('user_roles').upsert({ user_id: tUid, role: 'tutor' }, { onConflict: 'user_id,role' });
await svc.from('tutor_profiles').upsert(
  { user_id: tUid, bio: 'x', subjects: ['MGT 300'], hourly_rate: 25, approval_status: 'approved' },
  { onConflict: 'user_id' },
);

const asStudent = await auth.signInWithPassword('student@crimson.ua.edu', 'password123');
if (!asStudent.ok) throw new Error(asStudent.error);
check('approved tutor IS listed before deletion',
  (await api.tutors.search({})).some((t) => t.userId === tUid));

await svc.from('users').update({
  email: `deleted+${tUid}@removed.invalid`, first_name: 'Deleted', last_name: 'account',
  deleted_at: new Date().toISOString(),
}).eq('id', tUid);
await svc.auth.admin.deleteUser(tUid);

check('deleted TUTOR disappears from search (still approval_status=approved)',
  !(await api.tutors.search({})).some((t) => t.userId === tUid));
await svc.from('users').delete().eq('id', tUid);

// cleanup: the retained row is intentionally permanent, so remove the test's own leftovers.
await svc.from('bookings').delete().eq('id', booking!.id);
await svc.from('conversations').delete().eq('id', conv!.id);
await svc.from('users').delete().eq('id', uid);

console.log(`\n${fail === 0 ? '✅ all' : `❌ ${fail} failed,`} ${pass} passed`);
process.exit(fail === 0 ? 0 : 1);
