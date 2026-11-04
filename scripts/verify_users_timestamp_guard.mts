import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { DEV_PASSWORD } from './_devPassword.mjs';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
assert(['127.0.0.1', 'localhost'].includes(new globalThis.URL(URL).hostname), 'local Supabase only');

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const svc = createClient(URL, SERVICE, options);
const student = createClient(URL, ANON, options);
const ids: string[] = [];
const authIds: string[] = [];
const email = `timestamp-${randomUUID()}@crimson.ua.edu`;
const past = '2001-01-01T00:00:00.000Z';
const future = '2099-01-01T00:00:00.000Z';
let passed = 0;
const check = (name: string, ok: unknown) => {
  assert(ok, name);
  passed++;
  console.log(`✅ ${name}`);
};
async function run<T>(query: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const result = await query;
  if (result.error) throw new Error(result.error.message);
  return result.data!;
}
async function createUser() {
  const created = await svc.auth.admin.createUser({ email, password: DEV_PASSWORD, email_confirm: true });
  if (created.error || !created.data.user) throw created.error ?? new Error('Auth user missing');
  const id = created.data.user.id;
  ids.push(id);
  authIds.push(id);
  return id;
}
const denied = (result: { error: { code: string; message: string } | null }) =>
  result.error?.code === '42501' && /permission denied for table users/.test(result.error.message);

try {
  const id = await createUser();
  const read = () => run(svc.from('users').select('created_at,deleted_at,first_name').eq('id', id).single());
  const original = await read();
  check('Auth SECURITY DEFINER trigger creates a timestamped, non-deleted user',
    Number.isFinite(Date.parse(original.created_at)) && original.deleted_at === null);
  await run(student.auth.signInWithPassword({ email, password: DEV_PASSWORD }));

  for (const column of ['created_at', 'deleted_at'] as const) {
    for (const [label, value] of [['past', past], ['future', future], ['null', null], ['unchanged', original[column]]] as const) {
      const result = await student.from('users').update({ [column]: value, first_name: 'Forged' }).eq('id', id);
      check(`DENY student PATCH ${column} (${label}) at column privileges`, denied(result));
    }
    for (const [label, value] of [['timestamp', past], ['null', null]] as const) {
      const result = await student.from('users').insert({ id, email, [column]: value });
      check(`DENY student INSERT ${column} (${label}) at column privileges`, denied(result));
    }
    const upsert = await student.from('users').upsert({ id, email, [column]: past }, { onConflict: 'id' });
    check(`DENY student UPSERT ${column}`, denied(upsert));
  }
  const untouched = await read();
  check('denied writes leave both timestamps and accompanying profile fields unchanged',
    untouched.created_at === original.created_at && untouched.deleted_at === null && untouched.first_name === original.first_name);

  const insertWithoutTimestamps = await student.from('users').insert({ id, email });
  check('INSERT without protected columns still reaches the existing RLS restriction',
    insertWithoutTimestamps.error?.code === '42501' && /row-level security policy/.test(insertWithoutTimestamps.error.message));
  const edited = await run(student.from('users').update({ first_name: 'TimestampEdited' }).eq('id', id).select('*').single());
  check('ordinary student profile PATCH and SELECT * still work',
    edited.first_name === 'TimestampEdited' && edited.created_at === original.created_at && edited.deleted_at === null);
  check('student SECURITY DEFINER confirm_date_of_birth RPC still works',
    await run(student.rpc('confirm_date_of_birth', { p_dob: '2000-01-01' })) === true);

  const updated = await run(svc.from('users').update({ created_at: past, deleted_at: past }).eq('id', id)
    .select('created_at,deleted_at').single());
  check('service role can set both timestamps', Date.parse(updated.created_at) === Date.parse(past) && Date.parse(updated.deleted_at) === Date.parse(past));
  const restored = await run(svc.from('users').update({ deleted_at: null }).eq('id', id).select('deleted_at').single());
  check('service role can clear deleted_at', restored.deleted_at === null);

  const serviceId = randomUUID();
  ids.push(serviceId);
  const inserted = await run(svc.from('users').insert({ id: serviceId, email: `trusted-${serviceId}@crimson.ua.edu`,
    created_at: past, deleted_at: past }).select('created_at,deleted_at').single());
  check('service role can INSERT explicit timestamps', Date.parse(inserted.created_at) === Date.parse(past) && Date.parse(inserted.deleted_at) === Date.parse(past));

  const deletion = await student.functions.invoke('delete-account', { body: {} });
  check('delete-account succeeds using the student JWT', !deletion.error && deletion.data?.ok === true);
  const retained = await read();
  check('deletion sets deleted_at while preserving created_at on the retained row',
    retained.deleted_at !== null && Date.parse(retained.deleted_at) > Date.parse(past) && Date.parse(retained.created_at) === Date.parse(past));
  const removed = await svc.auth.admin.getUserById(id);
  check('deletion removes the Auth identity', !removed.data.user);
  const rejoinedId = await createUser();
  const rejoined = await run(svc.from('users').select('created_at,deleted_at').eq('id', rejoinedId).single());
  check('re-registration gets a new identity and server-default timestamps',
    rejoinedId !== id && Date.parse(rejoined.created_at) > Date.parse(past) && rejoined.deleted_at === null);
  console.log(`\n${passed} passed, 0 failed`);
} finally {
  for (const id of ids) {
    await run(svc.from('notifications').delete().eq('user_id', id));
    await run(svc.from('user_roles').delete().eq('user_id', id));
    await run(svc.from('users').delete().eq('id', id));
  }
  for (const id of authIds) {
    const { error } = await svc.auth.admin.deleteUser(id);
    if (error && !/not found/i.test(error.message)) throw error;
  }
}
