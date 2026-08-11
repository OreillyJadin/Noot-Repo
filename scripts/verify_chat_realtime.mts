// Throwaway integration check for LIVE chat delivery: the tutor subscribes through
// api.chat.subscribe() while the student sends from a second, independent client, so this
// exercises the real Realtime path rather than the local optimistic append.
//
// The interesting case is an attachment message: the realtime payload carries the `messages`
// row only, so the subscriber has to resolve the child rows itself. Run with:
//   pnpm dlx tsx scripts/verify_chat_realtime.mts
import { createClient } from '@supabase/supabase-js';
import { initSupabase, api, auth, getSupabase, type Message } from '../packages/core/src/index.ts';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

let fail = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fail++;
}

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

// Client A = the tutor, watching through @noot/core exactly as the screen does.
initSupabase({ url: URL, anonKey: ANON });
const tutorSignIn = await auth.signInWithPassword('sara@crimson.ua.edu', 'password123');
if (!tutorSignIn.ok) throw new Error(tutorSignIn.error);
const tutorId = (await auth.getSessionUserId())!;

// Client B = the student, fully separate so the send is genuinely remote.
const student = createClient(URL, ANON);
const { data: sAuth, error: sErr } = await student.auth.signInWithPassword({
  email: 'student@crimson.ua.edu',
  password: 'password123',
});
if (sErr) throw sErr;
const studentId = sAuth.user!.id;

const { data: convRow } = await getSupabase()
  .from('conversations')
  .select('id')
  .eq('student_id', studentId)
  .eq('tutor_id', tutorId)
  .maybeSingle();
const convId = convRow!.id as string;
console.log(`conversation ${convId} — tutor subscribes, student sends\n`);

const received: Message[] = [];
const unsub = api.chat.subscribe(convId, (m) => received.push(m));

// Let the channel finish its JOIN before sending, or the INSERT predates the subscription.
await new Promise((r) => setTimeout(r, 2500));

const path = `${convId}/${Date.now()}-live-test.png`;
const { error: upErr } = await student.storage
  .from('chat-attachments')
  .upload(path, PNG.buffer, { contentType: 'image/png' });
if (upErr) throw upErr;

const { error: rpcErr } = await student.rpc('send_message_with_attachments', {
  p_conversation_id: convId,
  p_content: 'live attachment test',
  p_attachments: [
    { storagePath: path, kind: 'image', filename: 'live-test.png', sizeBytes: PNG.byteLength, mimeType: 'image/png' },
  ],
});
if (rpcErr) throw rpcErr;

// Poll rather than sleeping a fixed budget — usually arrives in well under a second. Match on
// content rather than count: Realtime can replay a short backlog on JOIN, and the app dedupes
// by message id, so extra events are benign.
const wanted = () => received.find((r) => r.content === 'live attachment test');
for (let i = 0; i < 40 && !wanted(); i++) await new Promise((r) => setTimeout(r, 250));
unsub();

const m = wanted();
check('subscriber received the message over Realtime', !!m, `${received.length} event(s) seen`);
check('payload carries the text', m?.content === 'live attachment test');
check('payload carries attachment_count', m?.attachmentCount === 1, String(m?.attachmentCount));
check('subscriber resolved the child attachment rows', m?.attachments?.length === 1,
  `${m?.attachments?.length ?? 0} attachment(s)`);
check('resolved attachment has usable metadata',
  m?.attachments?.[0]?.filename === 'live-test.png' && m?.attachments?.[0]?.storagePath === path);

console.log(fail === 0 ? '\n✅ live delivery works, attachments included' : `\n❌ ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
