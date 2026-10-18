// SEC-006 (0086): what another signed-in user can read about a tutor.
//
// Before 0086 any student could `select=*` an approved tutor's users + tutor_profiles rows and
// get their email, Stripe customer / Connect ids, transcript path and signed agreement. Now
// the base tables are owner + admin only and other users get the tutor_public_profiles view.
//
// Acts as a modified client (anon key + own JWT, raw PostgREST) and as the real @noot/core
// API. Creates its own users with a password that meets config.toml's rules; local stack
// only, no Edge Functions needed.
//   pnpm dlx tsx scripts/verify_tutor_public_fields.mts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { api, auth, initSupabase } from '../packages/core/src/index.ts';

const URL = 'http://127.0.0.1:54321';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const PASSWORD = 'Public-Fields-2026!';
const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
}

// What other users may see (Jadin, SEC-006): name, photo, bio, courses + rates, rating and
// session count, the Verified badge, plus what booking needs (id, approval state).
const VIEW_COLUMNS = [
  'id', 'first_name', 'last_name', 'year', 'major', 'avatar_url',
  'bio', 'subjects', 'hourly_rate', 'rating_avg', 'total_sessions', 'verified_grade',
  'grades_verified', 'approval_status',
];
// Everything else that lives on those rows — owner, admin and service_role only.
const USERS_SENSITIVE = ['email', 'stripe_customer_id', 'status', 'active_role', 'courses', 'gender', 'terms_accepted_at', 'password_set_at'];
const TUTOR_PROFILES_SENSITIVE = [
  'transcript_url', 'transcript_skipped', 'agreement_signed_name', 'agreement_signed_at', 'agreement_version',
  'stripe_connect_account_id', 'stripe_onboarded_at', 'stripe_charges_enabled', 'stripe_payouts_enabled',
  'reviewed_by', 'reviewed_at', 'grades_verified_by', 'grades_verified_at', 'submitted_at',
];
const AMBASSADOR_SENSITIVE = ['stripe_connect_account_id', 'referral_code', 'total_earned'];

const tag = `pubfields+${Date.now()}`;
const made: string[] = [];
async function createUser(label: string, first: string, last: string): Promise<{ id: string; email: string }> {
  const email = `${tag}.${label}@crimson.ua.edu`;
  const { data, error } = await svc.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  const id = data.user!.id;
  made.push(id);
  const { error: uErr } = await svc.from('users').update({ first_name: first, last_name: last, terms_accepted_at: new Date().toISOString(), terms_version: 'verify_tutor_public_fields' }).eq('id', id);
  if (uErr) throw uErr;
  return { id, email };
}
async function signIn(email: string): Promise<SupabaseClient> {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`${email}: ${error.message}`);
  return c;
}
const noRows = (r: { data: unknown[] | null; error: { message: string } | null }) => !r.error && (r.data ?? []).length === 0;
const describe = (r: { data: unknown; error: { message: string } | null }) =>
  r.error ? `error: ${r.error.message}` : `${Array.isArray(r.data) ? r.data.length : r.data === null ? 0 : 1} row(s)`;

const student = await createUser('student', 'Plain', 'Student');
const bystander = await createUser('bystander', 'Other', 'Student');
const tutor = await createUser('tutor', 'Tess', 'Tutor');
const pendingTutor = await createUser('pending', 'Pat', 'Pending');
const deletedTutor = await createUser('deleted', 'Dee', 'Gone');
const admin = await createUser('admin', 'Ada', 'Admin');

