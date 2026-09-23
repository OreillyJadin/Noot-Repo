// Tracker S1 — the app's user state must follow writes without a force-quit.
//
// The mobile MeProvider re-reads the user whenever @noot/core reports a change
// (onUserChanged) or an auth transition (auth.onAuthChange). This drives the REAL core
// against the LOCAL stack and checks both halves of that contract:
//   • a successful write fires exactly one change event, and a re-read returns the new data;
//   • a rejected write fires nothing (deny case);
//   • sign-in / sign-out surface as auth changes.
// Run: pnpm dlx tsx scripts/verify_s1_sync.mts
//
// Local only, on purpose — never reads EXPO_PUBLIC_SUPABASE_URL, which may point at production.
import { initSupabase, api, auth, onUserChanged } from '../packages/core/src/index.ts';

const URL = 'http://127.0.0.1:54321';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

let pass = 0;
let fail = 0;
async function check(name: string, fn: () => Promise<unknown>) {
  try {
    const r = await fn();
    console.log(`✅ ${name}${r === undefined ? '' : `: ${JSON.stringify(r)?.slice(0, 140)}`}`);
    pass++;
  } catch (e) {
    console.log(`❌ ${name}: ${(e as Error).message}`);
    fail++;
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
const tick = () => new Promise((r) => setTimeout(r, 50));

initSupabase({ url: URL, anonKey: ANON });

let userEvents = 0;
onUserChanged(() => { userEvents++; });
const authEvents: string[] = [];
auth.onAuthChange((c) => authEvents.push(c));

await check('sign-in surfaces as an auth change', async () => {
  const r = await auth.signInWithPassword('student@crimson.ua.edu', 'password123');
  assert(r.ok, r.error ?? 'sign-in failed');
  await tick();
  assert(authEvents.includes('signed_in'), `events: ${authEvents.join(',')}`);
  return authEvents;
});

const before = await api.getMe();
assert(before, 'no user row for the seeded student');

await check('updatePersonal fires one change and the re-read has the new major', async () => {
  userEvents = 0;
  const major = `S1 check ${Date.now()}`;
  await api.profile.updatePersonal({ major });
  assert(userEvents === 1, `expected 1 event, got ${userEvents}`);
  const after = await api.getMe();
  assert(after?.major === major, `re-read major was ${after?.major}`);
  return { major: after.major };
});

await check('uploadAvatar fires one change and the re-read has the new photo URL', async () => {
  userEvents = 0;
  // 1×1 PNG.
  const png = Uint8Array.from(
    atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='),
    (c) => c.charCodeAt(0),
  );
  const url = await api.profile.uploadAvatar(png, 'png', 'image/png');
  assert(userEvents === 1, `expected 1 event, got ${userEvents}`);
  const after = await api.getMe();
  assert(after?.avatarUrl === url, 're-read avatarUrl does not match the upload');
  return { avatarUrl: url.slice(-30) };
});

await check('setActiveRole fires one change (role switch path)', async () => {
  userEvents = 0;
  await api.profile.setActiveRole('student');
  assert(userEvents === 1, `expected 1 event, got ${userEvents}`);
});

await check('DENY: a rejected write fires no change event', async () => {
  userEvents = 0;
  const roles = (await api.getMe())?.roles ?? [];
  assert(!roles.includes('tutor'), 'seeded student unexpectedly holds tutor; pick another deny case');
  let threw = false;
  try {
    await api.profile.setActiveRole('tutor'); // 0007 trigger rejects a role not held
  } catch {
    threw = true;
  }
  assert(threw, 'setActiveRole(tutor) should have been rejected');
  assert(userEvents === 0, `expected 0 events, got ${userEvents}`);
});

// Put the seed back the way it was.
await api.profile.updatePersonal({ major: before.major });

await check('sign-out surfaces as an auth change', async () => {
  await auth.signOut();
  await tick();
  assert(authEvents.includes('signed_out'), `events: ${authEvents.join(',')}`);
  return authEvents;
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
