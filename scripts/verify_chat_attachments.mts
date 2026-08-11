// Throwaway integration check for chat attachments: drives the REAL @noot/core chat API
// against the live local Supabase stack as two different users, and probes the RLS edges
// with a third who isn't in the conversation. Run with:
//   pnpm dlx tsx scripts/verify_chat_attachments.mts
import { initSupabase, api, auth, getSupabase } from '../packages/core/src/index.ts';

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

initSupabase({ url: URL, anonKey: ANON });
const sb = getSupabase();

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);
const NOTES = new TextEncoder().encode('week 3 problem set — show your work\n');

async function signIn(email: string) {
  const r = await auth.signInWithPassword(email, 'password123');
  if (!r.ok) throw new Error(`${email}: ${r.error}`);
  return (await auth.getSessionUserId())!;
}

// --- student sends an image + a file with text ------------------------------------------
const studentId = await signIn('student@crimson.ua.edu');
const { data: tutorRow } = await sb.from('users').select('id').eq('email', 'sara@crimson.ua.edu').single();
const tutorId = tutorRow!.id as string;
const conv = await api.chat.getOrCreateConversation(tutorId);
console.log(`conversation ${conv.id}\n  student ${studentId}\n  tutor   ${tutorId}\n`);

const img = await api.chat.uploadAttachment(conv.id, PNG.buffer, 'diagram.png', 'image/png');
const doc = await api.chat.uploadAttachment(conv.id, NOTES.buffer, 'notes.txt', 'text/plain');
check('uploadAttachment classifies kind from mime', img.kind === 'image' && doc.kind === 'file', `${img.kind}/${doc.kind}`);
check('attachment keyed under the conversation', img.storagePath.startsWith(`${conv.id}/`), img.storagePath);

const sent = await api.chat.sendMessage(conv.id, 'Here are my notes', [img, doc]);
check('sendMessage returns the message with attachments', sent.attachmentCount === 2 && sent.attachments?.length === 2);

// Attachment-only message (content '') must be allowed — that's the whole point of the feature.
const imgOnly = await api.chat.uploadAttachment(conv.id, PNG.buffer, 'whiteboard.png', 'image/png');
const bare = await api.chat.sendMessage(conv.id, '', [imgOnly]);
check('attachment-only message sends', bare.content === '' && bare.attachmentCount === 1);

let rejected = false;
try {
  await api.chat.sendMessage(conv.id, '   ', []);
} catch {
  rejected = true;
}
check('empty message with no attachments is rejected', rejected);

// --- tutor reads the thread --------------------------------------------------------------
await signIn('sara@crimson.ua.edu');
const asTutor = await api.chat.listMessages(conv.id);
const withAtt = asTutor.find((m) => m.id === sent.id);
check('counterpart sees the attachments', withAtt?.attachments?.length === 2, `${withAtt?.attachments?.length} embedded`);
check('attachment metadata survives the round trip',
  withAtt?.attachments?.some((a) => a.filename === 'diagram.png' && a.sizeBytes === PNG.byteLength && a.mimeType === 'image/png') ?? false);

const urls = await api.chat.attachmentUrls([img.storagePath, doc.storagePath]);
const fetched = await fetch(urls[img.storagePath]!);
const bytes = new Uint8Array(await fetched.arrayBuffer());
check('counterpart can read the file via a signed URL',
  fetched.ok && bytes.length === PNG.byteLength && bytes[1] === 0x50, `${bytes.length} bytes, ${fetched.headers.get('content-type')}`);

const pub = await fetch(sb.storage.from('chat-attachments').getPublicUrl(img.storagePath).data.publicUrl);
check('bucket is NOT publicly readable', !pub.ok, `HTTP ${pub.status}`);

// --- an outsider must see nothing --------------------------------------------------------
// A third seeded user who is not a participant in this conversation.
const { data: others } = await sb.from('users').select('id, email').not('id', 'in', `(${studentId},${tutorId})`).limit(1);
const outsider = others?.[0];
if (!outsider) {
  console.log('⚠️  no third seeded user — skipping the outsider checks');
} else {
  await signIn(outsider.email as string);
  const leaked = await api.chat.listMessages(conv.id);
  check(`outsider (${outsider.email}) reads no messages`, leaked.length === 0, `${leaked.length} rows`);

  const { data: attRows } = await sb.from('message_attachments').select('id').eq('message_id', sent.id);
  check('outsider reads no attachment rows', (attRows ?? []).length === 0, `${(attRows ?? []).length} rows`);

  const outsiderUrls = await api.chat.attachmentUrls([img.storagePath]).catch(() => ({}));
  const gotUrl = outsiderUrls[img.storagePath];
  const outsiderFetch = gotUrl ? await fetch(gotUrl) : null;
  check('outsider cannot sign a URL for the file', !gotUrl || !outsiderFetch?.ok, gotUrl ? `HTTP ${outsiderFetch?.status}` : 'no URL issued');

  let uploadBlocked = false;
  try {
    const { error } = await sb.storage
      .from('chat-attachments')
      .upload(`${conv.id}/intruder.png`, PNG.buffer, { contentType: 'image/png' });
    uploadBlocked = !!error;
  } catch {
    uploadBlocked = true;
  }
  check('outsider cannot upload into the conversation folder', uploadBlocked);
}

console.log(`\n${fail === 0 ? '✅ all' : `❌ ${fail} failed,`} ${pass} passed`);
process.exit(fail === 0 ? 0 : 1);
