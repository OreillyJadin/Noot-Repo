// Local stack only; exercises both Edge Functions and the conservative backfill.
// pnpm dlx tsx scripts/verify_deleted_tutor_cleanup.mts
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { api, initSupabase } from '../packages/core/src/index.ts';
import { DEV_PASSWORD } from './_devPassword.mjs';

const URL = 'http://127.0.0.1:54321';
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });
const users: string[] = [];
const clients: ReturnType<typeof createClient>[] = [];
let passed = 0;
function check(name: string, ok: boolean) {
  assert.ok(ok, name);
  console.log(`✅ ${name}`);
  passed++;
}
async function run<T>(query: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
async function user(label: string) {
  const email = `cleanup-${Date.now()}-${label}@crimson.ua.edu`;
  const created = await svc.auth.admin.createUser({ email, password: DEV_PASSWORD, email_confirm: true });
  if (created.error) throw created.error;
  const id = created.data.user!.id;
  users.push(id);
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  clients.push(c);
  const login = await c.auth.signInWithPassword({ email, password: DEV_PASSWORD });
  if (login.error) throw login.error;
  return { id, token: login.data.session!.access_token, email, c };
}
async function tutor(label: string, role = true, approved = true) {
  const u = await user(label);
  if (role) await run(svc.from('user_roles').insert({ user_id: u.id, role: 'tutor' }));
  await run(svc.from('tutor_profiles').insert({
    user_id: u.id, approval_status: approved ? 'approved' : 'pending', hourly_rate: 30,
    bio: 'Retained tutor bio', subjects: ['MGT 300'],
    stripe_connect_account_id: `acct_cleanup_${u.id.slice(0, 8)}`,
    stripe_payouts_enabled: true, rating_avg: 4, total_sessions: 1,
  }));
  await run(svc.from('tutor_courses').insert({ tutor_id: u.id, course_code: 'MGT 300', grade: 'A', hourly_rate: 30 }));
  await run(svc.from('tutor_availability').insert({ tutor_id: u.id, day_of_week: 1, start_time: '09:00', end_time: '10:00' }));
  await run(svc.from('availability_overrides').insert({ tutor_id: u.id, date: '2030-01-01', start_time: '09:00', end_time: '10:00', is_open: true }));
  return u;
}
async function call(name: string, token: string) {
  const response = await fetch(`${URL}/functions/v1/${name}`, {
    method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}',
  });
  return { status: response.status, body: await response.json() };
}
async function cleaned(id: string, label: string) {
  const profile = await run(svc.from('tutor_profiles').select('approval_status,submitted_at,stripe_connect_account_id,stripe_payouts_enabled,rating_avg,total_sessions').eq('user_id', id).single());
  check(`${label}: profile retained but not approved`, profile.approval_status === 'pending' && profile.submitted_at === null);
  check(`${label}: Stripe payout identity and stats retained`, profile.stripe_connect_account_id === `acct_cleanup_${id.slice(0, 8)}`
    && profile.stripe_payouts_enabled && Number(profile.rating_avg) === 4 && profile.total_sessions === 1);
  for (const table of ['tutor_courses', 'tutor_availability', 'availability_overrides']) {
    const rows = await run(svc.from(table).select('id').eq('tutor_id', id));
    check(`${label}: ${table} cleared`, rows.length === 0);
  }
  check(`${label}: student search hides tutor`, !(await api.tutors.search()).some(t => t.userId === id));
  check(`${label}: student getById hides tutor`, await api.tutors.getById(id) === null);
}

