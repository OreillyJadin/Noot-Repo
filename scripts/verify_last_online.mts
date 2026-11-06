import { createClient } from '@supabase/supabase-js';
import { api, auth, initSupabase } from '../packages/core/src/index.ts';
import { DEV_PASSWORD } from './_devPassword.mjs';

const url = process.env.API_URL ?? process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const anonKey = process.env.ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!anonKey || !serviceKey) throw new Error('Export API_URL, ANON_KEY, and SERVICE_ROLE_KEY from `supabase status -o env`.');

const anon = createClient(url, anonKey);
const service = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
initSupabase({ url, anonKey });
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const ids: string[] = [];
let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    passed++;
    console.log(`✅ ${name}`);
  } else {
    failed++;
    console.error(`❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function createUser(label: string): Promise<string> {
  const { data, error } = await service.auth.admin.createUser({
    email: `verify.last-online.${label}.${suffix}@crimson.ua.edu`,
    password: DEV_PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: 'Last', last_name: 'Online' },
  });
  if (error || !data.user) throw error ?? new Error(`Could not create ${label}`);
  ids.push(data.user.id);
  return data.user.id;
}

async function setLastActive(id: string, createdAt: string, lastActiveAt: string | null, status = 'active') {
  const { error } = await service
    .from('users')
    .update({ created_at: createdAt, last_active_at: lastActiveAt, status })
    .eq('id', id);
  if (error) throw error;
}

try {
  const studentId = await createUser('student');
  const otherId = await createUser('other');
  const studentEmail = `verify.last-online.student.${suffix}@crimson.ua.edu`;
  const student = createClient(url, anonKey);
  const signedIn = await student.auth.signInWithPassword({ email: studentEmail, password: DEV_PASSWORD });
  check('test student signs in', !signedIn.error, signedIn.error?.message ?? '');
  const coreSignIn = await auth.signInWithPassword(studentEmail, DEV_PASSWORD);
  check('core session signs in as the test student', coreSignIn.ok, coreSignIn.error ?? '');

  await setLastActive(studentId, new Date().toISOString(), null);
  await setLastActive(otherId, new Date().toISOString(), new Date(Date.now() - 40 * 60 * 1000).toISOString());
  await api.touchLastActive();
  const firstTouch = await service.from('users').select('last_active_at').eq('id', studentId).single();
  check('touch_last_active sets the caller timestamp', !!firstTouch.data?.last_active_at);
  await api.touchLastActive();
  const secondTouch = await service.from('users').select('last_active_at').eq('id', studentId).single();
  check('a touch within 15 minutes does not change the timestamp',
    secondTouch.data?.last_active_at === firstTouch.data?.last_active_at);

  const directUpdate = await student
    .from('users')
    .update({ last_active_at: new Date().toISOString() })
    .eq('id', studentId)
    .select('id');
  const afterDirectUpdate = await service.from('users').select('last_active_at').eq('id', studentId).single();
  check('a student cannot set last_active_at directly',
    !!directUpdate.error || afterDirectUpdate.data?.last_active_at === firstTouch.data?.last_active_at);
  const otherRead = await student.from('users').select('last_active_at').eq('id', otherId).maybeSingle();
  check('a student cannot read another user last_active_at',
    !otherRead.error && otherRead.data === null, otherRead.error?.message ?? '');
  const adminRpcAsStudent = await student.rpc('admin_list_users', { p_status: 'inactive' });
  check('a non-admin cannot call admin_list_users', !!adminRpcAsStudent.error);
  await auth.signOut();

  const adminSignIn = await auth.signInWithPassword('admin@crimson.ua.edu', DEV_PASSWORD);
  check('seeded admin signs in', adminSignIn.ok, adminSignIn.error ?? '');
  const before = await api.admin.hubCounts();
  const now = new Date().toISOString();
  const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
  const createdOnly = await createUser('created-only');
  const activeAtOld = await createUser('active-old');
  const recent = await createUser('recent');
  const suspended = await createUser('suspended');
  await setLastActive(createdOnly, old, null);
  await setLastActive(activeAtOld, now, old);
  await setLastActive(recent, old, now);
  await setLastActive(suspended, old, old, 'suspended');

  const inactive = await api.admin.listUsers({ status: 'inactive', limit: 100 });
  const inactiveIds = new Set(inactive.users.map((user) => user.id));
  check('inactive user filter includes old-created and old-activity active accounts',
    inactiveIds.has(createdOnly) && inactiveIds.has(activeAtOld));
  check('inactive user filter excludes recently active and suspended accounts',
    !inactiveIds.has(recent) && !inactiveIds.has(suspended));
  const oldActivityRow = inactive.users.find((user) => user.id === activeAtOld);
  check('admin_list_users returns last_active_at',
    !!oldActivityRow?.lastActiveAt &&
      Math.abs(Date.parse(oldActivityRow.lastActiveAt) - Date.parse(old)) < 1000,
    JSON.stringify(oldActivityRow));
  const after = await api.admin.hubCounts();
  check('inactive30d count matches the inactive user set',
    after.inactive30d === before.inactive30d + 2 && after.inactive30d === inactive.total);
} catch (error) {
  failed++;
  console.error(`❌ verifier error — ${error instanceof Error ? error.message : JSON.stringify(error)}`);
} finally {
  await auth.signOut().catch(() => {});
  const { data: leftovers } = await service.from('users').select('id').like('email', 'verify.last-online.%');
  const cleanupIds = [...new Set([...ids, ...(leftovers ?? []).map((row) => row.id)])];
  for (const id of cleanupIds) await service.auth.admin.deleteUser(id).catch(() => {});
  if (cleanupIds.length) await service.from('users').delete().in('id', cleanupIds);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
