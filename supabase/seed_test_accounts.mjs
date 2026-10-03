// One-off seed — three role test accounts (ambassador / tutor / admin), created
// through the Admin API so identity + email confirmation are set up properly (NOT a
// raw insert into auth.users). Idempotent: safe to re-run. NOT a migration.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node supabase/seed_test_accounts.mjs
//
// Defaults target the local stack. Password for every account: "password123".
//
// Notes:
//  • admin.createUser fires the .edu gate (0003) — all emails are @crimson.ua.edu — and
//    the on_auth_user_created trigger, which pre-creates public.users + a default
//    'student' role. We then set active_role, add the target role, fill profile fields
//    (matching student@crimson.ua.edu's shape), and add the role-specific profile row.
//  • Granting 'admin' in user_roles is blocked by RLS for normal users (0002: role<>'admin')
//    but the service-role key bypasses RLS — which is why this must run as admin.
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const ANON =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const PASSWORD = 'password123';

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

// Profile placeholders mirror the dev student (Lindsay Carter / Sophomore / Undecided / f).
const ACCOUNTS = [
  { email: 'ambassador@crimson.ua.edu', role: 'ambassador', first: 'Amara', last: 'Bell', year: 'Junior', major: 'Communications', gender: 'f' },
  { email: 'tutor@crimson.ua.edu',      role: 'tutor',      first: 'Tori',  last: 'Nguyen', year: 'Senior', major: 'Computer Science', gender: 'f' },
  { email: 'admin@crimson.ua.edu',      role: 'admin',      first: 'Adam',  last: 'Minter', year: 'Grad',   major: 'Administration', gender: 'm' },
];

async function existingIdByEmail() {
  const map = new Map();
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users) map.set(u.email, u.id);
    if (data.users.length < 1000) break;
    page += 1;
  }
  return map;
}

async function ensureUser(email) {
  const existing = await existingIdByEmail();
  if (existing.has(email)) return existing.get(email);
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  // Created WITH its password, so the "password changed" trigger (0041) never fires for it.
  // Stamp it here or the app would start every seeded account at "Create your password".
  const stamp = await admin.from('users').update({ password_set_at: new Date().toISOString() }).eq('id', data.user.id);
  if (stamp.error) throw new Error(`password_set_at ${email}: ${stamp.error.message}`);
  return data.user.id;
}

const chk = (label, email, { error }) => { if (error) throw new Error(`${email} ${label}: ${error.message}`); };

async function seedAccount(a) {
  const id = await ensureUser(a.email);
  // public.users: profile fields + active_role.
  chk('users', a.email, await admin.from('users')
    .update({ first_name: a.first, last_name: a.last, year: a.year, major: a.major, gender: a.gender, active_role: a.role })
    .eq('id', id));
  // add the target role (the trigger already added 'student').
  chk('role', a.email, await admin.from('user_roles').upsert({ user_id: id, role: a.role }, { onConflict: 'user_id,role' }));

  // Role-specific 1:1 profile so the account is actually usable, not just tagged.
  if (a.role === 'tutor') {
    chk('tutor_profile', a.email, await admin.from('tutor_profiles').upsert({
      user_id: id, bio: 'Test tutor account.', subjects: ['MGT 300'], hourly_rate: 25,
      approval_status: 'approved', rating_avg: 4.8, total_sessions: 12, verified_grade: 'A',
    }, { onConflict: 'user_id' }));
    await admin.from('tutor_courses').delete().eq('tutor_id', id);
    chk('tutor_courses', a.email, await admin.from('tutor_courses')
      .insert([{ tutor_id: id, course_code: 'MGT 300', grade: 'A', hourly_rate: 25, sessions: 12 }]));
  } else if (a.role === 'ambassador') {
    chk('ambassador_profile', a.email, await admin.from('ambassador_profiles')
      .upsert({ user_id: id, referral_code: 'AMBASSADOR-TEST' }, { onConflict: 'user_id' }));
  }
  return id;
}

// Prove each account can actually sign in with its password (the real failure risk).
async function verifyLogin(a) {
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email: a.email, password: PASSWORD });
  if (error) throw new Error(`login ${a.email}: ${error.message}`);
  const uid = data.session?.user.id;
  // Confirm active_role landed as intended.
  const { data: rows, error: qErr } = await anon.from('users').select('active_role').eq('id', uid).single();
  if (qErr) throw new Error(`role check ${a.email}: ${qErr.message}`);
  await anon.auth.signOut();
  return rows.active_role;
}

for (const a of ACCOUNTS) {
  const id = await seedAccount(a);
  const activeRole = await verifyLogin(a);
  const okRole = activeRole === a.role ? '✅' : `❌ (got ${activeRole})`;
  console.log(`✅ ${a.role.padEnd(10)} ${a.email}  id=${id}  login=✅  active_role=${okRole}`);
}
console.log(`\nDone. Login with any of the above · password: ${PASSWORD}`);
