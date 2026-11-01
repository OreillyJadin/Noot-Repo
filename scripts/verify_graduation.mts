import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { api, auth, currentAcademicYear, graduationPromptDue, initSupabase } from '../packages/core/src/index.ts';
import { DEV_PASSWORD } from './_devPassword.mjs';

const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Local Supabase only');
let anonKey = process.env.SUPABASE_ANON_KEY;
let serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!anonKey || !serviceKey) {
  const local = JSON.parse(execFileSync('supabase', ['status', '-o', 'json'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  }));
  anonKey ??= local.ANON_KEY;
  serviceKey ??= local.SERVICE_ROLE_KEY;
}
if (!anonKey || !serviceKey) throw new Error('Load local Supabase credentials');
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const client = initSupabase({ url, anonKey });
const anonymous = createClient(url, anonKey, { auth: { persistSession: false } });
const made: { id: string; email: string }[] = [];
const currentYear = currentAcademicYear();
let checks = 0;
function check(name: string, ok: unknown) {
  assert.ok(ok, name);
  console.log(`PASS ${name}`);
  checks++;
}
async function makeUser(label: string, tutor = false) {
  const email = `graduation-${label}-${crypto.randomUUID()}@crimson.ua.edu`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: DEV_PASSWORD, email_confirm: true });
  assert.ifError(error);
  const user = { id: data.user!.id, email };
  made.push(user);
  const { error: profileError } = await admin.from('users').update({ first_name: 'Graduation', last_name: label, year: 'Senior' }).eq('id', user.id);
  assert.ifError(profileError);
  if (tutor) {
    const { error: roleError } = await admin.from('user_roles').upsert({ user_id: user.id, role: 'tutor' }, { onConflict: 'user_id,role' });
    assert.ifError(roleError);
    const { error: tutorError } = await admin.from('tutor_profiles').insert({ user_id: user.id, approval_status: 'approved', bio: 'Graduate tutor', hourly_rate: 30 });
    assert.ifError(tutorError);
  }
  return user;
}
async function login(email: string) {
  await auth.signOut();
  const result = await auth.signInWithPassword(email, DEV_PASSWORD);
  if (!result.ok) throw new Error(result.error);
}

try {
  const tutor = await makeUser('tutor', true);
  const peer = await makeUser('peer');
  await login(tutor.email);
  await api.profile.updatePersonal({ expectedGraduationYear: currentYear - 1 });
  check('owner reads saved expected year and overdue prompt becomes eligible', graduationPromptDue((await api.getMe())!));
  const before = (await api.getMe())!;
  await api.profile.respondToGraduation(false, currentYear + 2);
  let me = (await api.getMe())!;
  check('not yet saves replacement year without changing academic status', me.expectedGraduationYear === currentYear + 2 && me.year === 'Senior' && !graduationPromptDue(me));
  for (const invalid of [null, currentYear - 1, 2201]) {
    const { error } = await client.rpc('respond_to_graduation', { p_graduated: false, p_expected_year: invalid });
    check(`server rejects invalid replacement year ${invalid}`, !!error);
  }
  const { error: badAnswer } = await client.rpc('respond_to_graduation', { p_graduated: null });
  check('server requires an explicit graduation answer', !!badAnswer);
  await api.profile.respondToGraduation(true);
  me = (await api.getMe())!;
  check('graduation confirmation atomically sets Post Grad and clears expected year', me.year === 'Post Grad' && me.expectedGraduationYear === null && !graduationPromptDue(me));
  check('graduation retains active status and all roles', me.status === before.status && JSON.stringify(me.roles) === JSON.stringify(before.roles));
  check('Post Grad retains approved tutor standing', (await api.profile.getTutorStanding()).status === 'approved');
  for (const invalid of [1899, 2201]) {
    const { error } = await client.from('users').update({ expected_graduation_year: invalid }).eq('id', tutor.id);
    check(`raw owner write rejects out-of-bounds year ${invalid}`, !!error);
  }
  await login(peer.email);
  const { data: privateRows, error: privateError } = await client.from('users').select('expected_graduation_year').eq('id', tutor.id);
  assert.ifError(privateError);
  check('another student cannot read private graduation date', privateRows.length === 0);
  const { data: changed, error: changeError } = await client.from('users').update({ expected_graduation_year: currentYear + 5 }).eq('id', tutor.id).select('id');
  check('another student cannot change graduation fields', !changeError && changed.length === 0);
  const { data: publicRow, error: publicError } = await client.from('tutor_public_profiles').select('*').eq('id', tutor.id).single();
  assert.ifError(publicError);
  check('public tutor view shows Post Grad but never exposes private expected year', publicRow.year === 'Post Grad' && !Object.hasOwn(publicRow, 'expected_graduation_year'));
  check('Post Grad tutor remains visible in core tutor reads', (await api.tutors.getById(tutor.id))?.year === 'Post Grad');
  await api.profile.updatePersonal({ expectedGraduationYear: currentYear - 1 });
  await api.profile.respondToGraduation(true);
  check('student graduation confirmation also works', (await api.getMe())?.year === 'Post Grad');
  const { error: suspendError } = await admin.from('users').update({ status: 'suspended' }).eq('id', peer.id);
  assert.ifError(suspendError);
  const { error: suspended } = await client.rpc('respond_to_graduation', { p_graduated: true });
  check('suspended accounts cannot respond', !!suspended);
  const { error: anonError } = await anonymous.rpc('respond_to_graduation', { p_graduated: true });
  check('unauthenticated clients cannot respond', !!anonError);
  console.log(`${checks} passed, 0 failed`);
} finally {
  await auth.signOut();
  for (const user of made) {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw error;
  }
}