// Sensitive values that must never reach the student.
const SECRET = {
  email: tutor.email,
  stripe_customer_id: `cus_verify_${Date.now()}`,
  stripe_connect_account_id: `acct_verify_${Date.now()}`,
  transcript_url: `${tutor.id}/transcript.pdf`,
  agreement_signed_name: 'Tess Secret Tutor',
  referral_code: `REF${Date.now()}`,
};
const now = new Date().toISOString();
for (const [label, p] of [
  ['tutor', svc.from('users').update({ stripe_customer_id: SECRET.stripe_customer_id, year: 'Junior', major: 'Accounting', avatar_url: 'https://example.invalid/tess.jpg' }).eq('id', tutor.id)],
  ['tutor profile', svc.from('tutor_profiles').upsert({
    user_id: tutor.id, bio: 'Accounting, made bearable.', subjects: ['AC 210'], hourly_rate: 30, rating_avg: 4.5, total_sessions: 12,
    verified_grade: 'A', approval_status: 'approved', submitted_at: now, reviewed_by: admin.id, reviewed_at: now,
    grades_verified_at: now, grades_verified_by: admin.id, transcript_url: SECRET.transcript_url,
    agreement_signed_at: now, agreement_signed_name: SECRET.agreement_signed_name, agreement_version: '2026-01',
    stripe_connect_account_id: SECRET.stripe_connect_account_id, stripe_onboarded_at: now, stripe_charges_enabled: true, stripe_payouts_enabled: true,
  }, { onConflict: 'user_id' })],
  ['tutor role', svc.from('user_roles').upsert({ user_id: tutor.id, role: 'tutor' }, { onConflict: 'user_id,role' })],
  ['tutor course', svc.from('tutor_courses').insert({ tutor_id: tutor.id, course_code: 'AC 210', grade: 'A', hourly_rate: 30 })],
  ['ambassador profile', svc.from('ambassador_profiles').upsert({ user_id: tutor.id, referral_code: SECRET.referral_code, stripe_connect_account_id: SECRET.stripe_connect_account_id, total_earned: 1234 }, { onConflict: 'user_id' })],
  ['pending profile', svc.from('tutor_profiles').upsert({ user_id: pendingTutor.id, bio: 'not yet', approval_status: 'pending', submitted_at: now, transcript_url: `${pendingTutor.id}/t.pdf` }, { onConflict: 'user_id' })],
  ['deleted profile', svc.from('tutor_profiles').upsert({ user_id: deletedTutor.id, bio: 'was approved', approval_status: 'approved' }, { onConflict: 'user_id' })],
  ['deleted user', svc.from('users').update({ deleted_at: now }).eq('id', deletedTutor.id)],
  ['admin role', svc.from('user_roles').upsert({ user_id: admin.id, role: 'admin' }, { onConflict: 'user_id,role' })],
  ['conversation', svc.from('conversations').insert({ student_id: student.id, tutor_id: tutor.id })],
] as const) {
  const { error } = await p;
  if (error) throw new Error(`setup ${label}: ${error.message}`);
}

