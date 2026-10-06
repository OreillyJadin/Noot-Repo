// Verification for the rebuilt auth flow (sign-up verification + set-password +
// email/password sign-in), run against the live local Supabase stack.
import { createClient } from '@supabase/supabase-js';
import { initSupabase, auth } from '../packages/core/src/index.ts';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

initSupabase({ url: URL, anonKey: ANON });
const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });

let pass = 0, fail = 0;
const ok = (label: string, cond: boolean, extra = '') => {
  console.log(`${cond ? '✅' : '❌'} ${label}${extra ? ' — ' + extra : ''}`);
  cond ? pass++ : fail++;
};

const uniq = Date.now();
const badEmail = `otp_${uniq}@gmail.com`;
const eduEmail = `otp_${uniq}@crimson.ua.edu`;
const pwEmail = `pw_${uniq}@crimson.ua.edu`;

try {
  // 1. .edu gate rejects a non-campus sign-up verification (OTP inserts the user → trigger fires)
  const bad = await auth.sendSignupVerification(badEmail, 'Bad', 'User');
  ok('non-.edu sign-up verification rejected by campus gate', !bad.ok, bad.error ?? '');

  // 2. .edu sign-up verification sends (user provisioned, email queued to Mailpit)
  const good = await auth.sendSignupVerification(eduEmail, 'Ada', 'Lovelace');
  ok('.edu sign-up verification sends', good.ok, good.error ?? '');

  // 3. set-password + password sign-in round-trip via a throwaway .edu account.
  // signInWithPassword only signs IN (sign-up is passwordless), so the account is provisioned
  // under the service role first — standing in for a verified sign-up.
  const { error: cErr } = await svc.auth.admin.createUser({
    email: pwEmail, password: 'password123', email_confirm: true,
  });
  if (cErr) throw cErr;
  const created = await auth.signInWithPassword(pwEmail, 'password123');
  ok('throwaway account has a live session', created.ok && !!(await auth.getSessionUserId()), created.error ?? '');

  const setP = await auth.setPassword('Newpassword456!');
  ok('setPassword succeeds on the live session', setP.ok, setP.error ?? '');

  await auth.signOut();
  const newOk = await auth.signInWithPassword(pwEmail, 'Newpassword456!');
  ok('sign in with the NEW password works', newOk.ok, newOk.error ?? '');

  await auth.signOut();
  const oldFail = await auth.signInWithPassword(pwEmail, 'password123');
  ok('the OLD password no longer works', !oldFail.ok);
} finally {
  // Don't leave the throwaway accounts behind on the local stack. public.users doesn't
  // cascade from auth.users (migration 0026), so remove both halves.
  const { data: leftovers } = await svc.from('users').select('id').in('email', [eduEmail, pwEmail]);
  for (const u of leftovers ?? []) {
    await svc.auth.admin.deleteUser(u.id as string);
    await svc.from('users').delete().eq('id', u.id);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
