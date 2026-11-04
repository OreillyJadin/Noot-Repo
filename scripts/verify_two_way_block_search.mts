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
  const removed = await a.c.from('user_blocks').delete().eq('blocker_id', a.id).eq('blocked_id', b.id);
  if (removed.error) throw removed.error;
  await visible(a, b.id, true, 'unblocking restores visibility');
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
