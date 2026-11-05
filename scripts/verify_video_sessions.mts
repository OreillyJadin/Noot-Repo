// Default: DB-only (CI). --functions: local Daily-less and Stripe-less function server.
import { createClient } from '@supabase/supabase-js';
import { DEV_PASSWORD } from './_devPassword.mjs';
import { bookingTime, createBookingTutor } from './_booking_test.mts';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
if (!['127.0.0.1', 'localhost'].includes(new globalThis.URL(URL).hostname)) throw new Error('Local Supabase only');
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const functions = process.argv.includes('--functions');
const db = createClient(URL, SERVICE, { auth: { persistSession: false } });
const userIds: string[] = [];
const bookingIds: string[] = [];
let tutor: Awaited<ReturnType<typeof createBookingTutor>> | undefined;
let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  ok ? passed++ : failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}
async function call(name: string, token: string, body: unknown = {}) {
  const response = await fetch(`${URL}/functions/v1/${name}`, { method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() as Record<string, any> };
}
async function login(email: string) {
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: DEV_PASSWORD });
  if (error || !data.session) throw error ?? new Error('No session');
  return { client, token: data.session.access_token, id: data.user!.id };
}
async function student(label: string) {
  const email = `video-${label}-${crypto.randomUUID()}@crimson.ua.edu`;
  const { data, error } = await db.auth.admin.createUser({ email, password: DEV_PASSWORD, email_confirm: true });
  if (error || !data.user) throw error ?? new Error('No user');
  userIds.push(data.user.id);
  await db.from('users').update({ first_name: label, date_of_birth: '2000-01-15', status: 'active',
    password_set_at: new Date().toISOString() }).eq('id', data.user.id).throwOnError();
  return login(email);
}
const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
async function load(id: string) {
  const { data } = await db.from('bookings').select('*').eq('id', id).single().throwOnError();
  return data!;
}
async function change(id: string, patch: Record<string, unknown>) {
  await db.from('bookings').update(patch).eq('id', id).throwOnError();
}
async function cancel(id: string) { await change(id, { status: 'cancelled' }); }

