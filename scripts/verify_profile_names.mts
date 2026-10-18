import { DEV_PASSWORD } from './_devPassword.mjs';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
if (!['127.0.0.1', 'localhost'].includes(new globalThis.URL(URL).hostname)) {
  throw new Error('verify_profile_names only runs against local Supabase');
}
const ANON =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const PASSWORD = DEV_PASSWORD;
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const email = `profile-names-${Date.now()}@crimson.ua.edu`;
let userId: string | undefined;
let pass = 0;
let fail = 0;

const step = (name: string, ok: boolean, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

try {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('Could not create verification user');
  userId = data.user.id;

  const { error: setupError } = await admin.from('users').update({
    first_name: 'Jamie',
    last_name: 'Verify',
    password_set_at: new Date().toISOString(),
    terms_accepted_at: new Date().toISOString(),
    terms_version: '2026-09-17',
    guidelines_accepted_at: new Date().toISOString(),
    guidelines_version: '2026-10-13',
  }).eq('id', userId);
  if (setupError) throw setupError;

  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInError) throw signInError;

  const rejected = async (field: 'first_name' | 'last_name', value: string, name: string) => {
    const { error: updateError } = await client.from('users').update({ [field]: value }).eq('id', userId);
    step(name, updateError?.code === '22023', updateError?.message ?? 'write was accepted');
  };

  await rejected('first_name', '', 'blank first name rejected');
  await rejected('last_name', '   ', 'whitespace last name rejected');
  await rejected('first_name', 'x'.repeat(51), '51-character name rejected');

  const { error: acceptedError } = await client.from('users').update({ first_name: 'Jamie' }).eq('id', userId);
  step('Jamie accepted', !acceptedError, acceptedError?.message ?? '');

  const { error: serviceError } = await admin.from('users').update({ first_name: '' }).eq('id', userId);
  step('service-role blank name update remains allowed', !serviceError, serviceError?.message ?? '');
} catch (error) {
  step('verification setup', false, error instanceof Error ? error.message : String(error));
} finally {
  await admin.auth.signOut().catch(() => {});
  if (userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) step('cleanup verification user', false, error.message);
  }
  console.log(`${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}
