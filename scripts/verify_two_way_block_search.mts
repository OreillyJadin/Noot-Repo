// Local stack only: raw non-owner reads and the real core API must agree on blocks.
// pnpm dlx tsx scripts/verify_two_way_block_search.mts
import assert from 'node:assert/strict';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { api, initSupabase } from '../packages/core/src/index.ts';
import { DEV_PASSWORD } from './_devPassword.mjs';

const URL = 'http://127.0.0.1:54321';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });
const made: string[] = [];
const clients: SupabaseClient[] = [];
let passed = 0;
function check(name: string, ok: boolean) {
  assert.ok(ok, name);
  console.log(`✅ ${name}`);
  passed++;
}
async function user(label: string) {
  const email = `blocks+${Date.now()}.${label}@crimson.ua.edu`;
  const { data, error } = await svc.auth.admin.createUser({ email, password: DEV_PASSWORD, email_confirm: true });
  if (error) throw error;
  const id = data.user!.id;
  made.push(id);
  const profile = await svc.from('users').update({ first_name: 'BlockTest', last_name: 'Person' }).eq('id', id);
  if (profile.error) throw profile.error;
  const c = initSupabase({ url: URL, anonKey: ANON });
  clients.push(c);
  const login = await c.auth.signInWithPassword({ email, password: DEV_PASSWORD });
  if (login.error) throw login.error;
  return { id, c, session: login.data.session! };
}
async function approve(id: string) {
  const { error } = await svc.from('tutor_profiles').upsert({ user_id: id, approval_status: 'approved', bio: 'Block verification', hourly_rate: 30 });
  if (error) throw error;
}
async function visible(reader: Awaited<ReturnType<typeof user>>, tutorId: string, expected: boolean, label: string) {
  const { data, error } = await reader.c.from('tutor_public_profiles').select('*').eq('id', tutorId);
  if (error) throw error;
  check(`${label}: raw view`, (data.length === 1) === expected);
  const { error: saveError } = await reader.c.from('saved_tutors').upsert({ student_id: reader.id, tutor_id: tutorId });
  if (saveError) throw saveError;
  const c = initSupabase({ url: URL, anonKey: ANON });
  clients.push(c);
  const session = await c.auth.setSession(reader.session);
  if (session.error) throw session.error;
  check(`${label}: search`, (await api.tutors.search()).some(t => t.userId === tutorId) === expected);
  check(`${label}: getById`, ((await api.tutors.getById(tutorId)) !== null) === expected);
  check(`${label}: listSaved`, (await api.tutors.listSaved()).some(t => t.userId === tutorId) === expected);
}