try {
  tutor = await createBookingTutor(db, 'video-tutor');
  const s = await student('Student');
  const other = await student('Other');
  const t = await login(tutor.email);
  async function fixture(patch: Record<string, unknown> = {}) {
    const at = hoursFromNow(0.75);
    const { data } = await db.from('bookings').insert({ student_id: s.id, tutor_id: tutor!.id,
      subject: tutor!.courseCode, scheduled_at: at, duration_minutes: 60, price: 30, student_fee: 3,
      platform_fee: 6, tutor_payout_amount: 24, session_type: 'video', location: null, status: 'confirmed',
      stripe_payment_intent_id: `sim_video_${crypto.randomUUID()}`,
      daily_room_name: `noot-${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`,
      cancellation_deadline: hoursFromNow(-12), ...patch }).select('id').single().throwOnError();
    bookingIds.push(data!.id);
    return data!.id as string;
  }
  async function publish(id: string) {
    const b = await load(id);
    return db.rpc('publish_video_room', { p_booking: id, p_scheduled_at: b.scheduled_at,
      p_room: b.daily_room_name, p_url: `https://noot-sim.daily.co/${b.daily_room_name}` }).throwOnError();
  }
  async function worker() {
    const result = await call('video-rooms', SERVICE);
    if (result.status !== 200 || result.body.failed !== 0) throw new Error(`Worker failed: ${JSON.stringify(result)}`);
    return result;
  }
  const run = async (id: string) => functions ? worker() : publish(id);

  if (functions) {
    const scheduledAt = bookingTime(24);
    const result = await call('confirm-booking', s.token, { tutorId: tutor.id, courseCode: tutor.courseCode,
      scheduledAt, durationMinutes: 60, sessionType: 'video', meetingLink: 'https://attacker.example/?t=secret' });
    check('virtual booking without location succeeds', result.status === 200, JSON.stringify(result.body));
    if (!result.body.bookingId) throw new Error('No booking created');
    bookingIds.push(result.body.bookingId);
    const b = await load(result.body.bookingId);
    check('client meetingLink ignored and video location is null', b.meeting_link === null && b.location === null && b.session_type === 'video');
    await cancel(b.id);
    const inPerson = await call('confirm-booking', s.token, { tutorId: tutor.id, courseCode: tutor.courseCode,
      scheduledAt, durationMinutes: 60, sessionType: 'in_person', location: 'Gorgas Library', meetingLink: 'https://attacker.example' });
    check('in-person booking still works', inPerson.status === 200);
    if (!inPerson.body.bookingId) throw new Error('No in-person booking');
    bookingIds.push(inPerson.body.bookingId);
    check('client meetingLink ignored for in-person too', (await load(inPerson.body.bookingId)).meeting_link === null);
    await cancel(inPerson.body.bookingId);
    check('student cannot invoke worker', (await call('video-rooms', s.token)).status === 401);
    check('tutor cannot invoke worker', (await call('video-rooms', t.token)).status === 401);
  }

  for (const [label, patch] of [
    ['more than 1h before', { scheduled_at: hoursFromNow(2) }],
    ['pending request', { status: 'pending', accept_by: hoursFromNow(0.5) }],
    ['unpaid booking', { stripe_payment_intent_id: null }],
    ['ended session', { scheduled_at: hoursFromNow(-2) }],
  ] as const) {
    const id = await fixture(patch);
    await run(id);
    check(`${label} gets no video link`, (await load(id)).video_link_sent_at === null);
    await cancel(id);
  }

  const id = await fixture({ daily_room_name: functions ? null : `noot-${crypto.randomUUID().slice(0, 8)}` });
  if (functions) await worker(); else await Promise.all([publish(id), publish(id)]);
  let b = await load(id);
  check('accepted, paid video session publishes inside T−1h', !!b.daily_room_name && !!b.video_link_sent_at && !!b.meeting_link);
  check('stored room URL has no token', b.meeting_link.startsWith('https://noot-sim.daily.co/noot-') && !b.meeting_link.includes('?'));
  const messages = async () => {
    const { data } = await db.from('messages').select('sender_id,content').ilike('content', `%${b.daily_room_name.toUpperCase()}%`).throwOnError();
    return data!;
  };
  let posted = await messages();
  check('exactly one chat message posted as tutor', posted.length === 1 && posted[0].sender_id === tutor.id);
  check('chat contains code and join instructions, never URL/token', posted.length === 1 && posted[0].content.includes('Join video session') && !/https?:|\?t=|token/i.test(posted[0].content));
  const { data: notifications } = await db.from('notifications').select('user_id').eq('title', 'Video session ready').contains('data', { bookingId: id }).throwOnError();
  check('both participants receive booking notifications', notifications!.length === 2 && notifications!.some((n) => n.user_id === s.id) && notifications!.some((n) => n.user_id === tutor!.id));
  if (functions) await Promise.all([worker(), worker()]); else await publish(id);
  check('repeated/concurrent workers never double-post', (await messages()).length === 1);

  for (const [label, client] of [['student', s.client], ['tutor', t.client], ['non-owner', other.client]] as const) {
    for (const [column, value] of Object.entries({ daily_room_name: 'noot-badwrite', meeting_link: 'https://attacker.example',
      video_link_sent_at: null, daily_room_deleted_at: new Date().toISOString() })) {
      await client.from('bookings').update({ [column]: value }).eq('id', id);
      check(`${label} cannot write ${column}`, (await load(id))[column] === b[column]);
    }
    const { error } = await client.rpc('publish_video_room', { p_booking: id, p_scheduled_at: b.scheduled_at,
      p_room: b.daily_room_name, p_url: 'https://attacker.example' });
    check(`${label} cannot execute publication RPC`, !!error);
  }
  const { data: leaked } = await other.client.from('bookings').select('meeting_link,daily_room_name').eq('id', id);
  check('non-participant cannot read room metadata', !leaked?.length);

  if (functions) {
    check('non-participant join returns 403', (await call('join-video-session', other.token, { bookingId: id })).status === 403);
    for (const [label, token] of [['student', s.token], ['tutor', t.token]]) {
      const join = await call('join-video-session', token, { bookingId: id });
      check(`${label} can join with a simulated participant token`, join.status === 200 && join.body.url === `${b.meeting_link}?t=sim`);
    }
    const computerJoin = await call('join-video-session', s.token, { bookingId: id, device: 'computer' });
    check('computer join creates a simulated participant token', computerJoin.status === 200 && computerJoin.body.url === `${b.meeting_link}?t=sim`);
    const unsupportedDevice = await call('join-video-session', s.token, { bookingId: id, device: 'tablet' });
    check('unsupported join device is rejected', unsupportedDevice.status === 400);
    await db.from('users').update({ status: 'suspended' }).eq('id', s.id).throwOnError();
    check('inactive participant cannot join', (await call('join-video-session', s.token, { bookingId: id })).status === 403);
    await db.from('users').update({ status: 'active' }).eq('id', s.id).throwOnError();
  }
  const name = b.daily_room_name;
  if (functions) {
    const proposal = await call('reschedule-booking', t.token, { bookingId: id, action: 'propose', newScheduledAt: hoursFromNow(0.5) });
    check('tutor can propose a virtual reschedule', proposal.status === 200);
    const accepted = await call('reschedule-booking', s.token, { bookingId: id, action: 'accept' });
    const moved = await load(id);
    check('accepted reschedule preserves video type and resets publication', accepted.status === 200 && moved.session_type === 'video' && moved.video_link_sent_at === null && moved.daily_room_name === name, JSON.stringify(accepted));
  }
  await change(id, { scheduled_at: hoursFromNow(24) });
  b = await load(id);
  check('reschedule clears publication but retains session type and room', b.video_link_sent_at === null && b.daily_room_name === name && b.session_type === 'video');
  if (functions) check('join before opening returns 409', (await call('join-video-session', s.token, { bookingId: id })).status === 409);
  await change(id, { scheduled_at: hoursFromNow(0.5) });
  await run(id);
  b = await load(id);
  check('rescheduled room is reused and link re-published', b.daily_room_name === name && !!b.video_link_sent_at && (await messages()).length === 2);
  if (functions) {
    await change(id, { scheduled_at: hoursFromNow(-2), video_link_sent_at: new Date().toISOString() });
    // The trigger cleared readiness; restore it separately to test the time guard itself.
    await change(id, { video_link_sent_at: new Date().toISOString() });
    check('join after expiry returns 409 even with readiness set', (await call('join-video-session', s.token, { bookingId: id })).status === 409);
  }
  if (functions) {
    await change(id, { scheduled_at: hoursFromNow(0.5) });
    check('tutor can cancel virtual session', (await call('cancel-booking', t.token, { bookingId: id })).status === 200);
  } else await cancel(id);
  if (functions) {
    await worker();
    check('cancellation deletes room', !!(await load(id)).daily_room_deleted_at);
    check('cancelled session cannot join', (await call('join-video-session', s.token, { bookingId: id })).status === 409);
  }

  const free = await fixture({ stripe_payment_intent_id: null, price: 0, student_fee: 0, platform_fee: 0, tutor_payout_amount: 0 });
  await run(free);
  check('server-priced admin-free booking needs no PaymentIntent', !!(await load(free)).video_link_sent_at);
  await cancel(free);
  const blocked = await fixture();
  await db.from('user_blocks').insert({ blocker_id: s.id, blocked_id: tutor.id }).throwOnError();
  await run(blocked);
  const blockedRoom = (await load(blocked)).daily_room_name;
  const { count } = await db.from('messages').select('id', { count: 'exact', head: true }).ilike('content', `%${blockedRoom.toUpperCase()}%`).throwOnError();
  check('blocked pair gets no automated chat message', count === 0);
  await db.from('user_blocks').delete().eq('blocker_id', s.id).eq('blocked_id', tutor.id).throwOnError();
  await cancel(blocked);
  if (functions) await worker();
} catch (error) {
  failed++;
  console.error('FAIL verification error', error);
} finally {
  if (bookingIds.length) await db.from('bookings').delete().in('id', bookingIds);
  for (const id of userIds) await db.auth.admin.deleteUser(id);
  if (tutor) await tutor.cleanup();
}
console.log(`${passed} passed, ${failed} failed (${functions ? 'simulated functions' : 'database/CI'})`);
if (failed) process.exitCode = 1;
