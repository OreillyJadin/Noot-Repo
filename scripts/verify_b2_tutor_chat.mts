// Tracker B2 — a tutor can open the chat with their booked student, so the suggested
// "confirm meeting spot" message has somewhere to go.
//
// The tutor chat used api.chat.getOrCreateConversation, which is the STUDENT's call: it
// matches student_id = me, so from a tutor it never found the conversation confirm-booking
// created. This checks the tutor-side lookup against the seeded local conversation
// (student@ ↔ sara@), plus the deny cases.
// Local stack only (never reads EXPO_PUBLIC_SUPABASE_URL, which may point at production).
//   pnpm dlx tsx scripts/verify_b2_tutor_chat.mts
import { createClient } from '@supabase/supabase-js';
import { initSupabase, api, auth } from '../packages/core/src/index.ts';

const URL = 'http://127.0.0.1:54321';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });
let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
}
const as = async (email: string) => {
  const r = await auth.signInWithPassword(email, 'password123');
  if (!r.ok) throw new Error(`${email}: ${r.error}`);
  return (await api.getMe())!.id;
};

initSupabase({ url: URL, anonKey: ANON });

const studentId = await as('student@crimson.ua.edu');
const sara = (await api.tutors.search({})).find((t) => t.firstName === 'Sara');
if (!sara) throw new Error('seeded tutor Sara not found — run node supabase/seed_demo.mjs');
const studentView = await api.chat.getOrCreateConversation(sara.userId);

await as('sara@crimson.ua.edu');
const tutorView = await api.chat.getConversationWithStudent(studentId);
check('the tutor opens the same conversation the student sees', tutorView.id === studentView.id, tutorView.id);
const msgs = await api.chat.listMessages(tutorView.id);
check('and can read its messages', Array.isArray(msgs), `${msgs.length} messages`);

let missing = '';
try { await api.chat.getConversationWithStudent(sara.userId); } catch (e) { missing = (e as Error).message; }
check('no conversation with someone who never booked you → clear error', /No conversation/.test(missing), missing);

// The old call, from the tutor side, makes a NEW conversation with the tutor as both
// student and tutor — the empty chat tutors were seeing. Removed again below.
let oldCall = '';
try {
  const c = await api.chat.getOrCreateConversation(sara.userId);
  oldCall = c.id;
} catch (e) {
  oldCall = `refused: ${(e as Error).message}`;
}
check('the old student-side call never reaches it from the tutor side', oldCall !== studentView.id, oldCall);
await svc.from('conversations').delete().eq('student_id', sara.userId).eq('tutor_id', sara.userId);

await as('nina@crimson.ua.edu');
const nina = await api.chat.getConversationWithStudent(studentId).catch(() => null);
check('DENY: another tutor gets their own conversation, never Sara\'s', !nina || nina.id !== studentView.id, nina?.id ?? 'none');

await auth.signOut();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
