import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { api, initSupabase } from '../packages/core/src/index.ts';
import { DEV_PASSWORD } from './_devPassword.mjs';

const URL = 'http://127.0.0.1:54321';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const service = createClient(URL, SERVICE, { auth: { persistSession: false } });
const student = createClient(URL, ANON, { auth: { persistSession: false } });
const tag = `growth-${Date.now()}`;
const users: string[] = [];
const bookings: string[] = [];
const since = '2100-01-01T00:00:00Z';
const until = '2100-02-01T00:00:00Z';
let checks = 0;
function pass(message: string) { checks++; console.log(`✅ ${message}`); }
function ok(error: unknown) { if (error) throw error; }
async function user(name: string, role?: 'tutor' | 'admin') {
  const email = `${tag}-${name}@crimson.ua.edu`;
  const { data, error } = await service.auth.admin.createUser({ email, password: DEV_PASSWORD, email_confirm: true });
  ok(error);
  const id = data.user!.id;
  users.push(id);
  ok((await service.from('users').update({ created_at: since, first_name: 'Growth', last_name: 'Fixture' }).eq('id', id)).error);
  if (role) ok((await service.from('user_roles').upsert({ user_id: id, role })).error);
  return { id, email };
}
async function event(userId: string, event: string, props = {}) {
  ok((await service.from('analytics_events').insert({ user_id: userId, event, props, created_at: '2100-01-15T00:00:00Z' })).error);
}
let sequence = 0;
async function booking(studentId: string, tutorId: string, status: string, extra = {}) {
  sequence++;
  const { data, error } = await service.from('bookings').insert({
    student_id: studentId, tutor_id: tutorId, subject: 'CS 100', status,
    scheduled_at: `2100-01-${String(sequence + 1).padStart(2, '0')}T12:00:00Z`, duration_minutes: 60,
    price: 30, platform_fee: 6, tutor_payout_amount: 24, session_type: 'in_person',
    cancellation_deadline: '2099-01-01T00:00:00Z',
    created_at: '2100-01-01T12:00:00Z', accepted_at: status === 'completed' ? '2100-01-02T00:00:00Z' : null,
    completed_at: status === 'completed' ? '2100-01-10T00:00:00Z' : null, ...extra,
  }).select('id').single();
  ok(error); bookings.push(data!.id); return data!.id as string;
}

