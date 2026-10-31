// Local-only integration coverage of the real core reads and participant RLS.
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { api, auth, initSupabase, type BookingStatus } from '../packages/core/src/index.ts';
import { DEV_PASSWORD } from './_devPassword.mjs';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw new Error('Local Supabase only');
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!anonKey || !serviceKey) throw new Error('Set local SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY');
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const client = initSupabase({ url, anonKey });
const users: { id: string; email: string }[] = [];
const bookings: string[] = [];
const now = Date.now();
const tag = crypto.randomUUID();
let checks = 0;
const checkIds = (name: string, rows: { id: string }[], expected: string[]) => {
  assert.deepEqual(rows.map((r) => r.id).sort(), [...expected].sort(), name);
  console.log(`PASS ${name}`);
  checks++;
};

async function makeUser(label: string) {
  const email = `session-${label}-${tag}@crimson.ua.edu`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: DEV_PASSWORD, email_confirm: true });
  if (error || !data.user) throw error ?? new Error('Missing fixture user');
  const user = { id: data.user.id, email };
  users.push(user);
  const { error: updateError } = await admin.from('users').update({
    first_name: 'Session', last_name: label, status: 'active',
  }).eq('id', user.id);
  if (updateError) throw updateError;
  const { error: roleError } = await admin.from('user_roles').upsert(
    ['student', 'tutor'].map((role) => ({ user_id: user.id, role })), { onConflict: 'user_id,role' },
  );
  if (roleError) throw roleError;
  return user;
}

async function insert(studentId: string, tutorId: string, status: BookingStatus, minutesFromNow: number, duration = 60) {
  const { data, error } = await admin.from('bookings').insert({
    student_id: studentId, tutor_id: tutorId, status, subject: 'MGT 300', price: 30,
    tutor_payout_amount: 20.25, session_type: 'in_person',
    cancellation_deadline: new Date(now - 12 * 3_600_000).toISOString(),
    scheduled_at: new Date(now + minutesFromNow * 60_000).toISOString(), duration_minutes: duration,
    ...(status === 'pending' ? { accept_by: new Date(now + 60_000).toISOString() } : {}),
  }).select('id').single();
  if (error) throw error;
  bookings.push(data.id);
  return data.id as string;
}

async function login(email: string) {
  await auth.signOut();
  const result = await auth.signInWithPassword(email, DEV_PASSWORD);
  if (!result.ok) throw new Error(result.error);
}

try {
  const dual = await makeUser('dual');
  const peer = await makeUser('peer');
  const outsider = await makeUser('outsider');
  const longTutor = await makeUser('long');
  const active = await insert(dual.id, peer.id, 'confirmed', -10);
  const future = await insert(dual.id, peer.id, 'confirmed', 120);
  const ended = await insert(dual.id, peer.id, 'confirmed', -180);
  const request = await insert(dual.id, peer.id, 'pending', 240);
  await insert(dual.id, peer.id, 'pending', -360, 30);
  const cancelled = await insert(dual.id, peer.id, 'cancelled', 360);
  const completed = await insert(dual.id, peer.id, 'completed', -720);
  const noShow = await insert(dual.id, peer.id, 'no_show', -480);
  const reverse = await insert(peer.id, dual.id, 'confirmed', -10);
  const longest = await insert(peer.id, longTutor.id, 'confirmed', -470, 480);

  await login(dual.email);
  checkIds('student upcoming includes active, future and request only', await api.listUpcoming('student'), [active, future, request]);
  checkIds('student past excludes active and expired request', await api.listPast('student'), [ended, cancelled, completed, noShow]);
  checkIds('dual-role tutor list stays role-scoped', await api.listUpcoming('tutor'), [reverse]);
  checkIds('dual-role tutor past excludes student history', await api.listPast('tutor'), []);
  checkIds('shared calendar includes both roles', await api.listUpcoming(), [active, future, request, reverse]);
  await login(peer.email);
  checkIds('tutor upcoming retains active session', await api.listUpcoming('tutor'), [active, future, request]);
  checkIds('tutor past waits for full duration', await api.listPast('tutor'), [ended, cancelled, completed, noShow]);
  checkIds('longest valid session remains active near its end', await api.listUpcoming('student'), [reverse, longest]);
  await login(outsider.email);
  checkIds('nonparticipant upcoming is empty', await api.listUpcoming(), []);
  checkIds('nonparticipant past is empty', await api.listPast(), []);
  const { data: raw, error: rawError } = await client.from('bookings').select('id').in('id', bookings);
  assert.ifError(rawError);
  checkIds('RLS denies fixture reads without client ownership predicates', raw ?? [], []);
  console.log(`${checks} passed, 0 failed`);
} finally {
  await auth.signOut();
  if (bookings.length) {
    const { error } = await admin.from('bookings').delete().in('id', bookings);
    if (error) throw error;
  }
  for (const user of users) {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw error;
  }
}
