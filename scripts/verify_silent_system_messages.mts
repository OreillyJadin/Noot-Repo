import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { DEV_PASSWORD } from './_devPassword.mjs';
import { createBookingTutor } from './_booking_test.mts';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const DATABASE_URL = process.env.SUPABASE_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
if (!['127.0.0.1', 'localhost'].includes(new globalThis.URL(URL).hostname) ||
    !['127.0.0.1', 'localhost'].includes(new globalThis.URL(DATABASE_URL).hostname)) {
  throw new Error('verify_silent_system_messages only runs against local Supabase');
}
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const db = createClient(URL, SERVICE, { auth: { persistSession: false } });
const userIds: string[] = [];
let tutor: Awaited<ReturnType<typeof createBookingTutor>> | undefined;
let student: { id: string; client: ReturnType<typeof createClient> } | undefined;
let conversationId: string | undefined;
let bookingId: string | undefined;
let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = '') {
  ok ? passed++ : failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function countNotifications(userId: string, type: string, conversation: string) {
  const { count, error } = await db.from('notifications').select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('type', type).contains('data', { conversationId: conversation });
  if (error) throw error;
  return count ?? 0;
}

async function createStudent() {
  const email = `silent-message-${crypto.randomUUID()}@crimson.ua.edu`;
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: DEV_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('Could not create fixture student');
  const id = data.user.id;
  userIds.push(id);
  await db.from('users').update({
    first_name: 'Silent',
    last_name: 'Student',
    date_of_birth: '2000-01-15',
    status: 'active',
    password_set_at: new Date().toISOString(),
    terms_accepted_at: new Date().toISOString(),
    terms_version: '2026-09-17',
    guidelines_accepted_at: new Date().toISOString(),
    guidelines_version: '2026-10-13',
  }).eq('id', id).throwOnError();
  await db.from('user_roles').upsert({ user_id: id, role: 'student' }, { onConflict: 'user_id,role' }).throwOnError();
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: DEV_PASSWORD });
  if (signInError) throw signInError;
  return { id, client };
}

try {
  tutor = await createBookingTutor(db, 'silent-message-tutor');
  await db.from('users').update({
    first_name: 'Silent',
    last_name: 'Tutor',
    date_of_birth: '2000-01-15',
    status: 'active',
    password_set_at: new Date().toISOString(),
    terms_accepted_at: new Date().toISOString(),
    terms_version: '2026-09-17',
    guidelines_accepted_at: new Date().toISOString(),
    guidelines_version: '2026-10-13',
  }).eq('id', tutor.id).throwOnError();
  student = await createStudent();

  const { data: conversation, error: conversationError } = await db.from('conversations')
    .upsert({ student_id: student.id, tutor_id: tutor.id }, { onConflict: 'student_id,tutor_id' })
    .select('id').single();
  if (conversationError || !conversation) throw conversationError ?? new Error('Could not create fixture conversation');
  conversationId = conversation.id;

  const { data: systemMessage, error: systemMessageError } = await db.from('messages').insert({
    conversation_id: conversationId,
    sender_id: tutor.id,
    content: 'Automated system message for verification',
    is_system: true,
  }).select('id,is_system').single();
  if (systemMessageError) throw systemMessageError;
  check('service-role system message is stored as system', systemMessage.is_system === true);
  check('service-role system message creates no message notification for recipient',
    await countNotifications(student.id, 'message', conversationId) === 0);

  const { data: normalMessage, error: normalMessageError } = await student.client.from('messages').insert({
    conversation_id: conversationId,
    sender_id: student.id,
    content: 'A normal message for verification',
  }).select('id,is_system').single();
  if (normalMessageError) throw normalMessageError;
  check('normal authenticated message is not a system message', normalMessage.is_system === false);
  check('normal authenticated message creates exactly one message notification',
    await countNotifications(tutor.id, 'message', conversationId) === 1);

  const { error: forgedInsertError } = await student.client.from('messages').insert({
    conversation_id: conversationId,
    sender_id: student.id,
    content: 'Forged system message',
    is_system: true,
  });
  check('authenticated system-message insert is rejected with 42501', forgedInsertError?.code === '42501',
    forgedInsertError?.message);

  let updateError = '';
  try {
    execFileSync('psql', [DATABASE_URL, '-X', '-v', 'ON_ERROR_STOP=1'], {
      encoding: 'utf8',
      input: [
        '\\set VERBOSITY verbose',
        'BEGIN;',
        "SELECT set_config('request.jwt.claim.role', 'authenticated', true);",
        `SELECT set_config('request.jwt.claim.sub', '${student.id}', true);`,
        `SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"${student.id}"}', true);`,
        `UPDATE public.messages SET is_system = true WHERE id = '${normalMessage.id}';`,
        'ROLLBACK;',
        '',
      ].join('\n'),
    });
  } catch (error) {
    updateError = String((error as { stderr?: string }).stderr ?? error);
  }
  check('authenticated system-message update is rejected with 42501', updateError.includes('42501'), updateError);

  const { data: booking, error: bookingError } = await db.from('bookings').insert({
    student_id: student.id,
    tutor_id: tutor.id,
    subject: tutor.courseCode,
    scheduled_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    duration_minutes: 60,
    price: 30,
    student_fee: 3,
    platform_fee: 6,
    tutor_payout_amount: 24,
    session_type: 'video',
    location: null,
    status: 'confirmed',
    stripe_payment_intent_id: `sim_silent_${crypto.randomUUID()}`,
    daily_room_name: `noot-${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`,
    cancellation_deadline: new Date(Date.now() - 12 * 60 * 60_000).toISOString(),
  }).select('id,scheduled_at,daily_room_name').single();
  if (bookingError || !booking) throw bookingError ?? new Error('Could not create fixture video booking');
  bookingId = booking.id;

  const { error: publishError } = await db.rpc('publish_video_room', {
    p_booking: booking.id,
    p_scheduled_at: booking.scheduled_at,
    p_room: booking.daily_room_name,
    p_url: `https://noot-sim.daily.co/${booking.daily_room_name}`,
  });
  if (publishError) throw publishError;
  const { data: videoMessage, error: videoMessageError } = await db.from('messages')
    .select('id,is_system').eq('conversation_id', conversationId)
    .ilike('content', `%${booking.daily_room_name.toUpperCase()}%`).single();
  if (videoMessageError) throw videoMessageError;
  check('publish_video_room posts a system chat message', videoMessage.is_system === true);
  const { count: readyCount, error: readyError } = await db.from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', student.id).eq('title', 'Video session ready').contains('data', { bookingId: booking.id });
  if (readyError) throw readyError;
  check('student receives exactly one Video session ready notification', readyCount === 1);
  check('video system message creates no message notification for student',
    await countNotifications(student.id, 'message', conversationId) === 0);
} catch (error) {
  failed++;
  console.error('FAIL verification error', error);
} finally {
  if (bookingId) await db.from('bookings').delete().eq('id', bookingId);
  if (conversationId) await db.from('conversations').delete().eq('id', conversationId);
  for (const id of userIds) await db.auth.admin.deleteUser(id);
  if (tutor) await tutor.cleanup();
}

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
