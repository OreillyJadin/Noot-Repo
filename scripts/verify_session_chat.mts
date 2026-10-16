// Session ↔ chat contract: booking creates the session AND its chat immediately,
// pending the tutor's response — and accepting lands the tutor's message in the
// same thread. Covers the flow behind the Chats tab.
//
// Asserts, against the local stack (Edge Functions required):
//   - confirm-booking leaves a pending booking + a conversation + an opening
//     message FROM the student (the tutor's "initial received message")
//   - both sides' chat lists (listConversations) already show it, with the tutor
//     seeing the student's name (resolve-participants, not the RLS-blocked users read)
//   - a booking with no message still gets an opening message (fallback intro)
//   - tutor accept → confirmed + an "Accepted …" tutor message in the thread,
//     which becomes the student's latest chat entry
//
// Needs `supabase start` + `supabase functions serve` + `node supabase/seed_demo.mjs`.
//   pnpm dlx tsx scripts/verify_session_chat.mts
import { createClient } from '@supabase/supabase-js';
import { api, auth, initSupabase } from '../packages/core/src/index.ts';
import { authorizeHold, cancelHold } from './_stripe_test.mts';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
if (!['127.0.0.1', 'localhost'].includes(new globalThis.URL(URL).hostname)) {
  throw new Error('verify_session_chat only runs against local Supabase');
}
const ANON =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const PASSWORD = 'NootVerify!39_Chat';
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const emailTag = Date.now();
const studentEmail = `chat-student-${emailTag}@crimson.ua.edu`;
const bookings: string[] = [];
const intents: string[] = [];
let pass = 0;
let fail = 0;
const step = (name: string, ok: boolean, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();
const call = async (name: string, body: unknown, token?: string) => {
  const response = await fetch(`${URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) as Record<string, any> };
};
const login = async (email: string, password = PASSWORD) => {
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw error ?? new Error(`No session for ${email}`);
  return data.session.access_token;
};

initSupabase({ url: URL, anonKey: ANON });
let studentId = '';
let tutorId = '';
let tutorToken = '';
let conversationId = '';
let stage = 'load seeded tutor';

try {
  const { data: tutor, error: tutorError } = await admin.from('users').select('id,email').eq('email', 'sara@crimson.ua.edu').single();
  if (tutorError || !tutor) throw tutorError ?? new Error('Run node supabase/seed_demo.mjs first');
  tutorId = tutor.id as string;
  stage = 'enable tutor charges';
  await admin.from('tutor_profiles').update({ stripe_charges_enabled: true }).eq('user_id', tutorId);
  stage = 'load tutor course';
  const { data: course, error: courseError } = await admin.from('tutor_courses').select('course_code').eq('tutor_id', tutorId).limit(1).single();
  if (courseError || !course) throw courseError ?? new Error('Seeded tutor has no course');
  const courseCode = course.course_code as string;

  stage = 'create verification student';
  const created = await admin.auth.admin.createUser({
    email: studentEmail, password: PASSWORD, email_confirm: true,
    user_metadata: { first_name: 'Chatty', last_name: 'Student' },
  });
  if (created.error || !created.data.user) throw created.error ?? new Error('Could not create verification student');
  studentId = created.data.user.id;
  tutorToken = await login(tutor.email as string, 'password123');
  stage = 'sign in core student client';
  const studentSignIn = await auth.signInWithPassword(studentEmail, PASSWORD);
  if (!studentSignIn.ok) throw new Error(studentSignIn.error);

  // ── 1. Booking creates the pending session + the chat ────────────────────────
  stage = 'book a session with an intro message';
  const scheduledAt = hoursFromNow(72);
  const pi = await api.createPaymentIntent({ tutorId, courseCode, durationMinutes: 60, scheduledAt });
  intents.push(pi.paymentIntentId);
  if (pi.paymentIntentId.startsWith('pi_')) await authorizeHold(pi.paymentIntentId);
  const intro = 'Hi Sara! Excited to work through this with you.';
  const createdBooking = await api.bookings.confirm({
    tutorId, courseCode, scheduledAt, durationMinutes: 60, sessionType: 'in_person',
    paymentIntentId: pi.paymentIntentId, message: intro,
  });
  const bookingId = createdBooking.bookingId;
  conversationId = createdBooking.conversationId;
  bookings.push(bookingId);
  step('confirm-booking returns the booking and its conversation', !!bookingId && !!conversationId);

  const { data: pendingRow } = await admin.from('bookings').select('status').eq('id', bookingId).single();
  step('the session exists and starts pending', pendingRow?.status === 'pending');

  const { data: convo } = await admin.from('conversations')
    .select('id').eq('id', conversationId).eq('student_id', studentId).eq('tutor_id', tutorId).maybeSingle();
  step('a conversation between the pair exists', !!convo);

  const { data: firstMessages } = await admin.from('messages')
    .select('sender_id, content').eq('conversation_id', conversationId).order('created_at');
  step("the student's opening message is in the thread", firstMessages?.length === 1 &&
    firstMessages[0].sender_id === studentId && firstMessages[0].content === intro);

  // ── 2. Both sides see it in their chat lists while it's still pending ────────
  stage = 'chat lists while pending';
  const studentConvos = await api.chat.listConversations();
  const studentRow = studentConvos.find((c) => c.id === conversationId);
  step("student's chat list shows the pending thread", !!studentRow && studentRow.side === 'student' &&
    studentRow.lastMessage?.content === intro, studentRow?.counterpart.firstName);

  await auth.signInWithPassword(tutor.email as string, 'password123');
  const tutorConvos = await api.chat.listConversations();
  const tutorRow = tutorConvos.find((c) => c.id === conversationId);
  step("tutor's chat list shows the pending thread", !!tutorRow && tutorRow.side === 'tutor');
  step("tutor sees the student's name (resolve-participants, not the RLS-blocked read)",
    tutorRow?.counterpart.firstName === 'Chatty', tutorRow?.counterpart.firstName);
  const tutorThread = await api.chat.listMessages(conversationId);
  step('tutor reads the opening message as received from the student',
    tutorThread.some((m) => m.senderId === studentId && m.content === intro));
  await auth.signInWithPassword(studentEmail, PASSWORD);

  // ── 3. A message-less booking still opens the thread with a fallback intro ───
  stage = 'book without a message';
  const quietAt = hoursFromNow(96);
  const quietPi = await api.createPaymentIntent({ tutorId, courseCode, durationMinutes: 60, scheduledAt: quietAt });
  intents.push(quietPi.paymentIntentId);
  if (quietPi.paymentIntentId.startsWith('pi_')) await authorizeHold(quietPi.paymentIntentId);
  const quietBooking = await api.bookings.confirm({
    tutorId, courseCode, scheduledAt: quietAt, durationMinutes: 60, sessionType: 'in_person',
    paymentIntentId: quietPi.paymentIntentId,
  });
  bookings.push(quietBooking.bookingId);
  const { data: quietConvo } = await admin.from('conversations')
    .select('id').eq('id', quietBooking.conversationId).maybeSingle();
  const { data: quietMsgs } = await admin.from('messages')
    .select('sender_id, content').eq('conversation_id', quietBooking.conversationId)
    .order('created_at', { ascending: false }).limit(1);
  step('a message-less booking still posts an opening message from the student',
    !!quietConvo && quietMsgs?.[0]?.sender_id === studentId && quietMsgs[0].content.length > 0,
    quietMsgs?.[0]?.content?.slice(0, 60));

  // ── 4. Accept → confirmed session + the tutor's message lands in the thread ──
  stage = 'tutor accepts';
  const accepted = await call('respond-booking-request', { bookingId, action: 'accept' }, tutorToken);
  const { data: acceptedRow } = await admin.from('bookings').select('status, accepted_at').eq('id', bookingId).single();
  step('tutor accepts and the session is confirmed', accepted.status === 200 &&
    acceptedRow?.status === 'confirmed' && !!acceptedRow.accepted_at);

  const { data: afterAccept } = await admin.from('messages')
    .select('id, sender_id, content').eq('conversation_id', conversationId).order('created_at');
  const acceptMsg = afterAccept?.find((m) => m.sender_id === tutorId && /accepted/i.test(m.content));
  step('acceptance posts a tutor message into the thread', !!acceptMsg, acceptMsg?.content?.slice(0, 70));

  const studentConvosAfter = await api.chat.listConversations();
  const studentRowAfter = studentConvosAfter.find((c) => c.id === conversationId);
  step("student's chat list now leads with the tutor's acceptance",
    studentRowAfter?.lastMessage?.senderId === tutorId && studentRowAfter.lastMessage.id === acceptMsg?.id);

  const { data: confirmNotif } = await admin.from('notifications')
    .select('id').eq('user_id', studentId).eq('title', 'Session confirmed').contains('data', { bookingId }).maybeSingle();
  const { data: msgNotif } = await admin.from('notifications')
    .select('id').eq('user_id', studentId).eq('type', 'message').contains('data', { conversationId }).maybeSingle();
  step('student is notified of the confirmation and the new message', !!confirmNotif && !!msgNotif);
} catch (e) {
  console.error(`Verification setup/error at ${stage}:`, e);
  fail++;
} finally {
  for (const bookingId of bookings) {
    await admin.from('notifications').delete().contains('data', { bookingId });
  }
  if (bookings.length) await admin.from('bookings').delete().in('id', bookings);
  if (conversationId) {
    await admin.from('notifications').delete().contains('data', { conversationId });
    await admin.from('messages').delete().eq('conversation_id', conversationId);
    await admin.from('conversations').delete().eq('id', conversationId);
  }
  for (const intent of intents) if (intent.startsWith('pi_')) await cancelHold(intent).catch(() => {});
  const { data } = await admin.from('users').select('id').eq('email', studentEmail).maybeSingle();
  if (data?.id) await admin.auth.admin.deleteUser(data.id);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
