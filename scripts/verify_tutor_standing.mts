import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { initSupabase, api, auth } from '../packages/core/src/index.ts';
import { DEV_PASSWORD } from './_devPassword.mjs';

const URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const ANON = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
assert(['127.0.0.1', 'localhost'].includes(new globalThis.URL(URL).hostname), 'local Supabase only');
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
initSupabase({ url: URL, anonKey: ANON });
const users: string[] = [];
const bookings: string[] = [];
let passed = 0;
let failed = 0;
async function check(name: string, fn: () => unknown | Promise<unknown>) {
  try {
    await fn();
    passed++;
    console.log(`✅ ${name}`);
  } catch (error) {
    failed++;
    console.error(`❌ ${name} — ${error instanceof Error ? error.message : String(error)}`);
  }
}
async function createUser(role: 'student' | 'tutor') {
  const email = `standing-${role}-${Date.now()}@crimson.ua.edu`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: DEV_PASSWORD, email_confirm: true });
  if (error || !data.user) throw error ?? new Error('missing user');
  users.push(data.user.id);
  const { error: roleError } = await admin.from('user_roles').upsert({ user_id: data.user.id, role });
  if (roleError) throw roleError;
  return { id: data.user.id, email };
}

await check('Standing keeps counts for admin review without automatic restrictions', () => {
  const source = readFileSync(new globalThis.URL('../apps/mobile/app/standing.tsx', import.meta.url), 'utf8');
  assert.match(source, /Cancellations and no-shows are recorded for admin review/);
  assert.match(source, /\{stats\.cancelledCount\}/);
  assert.doesNotMatch(source, /Needs attention|Repeated no-shows can pause/);
  assert.match(source, /\{stats\.noShowCount\}/);
  assert.match(source, /Sessions missed/);
  assert.match(source, /Student cancellations do not/);
});

try {
  const student = await createUser('student');
  const tutor = await createUser('tutor');
  const login = await auth.signInWithPassword(tutor.email, DEV_PASSWORD);
  assert(login.ok, 'tutor signs in through core');
  await check('empty standing has zero counts and rate', async () => {
    const stats = await api.tutorStats();
    assert.equal(stats.sessionsTaught, 0);
    assert.equal(stats.cancelledCount, 0);
    assert.equal(stats.noShowCount, 0);
    assert.equal(stats.cancelRate, 0);
  });
  const fixtures = [
    { status: 'completed' },
    { status: 'cancelled', cancelled_by_role: 'student', cancelled_from_status: 'confirmed' },
    { status: 'cancelled', cancelled_by_role: 'tutor', cancelled_from_status: 'confirmed' },
    { status: 'cancelled', cancelled_by_role: 'tutor', cancelled_from_status: 'pending', cancel_reason: 'tutor_declined' },
    { status: 'no_show', no_show_party: 'tutor' },
    { status: 'no_show', no_show_party: 'student' },
  ];
  for (const [i, fixture] of fixtures.entries()) {
    const scheduled = new Date(Date.now() + (72 + i * 4) * 3600000);
    const { data, error } = await admin.from('bookings').insert({
      student_id: student.id, tutor_id: tutor.id, subject: 'BSC 103',
      scheduled_at: scheduled.toISOString(), duration_minutes: 60,
      price: 50, platform_fee: 8.75, student_fee: 8.5, tutor_payout_amount: 41.25,
      session_type: 'in_person', refund_status: 'not_applicable',
      cancellation_deadline: new Date(scheduled.getTime() - 12 * 3600000).toISOString(),
      ...fixture,
    }).select('id').single();
    if (error || !data) throw error ?? new Error('missing booking');
    bookings.push(data.id);
  }
  await check('only tutor confirmed cancellations count; only tutor no-shows count', async () => {
    const stats = await api.tutorStats();
    assert.equal(stats.sessionsTaught, 1);
    assert.equal(stats.cancelledCount, 1);
    assert.equal(stats.noShowCount, 1);
    assert.equal(stats.cancelRate, 2 / 3);
  });
  await auth.signOut();
  await check('signed-out tutorStats rejects', async () => {
    await assert.rejects(() => api.tutorStats());
  });
} catch (error) {
  failed++;
  console.error(`❌ fixtures — ${error instanceof Error ? error.message : String(error)}`);
} finally {
  await auth.signOut();
  const remove = async (label: string, query: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await query;
    if (error) { failed++; console.error(`❌ cleanup ${label} — ${error.message}`); }
  };
  if (bookings.length) await remove('bookings', admin.from('bookings').delete().in('id', bookings));
  if (users.length) {
    await remove('notifications', admin.from('notifications').delete().in('user_id', users));
    await remove('roles', admin.from('user_roles').delete().in('user_id', users));
    await remove('profiles', admin.from('users').delete().in('id', users));
    for (const id of users) await remove('auth user', admin.auth.admin.deleteUser(id));
  }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
