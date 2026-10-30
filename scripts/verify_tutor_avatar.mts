// Tutor profile photos reach every student-facing tutor avatar (QA: generic avatar on B1–B5
// and the public profile despite an uploaded photo).
//
// 1. Live stack: a tutor uploads a photo through @noot/core; a plain student then reads that
//    tutor through tutors.search / getById (the tutor_public_profiles view) and gets the
//    same public URL on TutorSummary.avatarUrl.
// 2. Source: the app's toTutor adapter carries avatarUrl, and each student-facing screen
//    passes it to <Avatar uri=…>.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { api, auth, initSupabase } from '../packages/core/src/index.ts';
import { DEV_PASSWORD } from './_devPassword.mjs';

const URL_ = 'http://127.0.0.1:54321';
const ANON =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const TUTOR = 'sara@crimson.ua.edu';
const STUDENT = 'student@crimson.ua.edu';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS ✅' : 'FAIL ❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

// ---- 1. live data path -------------------------------------------------------------
const sb = initSupabase({ url: URL_, anonKey: ANON });
const tLogin = await auth.signInWithPassword(TUTOR, DEV_PASSWORD);
if (!tLogin.ok) throw new Error(`sign in ${TUTOR}: ${tLogin.error} (run node supabase/seed_demo.mjs)`);
const tutorId = (await sb.auth.getUser()).data.user!.id;
const { data: before } = await sb.from('users').select('avatar_url').eq('id', tutorId).single();
// 1x1 PNG.
const png = Uint8Array.from(
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
);
const uploaded = await api.profile.uploadAvatar(png, 'png', 'image/png');
check('tutor uploads a photo to the avatars bucket', uploaded.includes('/avatars/'), uploaded);
await auth.signOut();

const sLogin = await auth.signInWithPassword(STUDENT, DEV_PASSWORD);
if (!sLogin.ok) throw new Error(`sign in ${STUDENT}: ${sLogin.error}`);
const hit = (await api.tutors.search()).find((s) => s.userId === tutorId);
check('tutors.search gives a student the photo', hit?.avatarUrl === uploaded, String(hit?.avatarUrl));
const one = await api.tutors.getById(tutorId);
check('tutors.getById gives a student the photo', one?.avatarUrl === uploaded, String(one?.avatarUrl));
const res = await fetch(uploaded);
check('the public URL serves the image', res.ok, `HTTP ${res.status}`);
await auth.signOut();

// Put the seeded tutor's avatar_url back as it was.
await auth.signInWithPassword(TUTOR, DEV_PASSWORD);
await sb.from('users').update({ avatar_url: before?.avatar_url ?? null }).eq('id', tutorId);
await auth.signOut();

// ---- 2. app adapter + screens -------------------------------------------------------
const mobile = fileURLToPath(new URL('../apps/mobile', import.meta.url));
const src = (f: string) => readFileSync(join(mobile, f), 'utf8');
check('toTutor maps avatarUrl', /avatarUrl:\s*s\.avatarUrl/.test(src('lib/data.ts')));

const screens: [string, RegExp][] = [
  ['app/b1.tsx', /<Avatar size=\{56\} uri=\{tt\.avatarUrl\}/],
  ['app/b2.tsx', /<Avatar size=\{92\} uri=\{tutor\.avatarUrl\}/],
  ['app/b3.tsx', /<Avatar size=\{42\} uri=\{tutor\.avatarUrl\}/],
  ['app/student_home.tsx', /<Avatar size=\{46\} uri=\{tutor\.avatarUrl\}/],
  ['app/student_home.tsx', /<Avatar size=\{40\} uri=\{tutor\.avatarUrl\}/],
  ['app/home.tsx', /<Avatar size=\{46\} uri=\{avatarUrl\}/],
  ['app/home.tsx', /avatarUrl=\{tt\.avatarUrl\}/],
  ['app/home.tsx', /uri=\{next\.tutor\?\.avatarUrl\}/],
  ['app/saved.tsx', /uri=\{tutor\.avatarUrl\}/],
  ['app/sessions.tsx', /<Avatar size=\{46\} uri=\{tutor\.avatarUrl\}/],
  ['app/sessions.tsx', /<Avatar size=\{46\} uri=\{tutor\?\.avatarUrl\}/],
  ['app/sessions.tsx', /<Avatar size=\{44\} uri=\{tutor\?\.avatarUrl\}/],
  ['app/xsc.tsx', /uri=\{tutor\.avatarUrl\}/],
  ['app/xsr.tsx', /uri=\{role === 'tutor' \? null : booking\.tutor\?\.avatarUrl\}/],
  ['app/xns.tsx', /uri=\{who === 'tutor' \? null : tutor\.avatarUrl\}/],
  ['app/xtc.tsx', /uri=\{who === 'tutor' \? null : tutor\.avatarUrl\}/],
  ['app/c1.tsx', /uri=\{isTutor \? null : tutor\.avatarUrl\}/],
  ['app/c2.tsx', /uri=\{tutor\.avatarUrl\}/],
];
for (const [file, re] of screens) check(`${file} shows the tutor photo`, re.test(src(file)));

if (failed) {
  console.log(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nverify_tutor_avatar: all checks passed');
