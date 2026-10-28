// Booking-process contract: requests stay chat-free until acceptance; the student's
// request note becomes the first chat message only when the tutor accepts.
//
// Needs: supabase start + supabase functions serve + node supabase/seed_demo.mjs.
// Run with `pnpm dlx tsx scripts/verify_session_chat.mts`.
import { DEV_PASSWORD } from './_devPassword.mjs';
import { createClient } from '@supabase/supabase-js';
import { api, auth, initSupabase } from '../packages/core/src/index.ts';
import { authorizeHold, cancelHold, getPaymentIntent } from './_stripe_test.mts';

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
const PASSWORD = DEV_PASSWORD;
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const emailTag = Date.now();
const studentEmail = `booking-flow-student-${emailTag}@crimson.ua.edu`;
const bookings: string[] = [];
const intents: string[] = [];
let studentId = '';
let tutorId = '';
let conversationId = '';
let tutorChargesEnabled: boolean | null = null;
let pass = 0;
let fail = 0;
let stage = 'load seeded tutor';

const step = (name: string, ok: boolean, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};
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
const login = async (email: string) => {
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !data.session) throw error ?? new Error(`No session for ${email}`);
  return { client, token: data.session.access_token };
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
const chicagoSlot = (days: number, hour: number, minute = 0) => {
  const partsAt = (date: Date) =>
    Object.fromEntries(chicagoFormatter.formatToParts(date).map((part) => [part.type, part.value]));
  const local = partsAt(new Date());
  const date = new Date(Date.UTC(
    Number(local.year),
    Number(local.month) - 1,
    Number(local.day) + days,
  ));
  const target = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour, minute);
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
const chicagoWeekday = (days: number) => {
  const local = Object.fromEntries(chicagoFormatter.formatToParts(new Date())
    .map((part) => [part.type, part.value]));
  return new Date(Date.UTC(
    Number(local.year),
    Number(local.month) - 1,
    Number(local.day) + days,
  )).getUTCDay();
};

initSupabase({ url: URL, anonKey: ANON });

