// Throwaway integration check for the admin team room (migration 0024). Drives the REAL
// @noot/core chat API as two different admins plus a non-admin, so it covers both that the
// group thread works and that it's actually closed to everyone else. Run with:
//   pnpm dlx tsx scripts/verify_admin_chat.mts
import { createClient } from '@supabase/supabase-js';
import { initSupabase, api, auth, getSupabase, type Message } from '../packages/core/src/index.ts';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
}

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

async function signIn(email: string) {
  const r = await auth.signInWithPassword(email, 'password123');
  if (!r.ok) throw new Error(`${email}: ${r.error}`);
  return (await auth.getSessionUserId())!;
}

initSupabase({ url: URL, anonKey: ANON });
const sb = getSupabase();

// --- admin A opens the room and posts -----------------------------------------------------
const adminA = await signIn('admin@crimson.ua.edu');
const room = await api.chat.getAdminRoom();
check('admin resolves the room', room.kind === 'admin' && !!room.id, room.id);
check('room has no 1:1 participants', room.studentId === null && room.tutorId === null);

const stamp = Date.now();
const textMsg = await api.chat.sendMessage(room.id, `hello team ${stamp}`);
check('admin can post text', textMsg.senderId === adminA);

const att = await api.chat.uploadAttachment(room.id, PNG.buffer, 'screenshot.png', 'image/png');
const attMsg = await api.chat.sendMessage(room.id, 'see attached', [att]);
check('admin can post an attachment', attMsg.attachmentCount === 1 && att.storagePath.startsWith(`${room.id}/`));

// The room must not pollute anyone's 1:1 chat list.
const convosA = await api.chat.listConversations();
check('admin room stays out of the normal chat list', !convosA.some((c) => c.id === room.id), `${convosA.length} direct convo(s)`);

// --- admin B sees it, and can identify the sender ------------------------------------------
const adminB = await signIn('admin2@crimson.ua.edu');
const roomB = await api.chat.getAdminRoom();
check('second admin resolves the same room', roomB.id === room.id);

const msgs = await api.chat.listMessages(room.id);
const seenText = msgs.find((m) => m.id === textMsg.id);
const seenAtt = msgs.find((m) => m.id === attMsg.id);
check('second admin reads both messages', !!seenText && !!seenAtt, `${msgs.length} in thread`);
check('attachment embedded for the reader', seenAtt?.attachments?.length === 1);

const people = await api.chat.listParticipants(msgs.map((m) => m.senderId));
const sender = people[adminA];
check('sender resolves to a name', `${sender?.firstName} ${sender?.lastName}`.trim() === 'Jordan Blake',
  `${sender?.firstName} ${sender?.lastName}`);
check('participant record exposes avatarUrl for the header', sender ? 'avatarUrl' in sender : false,
  `avatarUrl=${String(sender?.avatarUrl)}`);

const urls = await api.chat.attachmentUrls([att.storagePath]);
const got = urls[att.storagePath] ? await fetch(urls[att.storagePath]!) : null;
check('second admin can open the attachment', !!got?.ok && (await got!.arrayBuffer()).byteLength === PNG.byteLength);

const replied = await api.chat.sendMessage(room.id, 'got it');
check('second admin can reply', replied.senderId === adminB);

// --- a non-admin must be shut out ----------------------------------------------------------
await signIn('student@crimson.ua.edu');
let roomVisible = true;
try {
  await api.chat.getAdminRoom();
} catch {
  roomVisible = false;
}
check('non-admin cannot resolve the room', !roomVisible);

const leaked = await api.chat.listMessages(room.id);
check('non-admin reads no messages from it', leaked.length === 0, `${leaked.length} rows`);

let postBlocked = false;
try {
  await api.chat.sendMessage(room.id, 'let me in');
} catch {
  postBlocked = true;
}
check('non-admin cannot post', postBlocked);

let uploadBlocked = false;
const { error: upErr } = await sb.storage
  .from('chat-attachments')
  .upload(`${room.id}/intruder.png`, PNG.buffer, { contentType: 'image/png' });
uploadBlocked = !!upErr;
check('non-admin cannot upload into the room folder', uploadBlocked);

const outsiderUrls = await api.chat.attachmentUrls([att.storagePath]).catch(() => ({}));
check('non-admin gets no signed URL for its files', !outsiderUrls[att.storagePath]);

// --- the room is a singleton ----------------------------------------------------------------
const svc = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU');
const { error: dupErr } = await svc.from('conversations').insert({ kind: 'admin', student_id: null, tutor_id: null });
check('a second admin room is rejected', !!dupErr, dupErr?.code ?? 'inserted!');

const { error: shapeErr } = await svc.from('conversations').insert({ kind: 'admin', student_id: adminA, tutor_id: adminB });
check('an admin row with 1:1 columns is rejected', !!shapeErr, shapeErr?.code ?? 'inserted!');

// --- live delivery through the new policy branch --------------------------------------------
// Realtime enforces RLS per subscriber, and the admin room takes a different branch of
// is_conversation_participant() than a 1:1 thread — so it needs its own check.
await signIn('admin@crimson.ua.edu');
const received: Message[] = [];
const unsub = api.chat.subscribe(room.id, (m) => received.push(m));
await new Promise((r) => setTimeout(r, 2500)); // let the channel JOIN settle

const bClient = createClient(URL, ANON);
const { error: bErr } = await bClient.auth.signInWithPassword({
  email: 'admin2@crimson.ua.edu',
  password: 'password123',
});
if (bErr) throw bErr;
const livePath = `${room.id}/${Date.now()}-live.png`;
await bClient.storage.from('chat-attachments').upload(livePath, PNG.buffer, { contentType: 'image/png' });
await bClient.rpc('send_message_with_attachments', {
  p_conversation_id: room.id,
  p_content: 'live to the team',
  p_attachments: [{ storagePath: livePath, kind: 'image', filename: 'live.png', sizeBytes: PNG.byteLength, mimeType: 'image/png' }],
});

// Assert the message ARRIVED, not that it was the only event: on JOIN the local Realtime
// container can replay a short backlog from its current WAL window, so messages this script
// sent moments earlier may also land here. The app dedupes by message id, so that's benign.
const wanted = () => received.find((r) => r.content === 'live to the team');
for (let i = 0; i < 40 && !wanted(); i++) await new Promise((r) => setTimeout(r, 250));
unsub();
const live = wanted();
check('admin receives a teammate\'s message live', !!live, `${received.length} event(s) seen`);
check('live admin message carries its attachment', live?.attachments?.length === 1);

console.log(`\n${fail === 0 ? '✅ all' : `❌ ${fail} failed,`} ${pass} passed`);
process.exit(fail === 0 ? 0 : 1);
