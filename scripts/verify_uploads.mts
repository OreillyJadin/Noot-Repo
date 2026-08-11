// Throwaway integration check for avatar uploads: signs in as the seeded student, uploads a
// real PNG through api.profile.uploadAvatar, and asserts the stored object is email-named,
// non-zero, and that the previous file was cleaned up. Run with:
//   node --experimental-strip-types scripts/verify_avatar.mts
import { initSupabase, api, auth, getSupabase } from '../packages/core/src/index.ts';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

// A 1x1 red PNG, base64 — stands in for what ImagePicker hands us.
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  return Uint8Array.from(Buffer.from(b64, 'base64')).buffer;
}

initSupabase({ url: URL, anonKey: ANON });

const email = 'student@crimson.ua.edu';
const signIn = await auth.signInWithPassword(email, 'password123');
if (!signIn.ok) throw new Error(signIn.error);
const uid = await auth.getSessionUserId();
console.log(`signed in as ${email} (${uid})`);

const sb = getSupabase();

// Seed a stale file so the cleanup path has something to remove.
await sb.storage
  .from('avatars')
  .upload(`${uid}/avatar.png`, base64ToArrayBuffer(PNG_B64), { upsert: true, contentType: 'image/png' });

const url = await api.profile.uploadAvatar(base64ToArrayBuffer(PNG_B64), 'png', 'image/png');
console.log(`uploadAvatar → ${url}`);

const { data: files } = await sb.storage.from('avatars').list(uid!);
console.log('bucket folder now holds:', files?.map((f) => `${f.name} (${f.metadata?.size} bytes)`));

const expected = 'student_at_crimson.ua.edu.png';
const only = files ?? [];
const ok1 = only.length === 1 && only[0]!.name === expected;
console.log(`${ok1 ? '✅' : '❌'} exactly one file, named from the email (${expected})`);

const size = Number(only[0]?.metadata?.size ?? 0);
console.log(`${size > 0 ? '✅' : '❌'} stored object is ${size} bytes (not 0)`);

const fetched = await fetch(url);
const bytes = new Uint8Array(await fetched.arrayBuffer());
const ok3 = fetched.ok && bytes.length === 70 && bytes[1] === 0x50 && bytes[2] === 0x4e;
console.log(`${ok3 ? '✅' : '❌'} public URL serves back a valid PNG (${bytes.length} bytes, ${fetched.headers.get('content-type')})`);

const me = await api.getMe();
console.log(`${me?.avatarUrl === url ? '✅' : '❌'} users.avatar_url updated → ${me?.avatarUrl}`);

// Empty body must be rejected rather than silently written.
try {
  await api.profile.uploadAvatar(new ArrayBuffer(0), 'jpg');
  console.log('❌ empty upload was accepted');
} catch (e) {
  console.log(`✅ empty upload rejected: ${(e as Error).message}`);
}

// --- transcripts (private bucket, tutor session) ---------------------------------------
const tutorEmail = 'sara@crimson.ua.edu';
const tutorIn = await auth.signInWithPassword(tutorEmail, 'password123');
if (!tutorIn.ok) throw new Error(tutorIn.error);
const tutorUid = await auth.getSessionUserId();
console.log(`\nsigned in as ${tutorEmail} (${tutorUid})`);

const PDF = new TextEncoder().encode('%PDF-1.4\n% pretend transcript\n%%EOF\n');
// Seed the legacy fixed-name file so the cleanup path (needs migration 0017) has a target.
await sb.storage
  .from('transcripts')
  .upload(`${tutorUid}/transcript.pdf`, PDF.buffer, { upsert: true, contentType: 'application/pdf' });

const storedPath = await api.profile.uploadTranscript(PDF.buffer, 'pdf', 'application/pdf');
console.log(`uploadTranscript → ${storedPath}`);

const { data: tFiles } = await sb.storage.from('transcripts').list(tutorUid!);
console.log('transcripts folder now holds:', tFiles?.map((f) => `${f.name} (${f.metadata?.size} bytes)`));

const tExpected = 'sara_at_crimson.ua.edu.pdf';
const tOnly = tFiles ?? [];
console.log(
  `${tOnly.length === 1 && tOnly[0]!.name === tExpected ? '✅' : '❌'} exactly one transcript, named from the email (${tExpected}) — legacy transcript.pdf removed`,
);
console.log(
  `${Number(tOnly[0]?.metadata?.size ?? 0) === PDF.byteLength ? '✅' : '❌'} stored transcript is ${tOnly[0]?.metadata?.size} bytes (expected ${PDF.byteLength}, not 0)`,
);

// Bucket must stay private, and the signed URL admins use must serve the real bytes.
const publicTry = await fetch(sb.storage.from('transcripts').getPublicUrl(storedPath).data.publicUrl);
console.log(`${publicTry.ok ? '❌' : '✅'} transcript is NOT publicly readable (${publicTry.status})`);

const { data: signed } = await sb.storage.from('transcripts').createSignedUrl(storedPath, 60);
const signedBody = signed?.signedUrl ? await (await fetch(signed.signedUrl)).text() : '';
console.log(`${signedBody.startsWith('%PDF-1.4') ? '✅' : '❌'} signed URL serves the real PDF bytes`);

const prof = await sb.from('tutor_profiles').select('transcript_url').eq('user_id', tutorUid!).maybeSingle();
console.log(
  `${prof.data?.transcript_url === storedPath ? '✅' : '❌'} tutor_profiles.transcript_url updated → ${prof.data?.transcript_url}`,
);
