import { createClient } from '@supabase/supabase-js';
import { DEV_PASSWORD } from './_devPassword.mjs';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
if (!['127.0.0.1', 'localhost'].includes(new globalThis.URL(URL).hostname)) {
  throw new Error('verify_user_email_lock only runs against local Supabase');
}

const PASSWORD = DEV_PASSWORD;
const tag = Date.now();
const originalEmail = `email-lock-${tag}@crimson.ua.edu`;
const spoofedEmail = `spoofed-${tag}@crimson.ua.edu`;
const serviceEmail = `service-${tag}@crimson.ua.edu`;
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
let userId = '';
let pass = 0;
let fail = 0;
let stage = 'create test user';

const check = (name: string, ok: boolean, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const cleanup = async () => {
  if (!userId) return;
  for (const [label, query] of [
    ['notifications', admin.from('notifications').delete().eq('user_id', userId)],
    ['roles', admin.from('user_roles').delete().eq('user_id', userId)],
    ['retained user', admin.from('users').delete().eq('id', userId)],
  ] as const) {
    const { error } = await query;
    if (error) {
      fail++;
      console.error(`❌ cleanup ${label} — ${error.message}`);
    }
  }
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error && !/not found/i.test(error.message)) {
    fail++;
    console.error(`❌ cleanup Auth identity — ${error.message}`);
  }
};

try {
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: originalEmail,
    password: PASSWORD,
    email_confirm: true,
  });
  if (createError || !created.user) throw createError ?? new Error('could not create test user');
  userId = created.user.id;

  const { error: profileError } = await admin.from('users').update({
    first_name: 'Email',
    last_name: 'Lock',
    status: 'active',
    deleted_at: null,
    password_set_at: new Date().toISOString(),
    terms_accepted_at: new Date().toISOString(),
    terms_version: '2026-09-17',
    guidelines_accepted_at: new Date().toISOString(),
    guidelines_version: '2026-10-13',
  }).eq('id', userId);
  if (profileError) throw profileError;
  const { error: roleError } = await admin.from('user_roles')
    .upsert({ user_id: userId, role: 'student' }, { onConflict: 'user_id,role' });
  if (roleError) throw roleError;

  const student = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: session, error: signInError } = await student.auth.signInWithPassword({
    email: originalEmail,
    password: PASSWORD,
  });
  if (signInError || !session.session) throw signInError ?? new Error('test user sign-in failed');

  stage = 'authenticated profile updates';
  const emailChange = await student.from('users')
    .update({ email: spoofedEmail })
    .eq('id', userId)
    .select('email');
  check('student email PATCH is refused with SQLSTATE 42501',
    !!emailChange.error && emailChange.error.code === '42501' &&
      emailChange.error.message.includes('email can only be changed by the server'),
    emailChange.error ? `${emailChange.error.code}: ${emailChange.error.message}` : 'PATCH unexpectedly succeeded');
  const { data: unchanged, error: unchangedError } = await admin.from('users')
    .select('email')
    .eq('id', userId)
    .single();
  check('refused email PATCH leaves the database email unchanged',
    !unchangedError && unchanged?.email === originalEmail,
    unchangedError?.message ?? `email=${unchanged?.email ?? 'missing'}`);

  const nameChange = await student.from('users')
    .update({ first_name: 'EmailChanged' })
    .eq('id', userId)
    .select('first_name')
    .single();
  check('student can still PATCH first_name',
    !nameChange.error && nameChange.data?.first_name === 'EmailChanged',
    nameChange.error?.message ?? `first_name=${nameChange.data?.first_name ?? 'missing'}`);

  stage = 'server-managed updates and deletion';
  const serviceUpdate = await admin.from('users')
    .update({ email: serviceEmail })
    .eq('id', userId)
    .select('email')
    .single();
  check('service-role email update still works',
    !serviceUpdate.error && serviceUpdate.data?.email === serviceEmail,
    serviceUpdate.error?.message ?? `email=${serviceUpdate.data?.email ?? 'missing'}`);

  const deletion = await fetch(`${URL}/functions/v1/delete-account`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${session.session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  const deletionBody = await deletion.json().catch(() => ({})) as Record<string, unknown>;
  check('delete-account succeeds after a service-role email update',
    deletion.ok,
    `HTTP ${deletion.status}${deletionBody.error ? `: ${deletionBody.error}` : ''}`);

  const { data: retained, error: retainedError } = await admin.from('users')
    .select('email,first_name,deleted_at')
    .eq('id', userId)
    .single();
  check('delete-account de-identifies the retained public.users row',
    !retainedError && retained?.email === `deleted+${userId}@removed.invalid` &&
      retained.first_name === 'Deleted' && retained.deleted_at !== null,
    retainedError?.message ?? `email=${retained?.email ?? 'missing'}`);
  const { data: authRecord } = await admin.auth.admin.getUserById(userId);
  check('delete-account removes the Auth identity', !authRecord?.user);
} catch (error) {
  fail++;
  console.error(`❌ ${stage} — ${error instanceof Error ? error.message : String(error)}`);
} finally {
  await cleanup();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