try {
  // ───────────── a plain student, raw PostgREST ─────────────
  console.log('— student: base tables —');
  const s = await signIn(student.email);
  check('student: users select=* for the tutor returns no row', noRows(await s.from('users').select('*').eq('id', tutor.id)));
  check('student: tutor_profiles select=* for the tutor returns no row', noRows(await s.from('tutor_profiles').select('*').eq('user_id', tutor.id)));
  check('student: ambassador_profiles for the tutor returns no row', noRows(await s.from('ambassador_profiles').select('*').eq('user_id', tutor.id)));
  check('student: another student\'s users row is invisible too', noRows(await s.from('users').select('id, first_name').eq('id', bystander.id)));
  for (const col of USERS_SENSITIVE) {
    const r = await s.from('users').select(col).eq('id', tutor.id);
    check(`student: users.${col} unreadable`, noRows(r), describe(r));
  }
  for (const col of TUTOR_PROFILES_SENSITIVE) {
    const r = await s.from('tutor_profiles').select(col).eq('user_id', tutor.id);
    check(`student: tutor_profiles.${col} unreadable`, noRows(r), describe(r));
  }
  for (const col of AMBASSADOR_SENSITIVE) {
    const r = await s.from('ambassador_profiles').select(col).eq('user_id', tutor.id);
    check(`student: ambassador_profiles.${col} unreadable`, noRows(r), describe(r));
  }
  // Filtering on a hidden column must not work as an oracle either (RLS applies before the filter).
  check('student: cannot probe users.email with a filter', noRows(await s.from('users').select('id').eq('email', tutor.email)));
  check('student: cannot probe tutor_profiles.transcript_url with a filter', noRows(await s.from('tutor_profiles').select('user_id').eq('transcript_url', SECRET.transcript_url)));

  console.log('\n— student: the view —');
  const v = await s.from('tutor_public_profiles').select(VIEW_COLUMNS.join(', ')).eq('id', tutor.id).maybeSingle();
  check('student: view returns the tutor\'s display fields', !v.error && !!v.data, describe(v));
  const row = (v.data ?? {}) as Record<string, unknown>;
  check('  name / photo / year / major', row.first_name === 'Tess' && row.last_name === 'Tutor' && row.avatar_url === 'https://example.invalid/tess.jpg' && row.year === 'Junior' && row.major === 'Accounting');
  check('  bio / subjects / rate / rating / sessions', row.bio === 'Accounting, made bearable.' && JSON.stringify(row.subjects) === '["AC 210"]' && Number(row.hourly_rate) === 30 && Number(row.rating_avg) === 4.5 && row.total_sessions === 12);
  check('  Verified badge + approval state', row.grades_verified === true && row.verified_grade === 'A' && row.approval_status === 'approved');
  check('  no value in the row looks like a secret', !Object.values(row).some((x) => typeof x === 'string' && (x.includes('@') || x.startsWith('cus_') || x.startsWith('acct_') || x.endsWith('.pdf') || x === SECRET.agreement_signed_name)), JSON.stringify(row));
  const star = await s.from('tutor_public_profiles').select('*').eq('id', tutor.id).maybeSingle();
  check('student: view select=* exposes only the display columns', !star.error && JSON.stringify(Object.keys(star.data ?? {}).sort()) === JSON.stringify([...VIEW_COLUMNS].sort()), Object.keys(star.data ?? {}).join(','));
  for (const col of [...new Set([...USERS_SENSITIVE, ...TUTOR_PROFILES_SENSITIVE])]) {
    if (VIEW_COLUMNS.includes(col)) continue;
    const r = await s.from('tutor_public_profiles').select(col).eq('id', tutor.id);
    check(`student: view has no ${col} column`, !!r.error && /does not exist/.test(r.error.message), describe(r));
  }
  check('student: a pending applicant is not in the view', noRows(await s.from('tutor_public_profiles').select('id').eq('id', pendingTutor.id)));
  check('student: a deleted approved tutor is not in the view', noRows(await s.from('tutor_public_profiles').select('id').eq('id', deletedTutor.id)));
  check('student: a non-tutor is not in the view', noRows(await s.from('tutor_public_profiles').select('id').eq('id', bystander.id)));
  const embed = await s.from('tutor_public_profiles').select('id, tutor_courses(course_code, hourly_rate)').eq('id', tutor.id).maybeSingle();
  check('student: tutor_courses embed through the view works', !embed.error && (embed.data as any)?.tutor_courses?.[0]?.course_code === 'AC 210', describe(embed));

  console.log('\n— student: embeds and RPCs that reach users / tutor_profiles —');
  const viaCourses = await s.from('tutor_courses').select('id, tutor:users!tutor_id(email, stripe_customer_id)').eq('tutor_id', tutor.id).limit(1).maybeSingle();
  check('student: tutor_courses → users embed yields null, not the email', !viaCourses.error && (viaCourses.data as any)?.tutor === null, describe(viaCourses));
  const viaConv = await s.from('conversations').select('id, tutor:users!tutor_id(email, stripe_customer_id)').eq('tutor_id', tutor.id).maybeSingle();
  check('student: conversations → users embed yields null, not the email', !viaConv.error && !!viaConv.data && (viaConv.data as any).tutor === null, describe(viaConv));
  const viaConvView = await s.from('conversations').select('id, tutor:tutor_public_profiles!tutor_id(first_name)').eq('tutor_id', tutor.id).maybeSingle();
  check('student: conversations → view embed still names the tutor', !viaConvView.error && (viaConvView.data as any)?.tutor?.first_name === 'Tess', describe(viaConvView));
  const rpcList = await s.rpc('admin_list_users', { p_search: 'Tess' });
  check('student: admin_list_users RPC refused', !!rpcList.error || (rpcList.data ?? []).length === 0, describe(rpcList));
  const rpcHist = await s.rpc('admin_user_history', { p_user: tutor.id });
  check('student: admin_user_history RPC refused', !!rpcHist.error, describe(rpcHist));
  const rpcVerified = await s.rpc('tutor_grades_verified', { uid: tutor.id });
  check('student: tutor_grades_verified RPC still answers (badge)', !rpcVerified.error && rpcVerified.data === true, describe(rpcVerified));
  const rpcApproved = await s.rpc('is_approved_tutor', { uid: tutor.id });
  check('student: is_approved_tutor RPC still answers (booking gate)', !rpcApproved.error && rpcApproved.data === true, describe(rpcApproved));
  const own = await s.from('users').select('id, email, stripe_customer_id').eq('id', student.id).maybeSingle();
  check('student: still reads their own users row with email', !own.error && own.data?.email === student.email, describe(own));

  console.log('\n— student: through @noot/core —');
  initSupabase({ url: URL, anonKey: ANON });
  const login = await auth.signInWithPassword(student.email, PASSWORD);
  if (!login.ok) throw new Error(login.error);
  const found = (await api.tutors.search()).find((t) => t.userId === tutor.id);
  check('core: tutors.search lists the tutor', !!found);
  check('  card has name, photo, rate, rating, Verified and courses', found?.firstName === 'Tess' && found?.avatarUrl === 'https://example.invalid/tess.jpg' && found?.hourlyRate === 30 && found?.ratingAvg === 4.5 && found?.verified === true && found?.courses[0]?.courseCode === 'AC 210', JSON.stringify(found));
  check('  summary carries no secret', !JSON.stringify(found ?? {}).match(/@|cus_|acct_|\.pdf|Secret/));
  const byId = await api.tutors.getById(tutor.id);
  check('core: tutors.getById(tutor) resolves', byId?.userId === tutor.id && byId.bio === 'Accounting, made bearable.');
  check('core: tutors.getById(pending applicant) is null', (await api.tutors.getById(pendingTutor.id)) === null);
  check('core: tutors.getById(another student) is null', (await api.tutors.getById(bystander.id)) === null);
  const me = await api.getMe();
  check('core: getMe still returns the caller\'s email', me?.email === student.email);
  await auth.signOut();

  // ───────────── the owner ─────────────
  console.log('\n— owner —');
  const t = await signIn(tutor.email);
  const ownUser = await t.from('users').select('*').eq('id', tutor.id).single();
  check('owner: reads own users row incl. email + stripe_customer_id', !ownUser.error && ownUser.data?.email === tutor.email && ownUser.data?.stripe_customer_id === SECRET.stripe_customer_id, describe(ownUser));
  const ownTp = await t.from('tutor_profiles').select('*').eq('user_id', tutor.id).single();
  check('owner: reads own tutor_profiles row incl. transcript / agreement / Connect id', !ownTp.error && ownTp.data?.transcript_url === SECRET.transcript_url && ownTp.data?.agreement_signed_name === SECRET.agreement_signed_name && ownTp.data?.stripe_connect_account_id === SECRET.stripe_connect_account_id, describe(ownTp));
  const ownAmb = await t.from('ambassador_profiles').select('referral_code').eq('user_id', tutor.id).single();
  check('owner: reads own ambassador_profiles row', !ownAmb.error && ownAmb.data?.referral_code === SECRET.referral_code, describe(ownAmb));
  const upd = await t.from('tutor_profiles').update({ bio: 'Accounting, made bearable. Really.' }).eq('user_id', tutor.id).select('bio').single();
  check('owner: still updates own bio', !upd.error && upd.data?.bio === 'Accounting, made bearable. Really.', describe(upd));
  const updU = await t.from('users').update({ major: 'Accounting & Finance' }).eq('id', tutor.id).select('major').single();
  check('owner: still updates own users row', !updU.error && updU.data?.major === 'Accounting & Finance', describe(updU));
  check('owner: cannot read another user\'s users row', noRows(await t.from('users').select('email').eq('id', student.id)));
  check('owner: sees self in the view', !noRows(await t.from('tutor_public_profiles').select('id').eq('id', tutor.id)));
  const p = await signIn(pendingTutor.email);
  const pendingSelf = await p.from('tutor_public_profiles').select('id, approval_status').eq('id', pendingTutor.id).maybeSingle();
  check('owner: a pending applicant sees their own card in the view (edit screen)', !pendingSelf.error && pendingSelf.data?.approval_status === 'pending', describe(pendingSelf));
  const pendingOther = await signIn(student.email);
  check('  …but nobody else does', noRows(await pendingOther.from('tutor_public_profiles').select('id').eq('id', pendingTutor.id)));

  // ───────────── an admin ─────────────
  console.log('\n— admin —');
  const a = await signIn(admin.email);
  const adminUser = await a.from('users').select('*').eq('id', tutor.id).single();
  check('admin: reads the tutor\'s users row incl. email', !adminUser.error && adminUser.data?.email === tutor.email, describe(adminUser));
  const adminTp = await a.from('tutor_profiles').select('*').eq('user_id', tutor.id).single();
  check('admin: reads the tutor\'s tutor_profiles row incl. transcript_url + reviewed_by', !adminTp.error && adminTp.data?.transcript_url === SECRET.transcript_url && adminTp.data?.reviewed_by === admin.id, describe(adminTp));
  const adminAmb = await a.from('ambassador_profiles').select('stripe_connect_account_id').eq('user_id', tutor.id).single();
  check('admin: reads the tutor\'s ambassador_profiles row', !adminAmb.error && adminAmb.data?.stripe_connect_account_id === SECRET.stripe_connect_account_id, describe(adminAmb));
  check('admin: reads a plain student\'s users row', !noRows(await a.from('users').select('id, email').eq('id', student.id)));
  const adminPending = await a.from('tutor_profiles').select('user_id, transcript_url').eq('approval_status', 'pending').eq('user_id', pendingTutor.id).maybeSingle();
  check('admin: tutor queue still sees pending applicants + transcript', !adminPending.error && !!adminPending.data?.transcript_url, describe(adminPending));
  const adminCount = await a.from('tutor_profiles').select('*', { count: 'exact', head: true }).eq('approval_status', 'approved');
  check('admin: head count on tutor_profiles still works', !adminCount.error && (adminCount.count ?? 0) >= 1, describe(adminCount));
  const adminRpc = await a.rpc('admin_list_users', { p_search: tag });
  check('admin: admin_list_users RPC returns email', !adminRpc.error && (adminRpc.data ?? []).some((r: any) => r.email === tutor.email), describe(adminRpc));

  // ───────────── anon ─────────────
  console.log('\n— anon —');
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const anonView = await anon.from('tutor_public_profiles').select('id').limit(1);
  check('anon: no access to the view', !!anonView.error || (anonView.data ?? []).length === 0, describe(anonView));
  const anonUsers = await anon.from('users').select('id').limit(1);
  check('anon: no access to users', !!anonUsers.error || (anonUsers.data ?? []).length === 0, describe(anonUsers));
} finally {
  await svc.from('ambassador_profiles').delete().in('user_id', made);
  await svc.from('tutor_courses').delete().in('tutor_id', made);
  await svc.from('conversations').delete().in('student_id', made);
  await svc.from('tutor_profiles').delete().in('user_id', made);
  for (const id of made) await svc.auth.admin.deleteUser(id);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