try {
  const [s1, s2, s3, t1, t2, admin] = await Promise.all([
    user('one'), user('two'), user('three'), user('tutor', 'tutor'), user('other-tutor', 'tutor'), user('admin', 'admin'),
  ]);
  ok((await student.auth.signInWithPassword({ email: s1.email, password: DEV_PASSWORD })).error);
  ok((await student.from('analytics_events').insert({ user_id: s1.id, event: 'search_performed', props: { query: 'CS 100', resultCount: 1 }, created_at: since })).error);
  const stored = await service.from('analytics_events').select('created_at').eq('user_id', s1.id).single();
  ok(stored.error); assert.ok(Math.abs(Date.parse(stored.data!.created_at) - Date.now()) < 60000);
  pass('student allowlisted event inserts; server stamps time');
  for (const [label, row] of [
    ['bogus event', { event: 'booking_completed' }],
    ['oversized props', { props: { query: 'é'.repeat(1100) } }],
    ['non-object props', { props: [] }],
    ['another user', { user_id: s2.id }],
  ] as const) {
    assert.ok((await student.from('analytics_events').insert({ user_id: s1.id, event: 'search_performed', props: {}, ...row })).error);
    pass(`student ${label} DENIED`);
  }
  assert.ok((await student.rpc('admin_growth_funnel', { p_since: since, p_until: until })).error);
  pass('student growth RPC DENIED');
  assert.ok((await createClient(URL, ANON).rpc('admin_growth_funnel', { p_since: since, p_until: until })).error);
  pass('anonymous growth RPC DENIED');
  ok((await service.from('users').update({ status: 'suspended' }).eq('id', s1.id)).error);
  assert.ok((await student.from('analytics_events').insert({ user_id: s1.id, event: 'invite_shared' })).error);
  ok((await service.from('users').update({ status: 'active' }).eq('id', s1.id)).error);
  pass('inactive student event DENIED');
  ok((await service.from('analytics_events').insert(Array.from({ length: 299 }, () => ({ user_id: s1.id, event: 'role_switch' })))).error);
  assert.ok((await student.from('analytics_events').insert({ user_id: s1.id, event: 'invite_shared' })).error);
  pass('301st event within one hour DENIED');
  ok((await service.from('analytics_events').delete().eq('user_id', s1.id)).error);

  for (const id of [s1.id, s1.id, s2.id]) await event(id, 'onboarding_completed', { role: 'student' });
  for (const id of [s1.id, s1.id, s1.id, s2.id]) await event(id, 'search_performed', { query: 'CS 999', resultCount: 0 });
  for (const id of [s1.id, s1.id]) await event(id, 'search_empty', { query: 'CS 999' });
  await event(s2.id, 'search_empty', { query: 'physics', courseCode: 'PH 999' });
  for (const id of [s1.id, s1.id, s2.id]) await event(id, 'tutor_profile_viewed', { tutorId: t1.id, source: 'search' });
  for (const id of [s1.id, s1.id, s3.id]) await event(id, 'booking_started', { tutorId: t1.id, courseCode: 'CS 100' });
  for (const id of [s1.id, s1.id, s2.id]) await event(id, 'invite_shared');
  await event(s1.id, 'role_switch', { from: 'student', to: 'tutor' });
  const reviewed = await booking(s1.id, t1.id, 'completed');
  await booking(s1.id, t1.id, 'completed');
  await booking(s2.id, t1.id, 'completed');
  await booking(s3.id, t1.id, 'completed');
  await booking(s3.id, t2.id, 'completed');
  await booking(s1.id, t1.id, 'cancelled', { cancelled_at: '2100-01-10T00:00:00Z', cancel_reason: 'tutor_declined' });
  await booking(s2.id, t1.id, 'cancelled', { cancelled_at: '2100-01-11T00:00:00Z', cancel_reason: 'tutor_no_response' });
  await booking(s3.id, t1.id, 'cancelled', { cancelled_at: '2100-01-12T00:00:00Z', cancelled_by_role: 'student', accepted_at: '2100-01-02T00:00:00Z', cancelled_from_status: 'confirmed' });
  const pending = await booking(s3.id, t1.id, 'pending');
  await booking(s2.id, t1.id, 'completed', { created_at: '2099-01-01T00:00:00Z', accepted_at: '2099-01-02T00:00:00Z', completed_at: '2099-01-03T00:00:00Z' });
  ok((await service.from('reviews').insert({ booking_id: reviewed, reviewer_id: s1.id, subject_user_id: t1.id, rating: 5, created_at: '2100-01-20T00:00:00Z' })).error);

  initSupabase({ url: URL, anonKey: ANON });
  const { auth } = await import('../packages/core/src/index.ts');
  const login = await auth.signInWithPassword(admin.email, DEV_PASSWORD);
  assert.ok(login.ok);
  const result = await api.admin.growthFunnel(since, until);
  for (const [key, expected] of Object.entries({ signups: 6, onboarded: 2, searchers: 2, searches: 4, emptySearches: 3, profileViewers: 2, bookingStarters: 2, bookingsRequested: 9, requesters: 3, accepted: 6, acceptedStudents: 3, declinedExpired: 2, cancelled: 1, completed: 5, completedStudents: 3, reviewed: 1, reviewedStudents: 1, invitesShared: 3, inviteSharers: 2 })) {
    assert.equal(result[key as keyof typeof result], expected, key);
  }
  pass('admin exact signup, unique-user, booking, review and invite counts');
  assert.deepEqual(result.emptyDemand, [{ term: 'CS 999', searches: 2, users: 1 }, { term: 'PH 999', searches: 1, users: 1 }]);
  pass('empty demand ranks course codes / queries and unique searchers');
  assert.deepEqual(result.rebook, { students: 1, completers: 3, rate: 1 / 3 });
  pass('window rebook rate is 1/3; different tutors do not count as rebooks');
  const all = await service.from('bookings').select('student_id,tutor_id').eq('status', 'completed');
  ok(all.error);
  const pairs = new Map<string, number>();
  for (const b of all.data!) { const key = `${b.student_id}/${b.tutor_id}`; pairs.set(key, (pairs.get(key) ?? 0) + 1); }
  const repeaters = new Set([...pairs].filter(([, count]) => count >= 2).map(([pair]) => pair.split('/')[0]));
  const completers = new Set(all.data!.map((b) => b.student_id));
  assert.deepEqual(result.rebookAllTime, { students: repeaters.size, completers: completers.size, rate: repeaters.size / completers.size });
  pass('all-time rebook rate exactly matches server bookings, including outside-window history');
  const empty = await api.admin.growthFunnel('2200-01-01', '2200-02-01');
  assert.equal(empty.signups, 0); assert.equal(empty.completed, 0); assert.equal(empty.rebook.rate, 0); assert.deepEqual(empty.emptyDemand, []);
  await assert.rejects(api.admin.growthFunnel(until, since));
  pass('empty range has zero rate / empty demand; invalid range rejected');
  const transition = await service.from('bookings').update({ status: 'completed' }).eq('id', pending).select('completed_at').single();
  ok(transition.error); assert.ok(transition.data!.completed_at);
  const updated = await service.from('bookings').update({ updated_at: new Date().toISOString() }).eq('id', pending).select('completed_at').single();
  ok(updated.error); assert.equal(updated.data!.completed_at, transition.data!.completed_at);
  pass('server stamps completion once; later updates preserve its time');
  const setting = await service.from('app_settings').select('value').eq('key', 'require_admin_mfa').single();
  ok(setting.error);
  try {
    ok((await service.from('app_settings').update({ value: true }).eq('key', 'require_admin_mfa')).error);
    await assert.rejects(api.admin.growthFunnel(since, until));
    pass('admin without AAL2 DENIED when MFA is required');
  } finally {
    ok((await service.from('app_settings').update({ value: setting.data!.value }).eq('key', 'require_admin_mfa')).error);
  }
  console.log(`\n${checks} passed, 0 failed`);
} finally {
  if (bookings.length) ok((await service.from('bookings').delete().in('id', bookings)).error);
  for (const id of users) { ok((await service.from('users').delete().eq('id', id)).error); ok((await service.auth.admin.deleteUser(id)).error); }
}
