// Verify Storage enforces bucket MIME and size limits, and that @noot/core rejects kindly.
// Run after `supabase start`, `supabase db reset`, and `node supabase/seed_demo.mjs`:
//   pnpm dlx tsx scripts/verify_storage_limits.mts
import { DEV_PASSWORD } from './_devPassword.mjs';
import { createClient } from '@supabase/supabase-js';
import { initSupabase, api, auth, getSupabase, STORAGE_LIMITS, type UploadBucket } from '../packages/core/src/index.ts';

const URL = 'http://127.0.0.1:54321';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
}

initSupabase({ url: URL, anonKey: ANON });
const sb = getSupabase();
const cleanup = createClient(URL, SERVICE, { auth: { persistSession: false } });
const created: Array<{ bucket: UploadBucket; path: string }> = [];
const nonce = `verify-limits-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

let uid: string | null = null;
let conversationId: string | null = null;
const originalProfiles = new Map<string, { transcript_url: string | null } | null>();

async function rememberTranscriptProfile(userId: string) {
  if (originalProfiles.has(userId)) return;
  const { data, error } = await cleanup
    .from('tutor_profiles')
    .select('transcript_url')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  originalProfiles.set(userId, data);
}

function isPolicyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const message = String((error as { message?: unknown }).message ?? '').toLowerCase();
  const status = String((error as { status?: unknown; statusCode?: unknown }).status ?? (error as { statusCode?: unknown }).statusCode ?? '');
  return status === '403' || message.includes('row-level security') || message.includes('permission denied');
}

try {
  const signedIn = await auth.signInWithPassword('student@crimson.ua.edu', DEV_PASSWORD);
  if (!signedIn.ok) throw new Error(signedIn.error);
  uid = (await auth.getSessionUserId())!;
  console.log(`signed in as student@crimson.ua.edu (${uid})`);

  const { data: tutor, error: tutorError } = await sb
    .from('users')
    .select('id')
    .eq('email', 'sara@crimson.ua.edu')
    .single();
  if (tutorError) throw tutorError;
  const conversation = await api.chat.getOrCreateConversation(tutor.id);
  conversationId = conversation.id;

  let counter = 0;
  const pathFor = (bucket: UploadBucket, userFolder: string, suffix: string) =>
    `${bucket === 'chat-attachments' ? conversationId : userFolder}/${nonce}-${++counter}.${suffix}`;

  async function rawUpload(
    bucket: UploadBucket,
    userFolder: string,
    label: string,
    bytes: Uint8Array,
    contentType: string,
    extension: string,
    expectSuccess: boolean,
    recordCheck = true,
  ): Promise<{ succeeded: boolean; error: unknown }> {
    const path = pathFor(bucket, userFolder, extension);
    let error: unknown = null;
    try {
      const result = await sb.storage.from(bucket).upload(path, bytes.buffer, { contentType });
      error = result.error;
      if (!error) created.push({ bucket, path });
    } catch (caught) {
      error = caught;
    }
    const succeeded = !error;
    const detail = error && typeof error === 'object'
      ? `status=${String((error as { status?: unknown }).status)}, statusCode=${String((error as { statusCode?: unknown }).statusCode)}, message=${String((error as { message?: unknown }).message)}`
      : '';
    if (label === 'text/html' || label === 'oversized image/png') {
      console.log(`Observed StorageError ${bucket}/${label}: ${detail || 'no error returned'}`);
    }
    if (recordCheck) {
      check(`${bucket} ${expectSuccess ? 'accepts' : 'rejects'} ${label}`, succeeded === expectSuccess, detail);
    }
    return { succeeded, error };
  }

  async function probeBucket(bucket: UploadBucket, userFolder: string) {
    await rawUpload(bucket, userFolder, 'image/png', PNG, 'image/png', 'png', true);
    await rawUpload(bucket, userFolder, 'text/html', new TextEncoder().encode('<html>'), 'text/html', 'html', false);
    await rawUpload(bucket, userFolder, 'image/svg+xml', new TextEncoder().encode('<svg/>'), 'image/svg+xml', 'svg', false);
    await rawUpload(bucket, userFolder, 'application/octet-stream', new Uint8Array([1]), 'application/octet-stream', 'bin', false);
    await rawUpload(
      bucket,
      userFolder,
      'oversized image/png',
      new Uint8Array(STORAGE_LIMITS[bucket].maxBytes + 1),
      'image/png',
      'large.png',
      false,
    );
  }

  await probeBucket('avatars', uid);

  const transcriptPng = await rawUpload('transcripts', uid, 'image/png', PNG, 'image/png', 'png', true, false);
  let transcriptOwnerUid = uid;
  let transcriptOwnerEmail = 'student@crimson.ua.edu';
  if (!transcriptPng.succeeded && isPolicyError(transcriptPng.error)) {
    const { data: unverifiedTutor, error: tutorError } = await cleanup
      .from('tutor_profiles')
      .select('user_id')
      .is('verified_grade', null)
      .limit(1)
      .maybeSingle();
    if (tutorError) throw tutorError;
    if (!unverifiedTutor) {
      check('transcript fallback tutor is seeded and unverified', false, 'no unverified tutor profile was found');
      throw new Error('No seeded unverified tutor is available for transcript upload verification.');
    }
    const { data: tutor, error: userError } = await cleanup
      .from('users')
      .select('email')
      .eq('id', unverifiedTutor.user_id)
      .single();
    if (userError || !tutor?.email) throw userError ?? new Error('unverified tutor has no email');
    const tutorSignIn = await auth.signInWithPassword(tutor.email, DEV_PASSWORD);
    if (!tutorSignIn.ok) throw new Error(tutorSignIn.error);
    transcriptOwnerUid = (await auth.getSessionUserId())!;
    transcriptOwnerEmail = tutor.email;
    console.log(`⚠️ student cannot write transcripts under the current policy; using seeded tutor (${transcriptOwnerUid})`);
    const tutorPng = await rawUpload(
      'transcripts',
      transcriptOwnerUid,
      'image/png',
      PNG,
      'image/png',
      'png',
      true,
    );
    if (tutorPng.succeeded) {
      await rawUpload('transcripts', transcriptOwnerUid, 'text/html', new TextEncoder().encode('<html>'), 'text/html', 'html', false);
      await rawUpload('transcripts', transcriptOwnerUid, 'image/svg+xml', new TextEncoder().encode('<svg/>'), 'image/svg+xml', 'svg', false);
      await rawUpload('transcripts', transcriptOwnerUid, 'application/octet-stream', new Uint8Array([1]), 'application/octet-stream', 'bin', false);
      await rawUpload(
        'transcripts',
        transcriptOwnerUid,
        'oversized image/png',
        new Uint8Array(STORAGE_LIMITS.transcripts.maxBytes + 1),
        'image/png',
        'large.png',
        false,
      );
    }
  } else if (transcriptPng.succeeded) {
    check('transcripts accepts image/png', true);
    await rawUpload('transcripts', uid, 'text/html', new TextEncoder().encode('<html>'), 'text/html', 'html', false);
    await rawUpload('transcripts', uid, 'image/svg+xml', new TextEncoder().encode('<svg/>'), 'image/svg+xml', 'svg', false);
    await rawUpload('transcripts', uid, 'application/octet-stream', new Uint8Array([1]), 'application/octet-stream', 'bin', false);
    await rawUpload(
      'transcripts',
      uid,
      'oversized image/png',
      new Uint8Array(STORAGE_LIMITS.transcripts.maxBytes + 1),
      'image/png',
      'large.png',
      false,
    );
  } else {
    check('transcripts accepts image/png', false, String((transcriptPng.error as { message?: unknown })?.message));
  }

  await probeBucket('chat-attachments', uid);

  const expectedAvatarType =
    "That photo format isn't supported. Please pick a JPEG, PNG, WebP or HEIC photo.";
  try {
    await api.profile.uploadAvatar(new TextEncoder().encode('<html>').buffer, 'html', 'text/html');
    check('core rejects HTML avatar with a friendly message before upload', false, 'upload accepted');
  } catch (error) {
    check(
      'core rejects HTML avatar with a friendly message before upload',
      error instanceof Error && error.message === expectedAvatarType,
      error instanceof Error ? error.message : String(error),
    );
  }

  const expectedAvatarSize = 'That photo is too big. Please pick one under 5 MB.';
  try {
    await api.profile.uploadAvatar(
      new Uint8Array(STORAGE_LIMITS.avatars.maxBytes + 1).buffer,
      'png',
      'image/png',
    );
    check('core rejects oversized avatar with a friendly message before upload', false, 'upload accepted');
  } catch (error) {
    check(
      'core rejects oversized avatar with a friendly message before upload',
      error instanceof Error && error.message === expectedAvatarSize,
      error instanceof Error ? error.message : String(error),
    );
  }

  const transcriptBytes = new TextEncoder().encode('%PDF-1.4\nlocal storage limit check\n%%EOF\n');
  await rememberTranscriptProfile(transcriptOwnerUid);
  const transcriptFileName = `${transcriptOwnerEmail.replace('@', '_at_')}.pdf`;
  created.push({ bucket: 'transcripts', path: `${transcriptOwnerUid}/${transcriptFileName}` });
  const transcriptPath = await api.profile.uploadTranscript(
    transcriptBytes.buffer,
    'pdf',
    'application/octet-stream',
  );
  check('core resolves transcript octet-stream + .pdf as application/pdf', true, transcriptPath);
  const { data: transcriptObject, error: transcriptReadError } = await sb.storage
    .from('transcripts')
    .list(transcriptOwnerUid, { search: transcriptPath.split('/').pop() });
  const transcript = transcriptObject?.find((item) => item.name === transcriptPath.split('/').pop());
  check(
    'resolved transcript is stored with PDF MIME metadata',
    !transcriptReadError && transcript?.metadata?.mimetype === 'application/pdf',
    transcriptReadError?.message ?? String(transcript?.metadata?.mimetype),
  );

  const notes = await api.chat.uploadAttachment(
    conversationId!,
    new TextEncoder().encode('notes for the storage limit check').buffer,
    'notes.txt',
    'text/plain',
  );
  created.push({ bucket: 'chat-attachments', path: notes.storagePath });
  check(
    'core uploads a plain-text chat attachment',
    notes.mimeType === 'text/plain' && notes.kind === 'file',
    notes.mimeType,
  );
} catch (error) {
  check('unexpected verifier error', false, error instanceof Error ? error.message : String(error));
} finally {
  const pathsByBucket = new Map<UploadBucket, string[]>();
  for (const item of created) pathsByBucket.set(item.bucket, [...(pathsByBucket.get(item.bucket) ?? []), item.path]);
  for (const [bucket, paths] of pathsByBucket) {
    const { error } = await cleanup.storage.from(bucket).remove(paths);
    check(`removed ${bucket} verification objects`, !error, error?.message ?? `${paths.length} object(s)`);
  }
  for (const [userId, originalProfile] of originalProfiles) {
    if (originalProfile) {
      const { error } = await cleanup.from('tutor_profiles')
        .update({ transcript_url: originalProfile.transcript_url })
        .eq('user_id', userId);
      check(`restored transcript profile state for ${userId}`, !error, error?.message ?? 'restored');
    } else {
      const { error } = await cleanup.from('tutor_profiles').delete().eq('user_id', userId);
      check(`removed temporary transcript profile row for ${userId}`, !error, error?.message ?? 'removed');
    }
  }
  const { data: files } = await cleanup.storage.from('avatars').list(uid ?? '');
  check(
    'no avatar verification object remains',
    !files?.some((file) => file.name.startsWith(nonce)),
    files?.map((file) => file.name).join(', ') ?? 'folder empty',
  );
  console.log(`\n${fail === 0 ? '✅ all' : `❌ ${fail} failed,`} ${pass} passed`);
}

process.exit(fail === 0 ? 0 : 1);
