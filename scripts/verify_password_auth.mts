// Verification for the rebuilt auth flow (sign-up verification + set-password +
// email/password sign-in), run against the live local Supabase stack.
import { initSupabase, auth } from '../packages/core/src/index.ts';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

initSupabase({ url: URL, anonKey: ANON });

let pass = 0, fail = 0;
const ok = (label: string, cond: boolean, extra = '') => {
  console.log(`${cond ? '✅' : '❌'} ${label}${extra ? ' — ' + extra : ''}`);
  cond ? pass++ : fail++;
};

const uniq = Date.now();
const badEmail = `otp_${uniq}@gmail.com`;
const eduEmail = `otp_${uniq}@crimson.ua.edu`;
const pwEmail = `pw_${uniq}@crimson.ua.edu`;

// 1. .edu gate rejects a non-campus sign-up verification (OTP inserts the user → trigger fires)
const bad = await auth.sendSignupVerification(badEmail, 'Bad', 'User');
ok('non-.edu sign-up verification rejected by campus gate', !bad.ok, bad.error ?? '');

// 2. .edu sign-up verification sends (user provisioned, email queued to Mailpit)
const good = await auth.sendSignupVerification(eduEmail, 'Ada', 'Lovelace');
ok('.edu sign-up verification sends', good.ok, good.error ?? '');

// 3. set-password + password sign-in round-trip via a throwaway .edu account
const created = await auth.signInWithPassword(pwEmail, 'password123'); // sign-up + immediate session (local)
ok('throwaway account has a live session', created.ok && !!(await auth.getSessionUserId()), created.error ?? '');

const setP = await auth.setPassword('newpassword456');
ok('setPassword succeeds on the live session', setP.ok, setP.error ?? '');

await auth.signOut();
const newOk = await auth.signInWithPassword(pwEmail, 'newpassword456');
ok('sign in with the NEW password works', newOk.ok, newOk.error ?? '');

await auth.signOut();
const oldFail = await auth.signInWithPassword(pwEmail, 'password123');
ok('the OLD password no longer works', !oldFail.ok);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
