// verify_booking_chat — a booked session's chat exists from the moment the
// student books, not from the tutor's accept. Creates a real booking through
// confirm-booking and proves the conversation + the student's first message are
// there while the request is still PENDING, that both sides' inbox
// (chats.tsx's data path) sees it, and that it survives the tutor accepting.
//
// Needs: supabase start + supabase functions serve (no Stripe key → sim
// PaymentIntents, which confirm-booking accepts without STRIPE_SECRET_KEY).
// Unlike verify_booking_requests it needs no seed: it makes its own tutor and
// student so it also runs on a stack where seed_demo.mjs hasn't (the demo seed
// password predates the local password-strength rule in supabase/config.toml).
import { DEV_PASSWORD } from './_devPassword.mjs';
import { createClient } from '@supabase/supabase-js';
import { api, auth, initSupabase } from '../packages/core/src/index.ts';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
if (!['127.0.0.1', 'localhost'].includes(new globalThis.URL(URL).hostname)) {
  throw new Error('verify_booking_chat only runs against local Supabase');
}
const ANON =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
// Satisfies config.toml's password_requirements = lower_upper_letters_digits_symbols.
const PASSWORD = DEV_PASSWORD;
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const tag = Date.now();
const studentEmail = `chat-student-${tag}@crimson.ua.edu`;
const tutorEmail = `chat-tutor-${tag}@crimson.ua.edu`;
const loneEmail = `chat-lone-${tag}@crimson.ua.edu`;
const cleanup = { bookings: [] as string[], conversations: [] as string[], users: [] as string[] };
let pass = 0;
let fail = 0;
const step = (name: string, ok: boolean, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const chicagoFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});
const chicagoSlot = (days: number, hour: number) => {
  const partsAt = (date: Date) =>
    Object.fromEntries(chicagoFormatter.formatToParts(date).map((part) => [part.type, part.value]));
  const local = partsAt(new Date(Date.now() + days * 24 * 60 * 60 * 1000));
  const target = Date.UTC(Number(local.year), Number(local.month) - 1, Number(local.day), hour);
  let instant = target;
  for (let i = 0; i < 4; i++) {
    const parts = partsAt(new Date(instant));
    const represented = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    const adjusted = instant + target - represented;
    if (adjusted === instant) break;
    instant = adjusted;
  }
  return new Date(instant).toISOString();
};
const call = async (name: string, body: unknown, token?: string) => {
  const res = await fetch(`${URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, any> };
};
const loginToken = async (email: string) => {
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !data.session) throw error ?? new Error(`No session for ${email}`);
  return data.session.access_token;
};
const makeUser = async (email: string, first: string, last: string) => {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error || !data.user) throw error ?? new Error(`createUser ${email} failed`);
  await admin.from('users').update({
    first_name: first, last_name: last,
    password_set_at: new Date().toISOString(),
    terms_accepted_at: new Date().toISOString(), terms_version: '2026-09-17',
    guidelines_accepted_at: new Date().toISOString(), guidelines_version: '2026-10-13',
  }).eq('id', data.user.id);
  cleanup.users.push(data.user.id);
  return data.user.id;
};

initSupabase({ url: URL, anonKey: ANON });
let stage = 'create users';

try {
  const studentId = await makeUser(studentEmail, 'Chat', 'Student');
  const tutorId = await makeUser(tutorEmail, 'Chat', 'Tutor');

  stage = 'provision tutor';
  const { data: course, error: courseError } = await admin.from('courses').select('course_code').eq('is_active', true).limit(1).single();
  if (courseError || !course) throw courseError ?? new Error('no seeded course catalog — run node supabase/seed_demo.mjs');
  const courseCode = course.course_code as string;
  await admin.from('user_roles').upsert({ user_id: studentId, role: 'student' }, { onConflict: 'user_id,role' });
  await admin.from('user_roles').upsert({ user_id: tutorId, role: 'tutor' }, { onConflict: 'user_id,role' });
  const { error: profileError } = await admin.from('tutor_profiles').upsert({
    user_id: tutorId, bio: 'Verify tutor', subjects: [courseCode], hourly_rate: 40,
    approval_status: 'approved', submitted_at: new Date().toISOString(),
    // Booking refuses tutors that haven't finished payout setup.
    stripe_charges_enabled: true,
  }, { onConflict: 'user_id' });
  if (profileError) throw profileError;
  const { error: tcError } = await admin.from('tutor_courses').insert(
    { tutor_id: tutorId, course_code: courseCode, grade: 'A', hourly_rate: 40, sessions: 0 });
  if (tcError) throw tcError;
  const { error: availabilityError } = await admin.from('tutor_availability').insert(
    Array.from({ length: 7 }, (_, day_of_week) => ({
      tutor_id: tutorId, day_of_week, start_time: '14:00', end_time: '19:00',
    })));
  if (availabilityError) throw availabilityError;

  stage = 'book a session';
  const signIn = await auth.signInWithPassword(studentEmail, PASSWORD);
  if (!signIn.ok) throw new Error(signIn.error);
  const scheduledAt = chicagoSlot(3, 15);
  const pi = await api.createPaymentIntent({ tutorId, courseCode, durationMinutes: 60, scheduledAt });
  const intro = 'Hi! Excited to work together — can we focus on problem sets?';
  const created = await api.bookings.confirm({
    tutorId, courseCode, scheduledAt, durationMinutes: 60, sessionType: 'in_person',
    paymentIntentId: pi.paymentIntentId, message: intro,
  });
  cleanup.bookings.push(created.bookingId);
  if (created.conversationId) cleanup.conversations.push(created.conversationId);

  stage = 'assert pending booking + chat';
  const { data: booking } = await admin.from('bookings')
    .select('status').eq('id', created.bookingId).single();
  step('booking is created already pending', booking?.status === 'pending', `status=${booking?.status}`);
  step('confirm-booking returns a conversation id', !!created.conversationId, created.conversationId);
  const { data: convo } = await admin.from('conversations')
    .select('id,student_id,tutor_id,kind').eq('id', created.conversationId).single();
  step('conversation links student ↔ tutor', convo?.student_id === studentId && convo?.tutor_id === tutorId && convo.kind === 'direct');
  const { data: first } = await admin.from('messages')
    .select('sender_id,content').eq('conversation_id', created.conversationId).order('created_at').limit(1).maybeSingle();
  step("the student's booking note is the first message", first?.sender_id === studentId && first?.content === intro, first?.content);

  stage = 'student inbox sees the pending chat';
  const studentConvos = await api.chat.listConversations();
  const studentConvo = studentConvos.find((c) => c.id === created.conversationId);
  step('student conversation list contains the new chat', !!studentConvo);
  step('student row is marked on the student side', studentConvo?.side === 'student');
  step('student inbox shows the tutor as counterpart + the intro as preview',
    studentConvo?.counterpart.id === tutorId && studentConvo?.lastMessage?.content === intro,
    `${studentConvo?.counterpart.firstName} ${studentConvo?.counterpart.lastName} · "${studentConvo?.lastMessage?.content}"`);
  const studentUpcoming = await api.listUpcoming();
  step('student upcoming shows the booking still pending',
    studentUpcoming.some((b) => b.id === created.bookingId && b.status === 'pending'));
  // The thread is live while pending — the student can keep talking pre-accept.
  const followUp = 'Also, do you have the syllabus PDF?';
  await api.chat.sendMessage(created.conversationId, followUp);
  const { count: msgsAfterFollowUp } = await admin.from('messages')
    .select('id', { count: 'exact', head: true }).eq('conversation_id', created.conversationId);
  step('student can message while the request is pending', msgsAfterFollowUp === 2, `${msgsAfterFollowUp} messages`);

  stage = 'tutor inbox sees the pending chat';
  await auth.signInWithPassword(tutorEmail, PASSWORD);
  const tutorToken = await loginToken(tutorEmail);
  const tutorConvo = await api.chat.getConversationWithStudent(studentId);
  step('tutor opens the conversation before accepting', tutorConvo.id === created.conversationId);
  const tutorConvos = await api.chat.listConversations();
  const tutorRow = tutorConvos.find((c) => c.id === created.conversationId);
  step('tutor conversation list contains the new chat', !!tutorRow && tutorRow.counterpart.id === studentId);
  step('tutor row is marked on the tutor side', tutorRow?.side === 'tutor');
  const names = await api.resolveParticipantNames();
  step('tutor inbox resolves the student name (RLS-safe)',
    names[studentId]?.firstName === 'Chat' && names[studentId]?.lastName === 'Student',
    JSON.stringify(names[studentId]));
  const tutorMsgs = await api.chat.listMessages(created.conversationId);
  step('tutor reads the student intro + follow-up before deciding',
    tutorMsgs.length === 2 && tutorMsgs[0].senderId === studentId && tutorMsgs[0].content === intro && tutorMsgs[1].content === followUp);
  const tutorUpcoming = await api.listUpcoming('tutor');
  step('tutor upcoming shows the booking still pending',
    tutorUpcoming.some((b) => b.id === created.bookingId && b.status === 'pending'));

  stage = 'unbooked chat counterpart resolves';
  // A student can open a conversation without booking (getOrCreateConversation).
  // Booking counterparties alone leave that name unresolved for the tutor —
  // resolve-participants also covers conversation counterparties now.
  const loneId = await makeUser(loneEmail, 'Lone', 'Chatter');
  await auth.signInWithPassword(loneEmail, PASSWORD);
  const loneConvo = await api.chat.getOrCreateConversation(tutorId);
  cleanup.conversations.push(loneConvo.id);
  await api.chat.sendMessage(loneConvo.id, 'Hi — do you tutor this course?');
  await auth.signInWithPassword(tutorEmail, PASSWORD);
  const namesWithLone = await api.resolveParticipantNames();
  step('resolve-participants covers unbooked conversation counterparties',
    namesWithLone[loneId]?.firstName === 'Lone' && namesWithLone[loneId]?.lastName === 'Chatter',
    JSON.stringify(namesWithLone[loneId]));

  stage = 'tutor accepts — chat stays put';
  const accepted = await call('respond-booking-request', { bookingId: created.bookingId, action: 'accept' }, tutorToken);
  const { data: afterAccept } = await admin.from('bookings').select('status').eq('id', created.bookingId).single();
  step('tutor accept confirms the booking', accepted.status === 200 && afterAccept?.status === 'confirmed');
  const stillThere = await api.chat.getConversationWithStudent(studentId);
  const { count: msgsAfterAccept } = await admin.from('messages')
    .select('id', { count: 'exact', head: true }).eq('conversation_id', created.conversationId);
  step('conversation + history survive the accept',
    stillThere.id === created.conversationId && msgsAfterAccept === 3, `${msgsAfterAccept} messages`);
  await auth.signInWithPassword(studentEmail, PASSWORD);
  const studentAfter = await api.chat.listConversations();
  step('student still sees the chat after accept', studentAfter.some((c) => c.id === created.conversationId));
  const confirmedUpcoming = await api.listUpcoming();
  step('booking is confirmed in student upcoming (pending badge lifts)',
    confirmedUpcoming.some((b) => b.id === created.bookingId && b.status === 'confirmed'));
  const { data: acceptMsg } = await admin.from('messages')
    .select('sender_id,content').eq('conversation_id', created.conversationId).eq('sender_id', tutorId).maybeSingle();
  step('accept posts a tutor message into the thread',
    !!acceptMsg && acceptMsg.content.startsWith('Accepted your'), acceptMsg?.content);

  stage = 'message-less booking still gets an intro';
  // A student who skips the note still leaves the tutor an opening message.
  const scheduledAt2 = chicagoSlot(4, 15);
  const pi2 = await api.createPaymentIntent({
    tutorId, courseCode, durationMinutes: 60,
    scheduledAt: scheduledAt2,
  });
  const created2 = await api.bookings.confirm({
    tutorId, courseCode, scheduledAt: scheduledAt2,
    durationMinutes: 60, sessionType: 'in_person', paymentIntentId: pi2.paymentIntentId, message: '',
  });
  cleanup.bookings.push(created2.bookingId);
  const { data: fallbackMsg } = await admin.from('messages')
    .select('sender_id,content').eq('conversation_id', created.conversationId).eq('sender_id', studentId)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  step('a booking with no note still opens with a student message',
    !!fallbackMsg && fallbackMsg.content.startsWith('Hi! I just booked'), fallbackMsg?.content);
} catch (e) {
  console.error(`Verification setup/error at ${stage}:`, e);
  fail++;
} finally {
  for (const bookingId of cleanup.bookings) {
    await admin.from('notifications').delete().contains('data', { bookingId });
  }
  if (cleanup.bookings.length) await admin.from('bookings').delete().in('id', cleanup.bookings);
  if (cleanup.conversations.length) await admin.from('conversations').delete().in('id', cleanup.conversations);
  if (cleanup.users.length > 1) {
    await admin.from('tutor_availability').delete().eq('tutor_id', cleanup.users[1]);
    await admin.from('tutor_courses').delete().eq('tutor_id', cleanup.users[1]);
    await admin.from('tutor_profiles').delete().eq('user_id', cleanup.users[1]);
    await admin.from('user_roles').delete().in('user_id', cleanup.users);
  }
  for (const userId of cleanup.users) await admin.auth.admin.deleteUser(userId);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