try {
  const student = await user('student');
  const core = initSupabase({ url: URL, anonKey: ANON });
  clients.push(core);
  const login = await core.auth.signInWithPassword({ email: student.email, password: DEV_PASSWORD });
  if (login.error) throw login.error;
  for (const path of ['delete-account', 'leave-tutor-role']) {
    const u = await tutor(path);
    check(`${path}: tutor initially discoverable`, (await api.tutors.search()).some(t => t.userId === u.id) && (await api.tutors.getById(u.id)) !== null);
    check(`${path}: unauthenticated request denied`, (await call(path, '')).status === 401);
    const past = await run(svc.from('bookings').insert({
      student_id: student.id, tutor_id: u.id, subject: 'MGT 300', status: 'completed',
      scheduled_at: new Date(Date.now() - 86400000).toISOString(), duration_minutes: 60,
      price: 30, tutor_payout_amount: 24, stripe_transfer_id: `tr_cleanup_${u.id.slice(0, 8)}`,
      session_type: 'video', cancellation_deadline: new Date().toISOString(),
    }).select('id').single());
    const review = await run(svc.from('reviews').insert({ booking_id: past.id, reviewer_id: student.id,
      subject_user_id: u.id, rating: 4, comment: 'Retained review', approval_status: 'approved',
    }).select('id').single());
    for (const status of ['pending', 'confirmed']) {
      const live = await run(svc.from('bookings').insert({
        student_id: student.id, tutor_id: u.id, subject: 'MGT 300', status,
        scheduled_at: new Date(Date.now() + 86400000).toISOString(), duration_minutes: 60,
        price: 30, tutor_payout_amount: 24, session_type: 'video', cancellation_deadline: new Date().toISOString(),
      }).select('id').single());
      check(`${path}: ${status} booking refuses departure`, (await call(path, u.token)).status === 409);
      const intact = await run(svc.from('tutor_courses').select('id').eq('tutor_id', u.id));
      const profile = await run(svc.from('tutor_profiles').select('approval_status').eq('user_id', u.id).single());
      check(`${path}: refused request preserves discovery data`, intact.length === 1 && profile.approval_status === 'approved');
      await run(svc.from('bookings').delete().eq('id', live.id));
    }
    const result = await call(path, u.token);
    check(`${path}: endpoint succeeds`, result.status === 200 && result.body.ok === true);
    await cleaned(u.id, path);
    const history = await run(student.c.from('bookings').select('id,status,tutor_payout_amount,stripe_transfer_id').eq('id', past.id).single());
    check(`${path}: student still reads past booking and payout record`, history.status === 'completed' && Number(history.tutor_payout_amount) === 24 && history.stripe_transfer_id === `tr_cleanup_${u.id.slice(0, 8)}`);
    const retainedReview = await run(student.c.from('reviews').select('comment,rating').eq('id', review.id).single());
    check(`${path}: student still reads past review`, retainedReview.comment === 'Retained review' && retainedReview.rating === 4);
    const retainedUser = await run(svc.from('users').select('deleted_at,email,first_name,active_role').eq('id', u.id).single());
    if (path === 'delete-account') {
      check('delete-account: de-identified user retained', retainedUser.deleted_at !== null && retainedUser.first_name === 'Deleted' && retainedUser.email === `deleted+${u.id}@removed.invalid`);
      const identity = await svc.auth.admin.getUserById(u.id);
      check('delete-account: login identity revoked', !identity.data.user);
    } else {
      const roles = await run(svc.from('user_roles').select('role').eq('user_id', u.id));
      check('leave-tutor-role: student identity retained without tutor role', retainedUser.deleted_at === null && retainedUser.email === u.email && retainedUser.active_role === 'student' && !roles.some(r => r.role === 'tutor'));
      check('leave-tutor-role: repeated departure refused', (await call(path, u.token)).status === 400);
    }
  }
  check('plain student cannot leave a tutor role', (await call('leave-tutor-role', student.token)).status === 400);
  const deleted = await tutor('backfill-deleted');
  const orphan = await tutor('backfill-left', false);
  const draft = await tutor('backfill-draft', false, false);
  const active = await tutor('backfill-active');
  await run(svc.from('users').update({ deleted_at: new Date().toISOString() }).eq('id', deleted.id));
  execFileSync('docker', ['exec', '-i', 'supabase_db_noot', 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
    input: readFileSync(new globalThis.URL('../supabase/migrations/0108_deleted_tutor_cleanup.sql', import.meta.url)),
  });
  await cleaned(deleted.id, 'backfill deleted');
  await cleaned(orphan.id, 'backfill approved without role');
  for (const u of [draft, active]) {
    const courses = await run(svc.from('tutor_courses').select('id').eq('tutor_id', u.id));
    const availability = await run(svc.from('tutor_availability').select('id').eq('tutor_id', u.id));
    const overrides = await run(svc.from('availability_overrides').select('id').eq('tutor_id', u.id));
    const profile = await run(svc.from('tutor_profiles').select('approval_status').eq('user_id', u.id).single());
    check(`backfill preserves ${u.id === draft.id ? 'pending applicant' : 'active tutor'}`, courses.length === 1 && availability.length === 1 && overrides.length === 1 && profile.approval_status === (u.id === draft.id ? 'pending' : 'approved'));
  }
  console.log(`\n${passed} passed, 0 failed`);
} finally {
  for (const c of clients) await c.auth.signOut({ scope: 'local' });
  for (const id of users.reverse()) {
    await run(svc.from('users').delete().eq('id', id));
    await svc.auth.admin.deleteUser(id);
  }
}