try {
  const a = await user('a');
  const b = await user('b');
  const c = await user('c');
  const unrelated = await user('unrelated');
  await approve(a.id);
  await approve(b.id);
  await approve(c.id);
  await visible(a, b.id, true, 'before blocking');
  const outgoing = await a.c.from('user_blocks').insert({ blocker_id: a.id, blocked_id: b.id });
  if (outgoing.error) throw outgoing.error;
  const incoming = await b.c.from('user_blocks').insert({ blocker_id: b.id, blocked_id: c.id });
  if (incoming.error) throw incoming.error;
  await visible(a, b.id, false, 'A blocked B');
  await visible(c, b.id, false, 'B blocked C');
  await visible(b, a.id, false, 'B cannot see blocker A');
  await visible(b, c.id, false, 'B cannot see blocked C');
  await visible(unrelated, b.id, true, 'unrelated student sees B');
  const summaries = await a.c.rpc('my_blocked_users');
  if (summaries.error) throw summaries.error;
  check('blocker can read only outgoing blocked-user summaries', summaries.data.length === 1 && summaries.data[0].id === b.id);
  check('RPC exposes only id, first name, last initial and avatar',
    Object.keys(summaries.data[0]).sort().join(',') === 'avatar_url,first_name,id,last_initial'
    && summaries.data[0].first_name === 'BlockTest' && summaries.data[0].last_initial === 'P');
  const incomingOnly = await c.c.rpc('my_blocked_users');
  if (incomingOnly.error) throw incomingOnly.error;
  check('incoming block does not expose the blocker', incomingOnly.data.length === 0);
  const nobody = await unrelated.c.rpc('my_blocked_users');
  if (nobody.error) throw nobody.error;
  check('unrelated caller gets an empty block list', nobody.data.length === 0);
  const apiClient = initSupabase({ url: URL, anonKey: ANON });
  clients.push(apiClient);
  const apiLogin = await apiClient.auth.setSession(a.session);
  if (apiLogin.error) throw apiLogin.error;
  const blocked = await api.moderation.listBlocked();
  check('core listBlocked retains the blocked tutor name', blocked.length === 1 && blocked[0].id === b.id
    && blocked[0].firstName === 'BlockTest' && blocked[0].lastName === 'P' && blocked[0].avatarUrl === null);
  const studentBlock = await a.c.from('user_blocks').insert({ blocker_id: a.id, blocked_id: unrelated.id });
  if (studentBlock.error) throw studentBlock.error;
  const withStudent = await api.moderation.listBlocked();
  check('core listBlocked also names blocked non-tutors', withStudent.length === 2
    && withStudent.some(p => p.id === unrelated.id && p.firstName === 'BlockTest' && p.lastName === 'P'));
  const removeStudentBlock = await a.c.from('user_blocks').delete().eq('blocker_id', a.id).eq('blocked_id', unrelated.id);
  if (removeStudentBlock.error) throw removeStudentBlock.error;
  const privateBlock = await c.c.from('user_blocks').select('*').eq('blocker_id', b.id);
  if (privateBlock.error) throw privateBlock.error;
  check('incoming block rows stay private', privateBlock.data.length === 0);
  for (const [table, column] of [['users', 'id'], ['tutor_profiles', 'user_id']] as const) {
    const r = await a.c.from(table).select('*').eq(column, b.id);
    if (r.error) throw r.error;
    check(`blocked tutor cannot be read through ${table}`, r.data.length === 0);
  }
  const own = await b.c.from('tutor_public_profiles').select('id').eq('id', b.id);
  if (own.error) throw own.error;
  check('tutor still sees own profile', own.data.length === 1);
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  check('anonymous view read denied', !!(await anon.from('tutor_public_profiles').select('id')).error);
  check('anonymous blocked-user RPC denied', (await anon.rpc('my_blocked_users')).error?.code === '42501');
  const suspended = await svc.from('users').update({ status: 'suspended' }).eq('id', a.id);
  if (suspended.error) throw suspended.error;
  check('suspended caller with existing token denied', (await a.c.rpc('my_blocked_users')).error?.code === '42501');
  const deleted = await svc.from('users').update({ status: 'active', deleted_at: new Date().toISOString() }).eq('id', a.id);
  if (deleted.error) throw deleted.error;
  check('soft-deleted active caller with existing token denied', (await a.c.rpc('my_blocked_users')).error?.code === '42501');
  const restored = await svc.from('users').update({ deleted_at: null }).eq('id', a.id);
  if (restored.error) throw restored.error;
  const removed = await a.c.from('user_blocks').delete().eq('blocker_id', a.id).eq('blocked_id', b.id);
  if (removed.error) throw removed.error;
  await visible(a, b.id, true, 'unblocking restores visibility');
  const afterUnblock = await a.c.rpc('my_blocked_users');
  if (afterUnblock.error) throw afterUnblock.error;
  check('unblocking removes the summary', afterUnblock.data.length === 0);
  console.log(`\n${passed} passed, 0 failed`);
} finally {
  for (const c of clients) await c.auth.signOut({ scope: 'local' });
  for (const id of made.reverse()) {
    const row = await svc.from('users').delete().eq('id', id);
    if (row.error) throw row.error;
    const auth = await svc.auth.admin.deleteUser(id);
    if (auth.error) throw auth.error;
  }
}