try {
  const { data: tutor, error: tutorError } = await admin
    .from('users').select('id,email').eq('email', 'sara@crimson.ua.edu').single();
  if (tutorError || !tutor) throw tutorError ?? new Error('Run node supabase/seed_demo.mjs first');
  tutorId = tutor.id as string;
  const { data: profile } = await admin.from('tutor_profiles')
    .select('stripe_charges_enabled').eq('user_id', tutorId).single();
  tutorChargesEnabled = profile?.stripe_charges_enabled ?? false;
  await admin.from('tutor_profiles').update({ stripe_charges_enabled: true }).eq('user_id', tutorId);
  const { data: course, error: courseError } = await admin
    .from('tutor_courses').select('course_code').eq('tutor_id', tutorId).limit(1).single();
  if (courseError || !course) throw courseError ?? new Error('Seeded tutor has no course');
  const courseCode = course.course_code as string;
  const { data: existingBookings, error: existingBookingsError } = await admin.from('bookings')
    .select('scheduled_at,duration_minutes')
    .eq('tutor_id', tutorId)
    .in('status', ['pending', 'confirmed']);
  if (existingBookingsError) throw existingBookingsError;
  const { data: availability, error: availabilityError } = await admin.from('tutor_availability')
    .select('day_of_week,start_time,end_time').eq('tutor_id', tutorId);
  if (availabilityError) throw availabilityError;
  const toMinutes = (time: string) => {
    const [hour, minute] = time.slice(0, 5).split(':').map(Number);
    return hour * 60 + minute;
  };
  const slots: string[] = [];
  for (let dayOffset = 1; dayOffset <= 6 && slots.length < 4; dayOffset++) {
    const weekday = chicagoWeekday(dayOffset);
    for (const window of availability ?? []) {
      if (Number(window.day_of_week) !== weekday) continue;
      const windowStart = toMinutes(window.start_time as string);
      const windowEnd = toMinutes(window.end_time as string);
      for (let localStart = windowStart; localStart + 60 <= windowEnd; localStart += 60) {
        const candidate = chicagoSlot(dayOffset, Math.floor(localStart / 60), localStart % 60);
        const start = new Date(candidate).getTime();
        const end = start + 60 * 60_000;
        const overlaps = (existingBookings ?? []).some((booking) => {
          const bookingStart = new Date(booking.scheduled_at as string).getTime();
          const bookingEnd = bookingStart + Number(booking.duration_minutes) * 60_000;
          return bookingStart < end && start < bookingEnd;
        });
        if (start > Date.now() + 2 * 60 * 60_000 && start < Date.now() + 6 * 86_400_000 && !overlaps) {
          slots.push(candidate);
          if (slots.length === 4) break;
        }
      }
      if (slots.length === 4) break;
    }
  }
  if (slots.length < 4) throw new Error('Could not find four free seeded-tutor slots in the booking horizon');

  stage = 'create verification student';
  const created = await admin.auth.admin.createUser({
    email: studentEmail,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: 'Booking Flow', last_name: 'Student' },
  });
  if (created.error || !created.data.user) throw created.error ?? new Error('Could not create verification student');
  studentId = created.data.user.id;
  const { error: userError } = await admin.from('users').update({
    first_name: 'Booking Flow',
    last_name: 'Student',
    date_of_birth: '2000-01-15',
    status: 'active',
    password_set_at: new Date().toISOString(),
    terms_accepted_at: new Date().toISOString(),
    terms_version: '2026-09-17',
    guidelines_accepted_at: new Date().toISOString(),
    guidelines_version: '2026-10-13',
  }).eq('id', studentId);
  if (userError) throw userError;
  const { error: roleError } = await admin.from('user_roles')
    .upsert({ user_id: studentId, role: 'student' }, { onConflict: 'user_id,role' });
  if (roleError) throw roleError;

  const { token: studentToken, client: studentClient } = await login(studentEmail);
  const { token: tutorToken } = await login(tutor.email as string);
  const studentSignIn = await auth.signInWithPassword(studentEmail, PASSWORD);
  if (!studentSignIn.ok) throw new Error(studentSignIn.error);

  const createPendingBooking = async (scheduledAt: string, message?: string) => {
    const intent = await api.createPaymentIntent({ tutorId, courseCode, durationMinutes: 60, scheduledAt });
    intents.push(intent.paymentIntentId);
    if (intent.paymentIntentId.startsWith('pi_')) await authorizeHold(intent.paymentIntentId);
    const result = await api.bookings.confirm({
      tutorId,
      courseCode,
      scheduledAt,
      durationMinutes: 60,
      sessionType: 'in_person',
      paymentIntentId: intent.paymentIntentId,
      ...(message === undefined ? {} : { message }),
    });
    bookings.push(result.bookingId);
    return { result, intent, scheduledAt };
  };

  stage = 'confirm with a request note';
  const intro = 'Hi Sara! Excited to work through this with you.';
  const withNote = await createPendingBooking(slots[0]!, `  ${intro}  `);
  const bookingId = withNote.result.bookingId;
  const { data: pendingRow, error: pendingError } = await admin.from('bookings')
    .select('status,request_note').eq('id', bookingId).single();
  step('confirm with a note creates a pending booking with trimmed request_note',
    !pendingError && pendingRow?.status === 'pending' && pendingRow.request_note === intro);
  step('confirm-booking response has no conversationId', !('conversationId' in withNote.result));

  const { count: pendingConversationCount } = await admin.from('conversations')
    .select('id', { count: 'exact', head: true }).eq('student_id', studentId).eq('tutor_id', tutorId);
  const { count: pendingMessageCount } = await admin.from('messages')
    .select('id', { count: 'exact', head: true }).eq('sender_id', studentId);
  step('pending booking has no conversation or messages', pendingConversationCount === 0 && pendingMessageCount === 0);

  const tutorClient = createClient(URL, ANON, { auth: { persistSession: false } });
  const tutorSignIn = await tutorClient.auth.signInWithPassword({ email: tutor.email as string, password: PASSWORD });
  if (tutorSignIn.error) throw tutorSignIn.error;
  const { data: tutorRead, error: tutorReadError } = await tutorClient.from('bookings')
    .select('request_note').eq('id', bookingId).maybeSingle();
  step('tutor can read request_note through a normal client select',
    !tutorReadError && tutorRead?.request_note === intro);

  await auth.signInWithPassword(studentEmail, PASSWORD);
  const { data: editedRows, error: editError } = await studentClient.from('bookings')
    .update({ request_note: 'client edit' }).eq('id', bookingId).select('id');
  const { data: unchanged } = await admin.from('bookings').select('request_note').eq('id', bookingId).single();
  step('student REST update of request_note is refused',
    !!editError || !editedRows?.length, editError?.message ?? 'RLS returned no updated rows');
  step('server-owned request_note remains unchanged', unchanged?.request_note === intro);

  stage = 'accept booking with a request note';
  const accepted = await call('respond-booking-request', { bookingId, action: 'accept' }, tutorToken);
  const { data: acceptedRow } = await admin.from('bookings').select('status').eq('id', bookingId).single();
  const { data: conversation, error: conversationError } = await admin.from('conversations')
    .select('id').eq('student_id', studentId).eq('tutor_id', tutorId).maybeSingle();
  conversationId = conversation?.id ?? '';
  const { data: noteMessages } = conversationId
    ? await admin.from('messages').select('sender_id,content').eq('conversation_id', conversationId).order('created_at')
    : { data: null };
  step('tutor accept creates the conversation and confirms the booking',
    accepted.status === 200 && acceptedRow?.status === 'confirmed' && !!conversation && !conversationError);
  step('accepted note thread is ordered student intro then tutor acceptance',
    noteMessages?.length === 2 &&
      noteMessages[0]?.sender_id === studentId &&
      noteMessages[0]?.content === intro &&
      noteMessages[1]?.sender_id === tutorId &&
      noteMessages[1]?.content.startsWith('Accepted your'));
  const { data: confirmationNotice } = await admin.from('notifications')
    .select('id').eq('user_id', studentId).eq('type', 'booking').eq('title', 'Session confirmed')
    .contains('data', { bookingId }).maybeSingle();
  step('student receives the booking confirmation notification', !!confirmationNotice);

  stage = 'confirm without a note';
  await auth.signInWithPassword(studentEmail, PASSWORD);
  const withoutNote = await createPendingBooking(slots[1]!, '');
  const noNoteId = withoutNote.result.bookingId;
  const { data: noNoteRow } = await admin.from('bookings')
    .select('status,request_note').eq('id', noNoteId).single();
  const { data: beforeNoNoteAccept } = await admin.from('messages')
    .select('sender_id,content').eq('conversation_id', conversationId).order('created_at');
  step('confirm without a note stores request_note as null and posts no message',
    noNoteRow?.status === 'pending' && noNoteRow.request_note === null && beforeNoNoteAccept?.length === 2);
  await auth.signInWithPassword(tutor.email as string, PASSWORD);
  const noNoteAccepted = await call('respond-booking-request', { bookingId: noNoteId, action: 'accept' }, tutorToken);
  const { data: afterNoNoteAccept } = await admin.from('messages')
    .select('sender_id,content').eq('conversation_id', conversationId).order('created_at');
  step('accepting without a note posts only the tutor acceptance message',
    noNoteAccepted.status === 200 && afterNoNoteAccept?.length === 3 &&
      afterNoNoteAccept[2]?.sender_id === tutorId &&
      afterNoNoteAccept[2]?.content.startsWith('Accepted your'));

  stage = 'accept booking after block';
  await auth.signInWithPassword(studentEmail, PASSWORD);
  const blocked = await createPendingBooking(slots[2]!);
  const blockedBookingId = blocked.result.bookingId;
  const { data: beforeBlockedAccept } = await admin.from('messages')
    .select('id').eq('conversation_id', conversationId);
  const { error: blockError } = await admin.from('user_blocks')
    .insert({ blocker_id: studentId, blocked_id: tutorId });
  if (blockError) throw blockError;
  await auth.signInWithPassword(tutor.email as string, PASSWORD);
  const blockedAccept = await call('respond-booking-request', { bookingId: blockedBookingId, action: 'accept' }, tutorToken);
  const { data: blockedRow } = await admin.from('bookings').select('status').eq('id', blockedBookingId).single();
  const { data: afterBlockedAccept } = await admin.from('messages')
    .select('id').eq('conversation_id', conversationId);
  step('blocked accept still confirms but adds no messages',
    blockedAccept.status === 200 && blockedRow?.status === 'confirmed' &&
      beforeBlockedAccept?.length === afterBlockedAccept?.length);
  await admin.from('user_blocks').delete().eq('blocker_id', studentId).eq('blocked_id', tutorId);

  stage = 'blocked request note cleanup';
  const { data: blockedTermRow, error: blockedTermError } = await admin.from('blocked_terms')
    .select('term').eq('category', 'slur').limit(1).maybeSingle();
  if (blockedTermError || !blockedTermRow?.term) throw blockedTermError ?? new Error('No zero-tolerance term is seeded');
  await auth.signInWithPassword(studentEmail, PASSWORD);
  const refusedAt = slots[3]!;
  const refusedIntent = await api.createPaymentIntent({ tutorId, courseCode, durationMinutes: 60, scheduledAt: refusedAt });
  intents.push(refusedIntent.paymentIntentId);
  if (refusedIntent.paymentIntentId.startsWith('pi_')) await authorizeHold(refusedIntent.paymentIntentId);
  const refused = await call('confirm-booking', {
    tutorId,
    courseCode,
    scheduledAt: refusedAt,
    durationMinutes: 60,
    sessionType: 'in_person',
    paymentIntentId: refusedIntent.paymentIntentId,
    message: `${blockedTermRow.term} verification`,
  }, studentToken);
  const { count: refusedCount } = await admin.from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('stripe_payment_intent_id', refusedIntent.paymentIntentId);
  step('zero-tolerance request note is rejected with 400 and no booking',
    refused.status === 400 && refusedCount === 0 && /community rules/i.test(String(refused.body.error)));
  if (refusedIntent.simulated) {
    step('rejected note leaves the simulated payment uncaptured', true);
  } else {
    const payment = await getPaymentIntent(refusedIntent.paymentIntentId);
    step('rejected note hold is cancelled or remains uncaptured',
      payment.status === 'canceled' || payment.status === 'requires_capture',
      String(payment.status));
  }
} catch (error) {
  fail++;
  console.error(`❌ ${stage} — ${error instanceof Error ? error.message : String(error)}`);
} finally {
  try {
    await admin.from('user_blocks').delete().eq('blocker_id', studentId).eq('blocked_id', tutorId);
  } catch { /* best effort */ }
  for (const bookingId of bookings) {
    await admin.from('notifications').delete().contains('data', { bookingId });
  }
  if (bookings.length) await admin.from('bookings').delete().in('id', bookings);
  if (!conversationId && studentId && tutorId) {
    const { data: conversation } = await admin.from('conversations')
      .select('id').eq('student_id', studentId).eq('tutor_id', tutorId).maybeSingle();
    conversationId = conversation?.id ?? '';
  }
  if (conversationId) {
    await admin.from('notifications').delete().contains('data', { conversationId });
    await admin.from('messages').delete().eq('conversation_id', conversationId);
    await admin.from('conversations').delete().eq('id', conversationId);
  }
  for (const intent of intents) if (intent.startsWith('pi_')) await cancelHold(intent).catch(() => {});
  if (tutorId && tutorChargesEnabled !== null) {
    await admin.from('tutor_profiles').update({ stripe_charges_enabled: tutorChargesEnabled }).eq('user_id', tutorId);
  }
  if (studentId) await admin.auth.admin.deleteUser(studentId);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
