// e2e_book_nonote — book a second session as the E2E student with NO request note
// through the API layer (b3 requires a note in the UI, so this path can't be
// driven on screen). Confirms no message is posted before tutor acceptance.
import { DEV_PASSWORD } from './_devPassword.mjs';
import { createClient } from '@supabase/supabase-js';
import { api, auth, initSupabase } from '../packages/core/src/index.ts';

const URL = 'http://127.0.0.1:54321';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
initSupabase({ url: URL, anonKey: ANON });

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

// Resolve the E2E tutor + their course instead of hardcoding ids.
const { data: tutorUser, error: tutorError } = await admin
  .from('users').select('id').eq('email', 'sara.chen@crimson.ua.edu').single();
if (tutorError || !tutorUser) throw tutorError ?? new Error('sara.chen missing — run scripts/e2e_users.mts first');
const tutorId = tutorUser.id as string;
const { data: tc, error: tcError } = await admin
  .from('tutor_courses').select('course_code').eq('tutor_id', tutorId).limit(1).single();
if (tcError || !tc) throw tcError ?? new Error('sara.chen has no tutor_courses — run scripts/e2e_users.mts first');
const courseCode = tc.course_code as string;

const signIn = await auth.signInWithPassword('alex.rivera@crimson.ua.edu', DEV_PASSWORD);
if (!signIn.ok) throw new Error(signIn.error);
const studentId = (await api.getMe())?.id;
if (!studentId) throw new Error('E2E student profile is missing');

const { data: priorConversation } = await admin.from('conversations')
  .select('id').eq('student_id', studentId).eq('tutor_id', tutorId).maybeSingle();
const priorConversationId = priorConversation?.id as string | undefined;
const { count: priorMessageCount } = priorConversationId
  ? await admin.from('messages').select('id', { count: 'exact', head: true })
      .eq('conversation_id', priorConversationId)
  : { count: 0 };

// Pick a free hour ~4 days out inside the tutor's availability. The server
// checks windows in America/Chicago (CAMPUS_TZ), so evaluate candidates by
// their Chicago-local clock time, not UTC — Sara's windows are 14:00–19:00 CT.
const CT = 'America/Chicago';
const ctClock = new Intl.DateTimeFormat('en-US', {
  timeZone: CT, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const ctMinutes = (ms: number) => {
  const parts = Object.fromEntries(ctClock.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return Number(parts.hour) * 60 + Number(parts.minute);
};

const anchor = Date.now() + 4 * 24 * 3_600_000;
const { data: taken } = await admin.from('bookings')
  .select('scheduled_at,duration_minutes').eq('tutor_id', tutorId)
  .in('status', ['pending', 'confirmed'])
  .gte('scheduled_at', new Date(anchor - 24 * 3_600_000).toISOString())
  .lt('scheduled_at', new Date(anchor + 24 * 3_600_000).toISOString());

let scheduledAt: string | undefined;
// Scan every hour of the UTC day(s) the anchor spans; keep ones that land
// inside 14:00–19:00 Chicago time and don't overlap an existing booking.
for (let hour = 0; hour < 48 && !scheduledAt; hour++) {
  const start = new Date(Math.floor(anchor / 3_600_000) * 3_600_000 + hour * 3_600_000);
  if (start.getTime() <= Date.now()) continue;
  const end = start.getTime() + 60 * 60_000;
  if (ctMinutes(start.getTime()) < 14 * 60 || ctMinutes(end - 1) >= 19 * 60) continue;
  const overlaps = (taken ?? []).some((b) => {
    const bStart = new Date(b.scheduled_at as string).getTime();
    const bEnd = bStart + (b.duration_minutes as number) * 60_000;
    return bStart < end && start.getTime() < bEnd;
  });
  if (!overlaps) scheduledAt = start.toISOString();
}
if (!scheduledAt) throw new Error('no free hour inside the availability window — widen the search range');

const pi = await api.createPaymentIntent({ tutorId, courseCode, durationMinutes: 60, scheduledAt });
console.log('pi simulated:', pi.simulated);
const created = await api.bookings.confirm({
  tutorId, courseCode, scheduledAt, durationMinutes: 60,
  sessionType: 'in_person', paymentIntentId: pi.paymentIntentId, message: '',
});
const { data: pending } = await admin.from('bookings')
  .select('status,request_note').eq('id', created.bookingId).single();
if (pending?.status !== 'pending' || pending.request_note !== null || 'conversationId' in created) {
  throw new Error('A no-note request must be pending, have a null request_note, and return no conversationId');
}
const { data: pendingConversation } = await admin.from('conversations')
  .select('id').eq('student_id', studentId).eq('tutor_id', tutorId).maybeSingle();
if (!priorConversationId && pendingConversation) {
  throw new Error('Confirming the request unexpectedly created a conversation');
}
if (priorConversationId) {
  const { count: pendingMessageCount } = await admin.from('messages')
    .select('id', { count: 'exact', head: true }).eq('conversation_id', priorConversationId);
  if (pendingMessageCount !== priorMessageCount) throw new Error('Confirming the request unexpectedly posted a message');
}

const tutorSignIn = await auth.signInWithPassword('sara.chen@crimson.ua.edu', DEV_PASSWORD);
if (!tutorSignIn.ok) throw new Error(tutorSignIn.error);
await api.bookings.respond({ bookingId: created.bookingId, action: 'accept' });
const { data: conversation } = await admin.from('conversations')
  .select('id').eq('student_id', studentId).eq('tutor_id', tutorId).maybeSingle();
if (!conversation) throw new Error('Tutor acceptance did not create a conversation');
const { data: messages } = await admin.from('messages')
  .select('sender_id,content').eq('conversation_id', conversation.id).order('created_at');
const additions = messages?.slice(priorMessageCount ?? 0) ?? [];
if (additions.length !== 1 || additions[0].sender_id !== tutorId ||
    !additions[0].content.startsWith('Accepted your')) {
  throw new Error('No-note acceptance should add only the tutor acceptance message');
}
console.log('booking:', created.bookingId, 'accepted; no opening student message');
console.log('acceptance message:', JSON.stringify(additions[0].content));
console.log('DONE');
