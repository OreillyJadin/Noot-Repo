import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { api, initSupabase } from '../packages/core/src/index.ts';
import { DEV_PASSWORD } from './_devPassword.mjs';

const URL = 'http://127.0.0.1:54321';
const LOCAL_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });
const student = initSupabase({ url: URL, anonKey: LOCAL_ANON });
const users: string[] = [];
const bookings: string[] = [];
const tag = Date.now();
let checks = 0;
const pass = (label: string) => { checks++; console.log(`✅ ${label}`); };
function ok(error: unknown) { if (error) throw error; }
async function makeUser(name: string, tutor = false) {
  const email = `book-again-${tag}-${name}@crimson.ua.edu`;
  const result = await svc.auth.admin.createUser({ email, password: DEV_PASSWORD, email_confirm: true });
  ok(result.error); const id = result.data.user!.id; users.push(id);
  if (tutor) {
    ok((await svc.from('user_roles').upsert({ user_id: id, role: 'tutor' })).error);
    ok((await svc.from('tutor_profiles').upsert({ user_id: id, approval_status: 'approved', hourly_rate: 30, bio: 'Tutor' })).error);
    ok((await svc.from('tutor_courses').insert({ tutor_id: id, course_code: 'MGT 300', grade: 'A', hourly_rate: 30 })).error);
  }
  return { id, email };
}
async function makeBooking(s: string, t: string, hoursAgo: number, status = 'completed', course = 'MGT 300', duration = 60) {
  const at = Date.now() - hoursAgo * 3_600_000;
  const result = await svc.from('bookings').insert({ student_id: s, tutor_id: t, subject: course,
    scheduled_at: new Date(at).toISOString(), duration_minutes: duration, status, price: 30,
    platform_fee: 6, tutor_payout_amount: 24, session_type: 'in_person', cancellation_deadline: new Date(at - 86_400_000).toISOString(),
  }).select('id').single();
  ok(result.error); bookings.push(result.data!.id); return result.data!.id as string;
}
async function login(email: string) { ok((await student.auth.signInWithPassword({ email, password: DEV_PASSWORD })).error); }
try {
  const s = await makeUser('student');
  const other = await makeUser('other');
  const recent = await makeUser('recent', true);
  const older = await makeUser('older', true);
  const foreign = await makeUser('foreign', true);
  const outgoing = await makeUser('outgoing', true);
  const incoming = await makeUser('incoming', true);
  const deleted = await makeUser('deleted', true);
  const departed = await makeUser('departed', true);
  const pending = await makeUser('pending', true);
  const inactive = await makeUser('inactive', true);
  await login(s.email);
  assert.deepEqual(await api.tutors.listYourTutors(), []);
  pass('no completed sessions returns an empty list');
  await makeBooking(s.id, recent.id, 240);
  const last = await makeBooking(s.id, recent.id, 24, 'completed', 'MATH 125', 90);
  await makeBooking(s.id, older.id, 48);
  await makeBooking(s.id, foreign.id, 12, 'confirmed');
  await makeBooking(s.id, foreign.id, 13, 'no_show');
  await makeBooking(s.id, foreign.id, 14, 'cancelled');
  await makeBooking(other.id, foreign.id, 8);
  await makeBooking(other.id, s.id, 7);
  for (const tutor of [outgoing, incoming, deleted, departed, pending, inactive]) await makeBooking(s.id, tutor.id, 72);
  ok((await svc.from('user_blocks').insert([
    { blocker_id: s.id, blocked_id: outgoing.id }, { blocker_id: incoming.id, blocked_id: s.id },
  ])).error);
  ok((await svc.from('users').update({ deleted_at: new Date().toISOString() }).eq('id', deleted.id)).error);
  ok((await svc.from('user_roles').delete().eq('user_id', departed.id).eq('role', 'tutor')).error);
  ok((await svc.from('tutor_profiles').update({ approval_status: 'pending' }).eq('user_id', pending.id)).error);
  ok((await svc.from('users').update({ status: 'suspended' }).eq('id', inactive.id)).error);
  const list = await api.tutors.listYourTutors();
  assert.deepEqual(list.map((item) => item.tutor.userId), [recent.id, older.id]);
  assert.equal(list[0].lastBooking.id, last);
  assert.equal(list[0].lastBooking.subject, 'MATH 125');
  assert.equal(list[0].lastBooking.durationMinutes, 90);
  pass('own completed sessions deduplicate tutors, newest first, preserving last course and duration');
  assert.ok(!list.some((item) => item.tutor.userId === foreign.id));
  pass('another student’s completed sessions, tutor-side sessions and non-completed statuses never appear');
  for (const tutor of [outgoing, incoming, deleted, departed, pending, inactive]) {
    assert.equal(await api.tutors.getForBooking(tutor.id), null);
  }
  pass('both block directions, deleted, departed, pending and inactive tutors are excluded on list and tap');
  const eligible = await student.rpc('rebookable_tutor_ids', { p_tutor_ids: [recent.id, outgoing.id, incoming.id, departed.id, s.id] });
  ok(eligible.error); assert.deepEqual(eligible.data, [{ tutor_id: recent.id }]);
  pass('plain student JWT gets only eligible public ids from the narrow RPC');
  await login(other.email);
  assert.deepEqual((await api.tutors.listYourTutors()).map((item) => item.tutor.userId), [foreign.id]);
  pass('second student sees only their own completed-session tutor');
  await login(s.email);
  ok((await svc.from('user_blocks').insert({ blocker_id: recent.id, blocked_id: s.id })).error);
  assert.equal(await api.tutors.getForBooking(recent.id), null);
  assert.deepEqual((await api.tutors.listYourTutors()).map((item) => item.tutor.userId), [older.id]);
  pass('a new inbound block removes a previously listed tutor and prevents stale-card rebooking');
  assert.equal(await api.tutors.getForBooking('00000000-0000-0000-0000-000000000000'), null);
  await assert.rejects(api.tutors.getForBooking('invalid-id'));
  pass('missing tutor returns null and lookup errors propagate instead of starting a stale booking');
  const anon = createClient(URL, LOCAL_ANON, { auth: { persistSession: false } });
  assert.ok((await anon.rpc('rebookable_tutor_ids', { p_tutor_ids: [recent.id] })).error);
  ok((await student.auth.signOut()).error);
  await assert.rejects(api.tutors.listYourTutors());
  pass('anonymous callers cannot use the RPC or Your Tutors API');
  const source = (path: string) => readFileSync(path, 'utf8');
  const home = source('apps/mobile/app/home.tsx');
  assert.match(home, /api\.tutors\.listYourTutors\(\)/);
  assert.match(home, /yourTutors\.length > 0/);
  assert.match(home, /lastBooking\.subject[\s\S]*formatCampusDate\(lastBooking\.scheduledAt/);
  assert.match(home, /<BookAgainButton tutorId=\{tutor\.userId\}/);
  const sessions = source('apps/mobile/app/sessions.tsx');
  assert.match(sessions, /b\.status === 'completed' \? \([\s\S]*?<BookAgainButton tutorId=\{b\.tutorId\} course=\{b\.subject\} durationMinutes=\{b\.durationMinutes\}/);
  const c4 = source('apps/mobile/app/c4.tsx');
  assert.match(c4, /!isTutor && tutor && booking\.bookingId && booking\.status === 'completed'/);
  assert.match(c4, /label=\{`Book again with \$\{tutorFirst\}`\}/);
  const button = source('apps/mobile/lib/BookAgainButton.tsx');
  assert.match(button, /await api\.tutors\.getForBooking\(tutorId\)/);
  assert.match(button, /setBooking\(plan\.draft\)/);
  assert.match(button, /api\.analytics\.track\('booking_started', \{ tutorId, courseCode: course, source: 'book_again' \}\)/);
  assert.match(button, /router\.push\(plan\.route\)/);
  assert.match(button, /catch \(error\)[\s\S]*Alert\.alert/);
  pass('Home, completed Past and student feedback CTA share fresh-draft navigation, error handling and booking_started analytics');
  console.log(`\n${checks} passed, 0 failed`);
} finally {
  if (bookings.length) ok((await svc.from('bookings').delete().in('id', bookings)).error);
  for (const id of users) { ok((await svc.from('users').delete().eq('id', id)).error); ok((await svc.auth.admin.deleteUser(id)).error); }
}
