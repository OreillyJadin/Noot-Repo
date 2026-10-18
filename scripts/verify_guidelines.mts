// Verify Community Guidelines acceptance against the LOCAL stack.
// Needs: supabase start && node supabase/seed_demo.mjs
import { DEV_PASSWORD } from './_devPassword.mjs';
import { createClient } from '@supabase/supabase-js';
import { initSupabase, api, auth } from '../packages/core/src/index.ts';
import { GUIDELINES_VERSION } from '../apps/mobile/lib/guidelines.ts';

const URL = 'http://127.0.0.1:54321';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const results: { name: string; ok: boolean; detail?: string }[] = [];
const check = (name: string, ok: boolean, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

initSupabase({ url: URL, anonKey: ANON });
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
let studentId: string | undefined;
let tutor: ReturnType<typeof createClient> | undefined;

try {
  const { data: student, error: studentError } = await admin
    .from('users')
    .select('id')
    .eq('email', 'student@crimson.ua.edu')
    .single();
  if (studentError || !student) throw studentError ?? new Error('Demo student not found');
  studentId = student.id as string;

  const { error: clearError } = await admin
    .from('users')
    .update({ guidelines_accepted_at: null, guidelines_version: null })
    .eq('id', studentId);
  if (clearError) throw clearError;

  const { data: cleared, error: clearedError } = await admin
    .from('users')
    .select('guidelines_accepted_at, guidelines_version')
    .eq('id', studentId)
    .single();
  check(
    'guidelines columns exist and are null before acceptance',
    !clearedError && cleared?.guidelines_accepted_at === null && cleared?.guidelines_version === null,
    clearedError ? clearedError.message : '',
  );
  if (clearedError) throw clearedError;

  const signIn = await auth.signInWithPassword('student@crimson.ua.edu', DEV_PASSWORD);
  check('signed in as the demo student', signIn.ok, signIn.ok ? '' : signIn.error);
  if (!signIn.ok) throw new Error(signIn.error);

  await api.profile.acceptGuidelines(GUIDELINES_VERSION);
  const { data: saved, error: savedError } = await admin
    .from('users')
    .select('guidelines_accepted_at, guidelines_version')
    .eq('id', studentId)
    .single();
  check(
    'acceptGuidelines records timestamp and version',
    !savedError && !!saved?.guidelines_accepted_at && saved.guidelines_version === GUIDELINES_VERSION,
    savedError ? savedError.message : `version=${saved?.guidelines_version}`,
  );
  if (savedError) throw savedError;

  const me = await api.getMe();
  check(
    'api.getMe maps guidelinesAcceptedAt',
    me?.guidelinesAcceptedAt === saved?.guidelines_accepted_at,
    `mapped timestamp=${me?.guidelinesAcceptedAt ?? 'null'}`,
  );

  tutor = createClient(URL, ANON, { auth: { persistSession: false } });
  const tutorSignIn = await tutor.auth.signInWithPassword({
    email: 'sara@crimson.ua.edu',
    password: DEV_PASSWORD,
  });
  check('signed in as tutor Sara', !tutorSignIn.error, tutorSignIn.error?.message ?? '');
  if (tutorSignIn.error) throw tutorSignIn.error;

  const forgedTimestamp = '2020-01-01T00:00:00.000Z';
  const { data: attempted, error: attemptError } = await tutor
    .from('users')
    .update({ guidelines_accepted_at: forgedTimestamp })
    .eq('id', studentId)
    .select('id');
  const { data: afterAttempt, error: afterError } = await admin
    .from('users')
    .select('guidelines_accepted_at')
    .eq('id', studentId)
    .single();
  check(
    'tutor cannot update the student acceptance (self-only RLS)',
    !attemptError && !afterError && attempted?.length === 0 &&
      afterAttempt?.guidelines_accepted_at === saved?.guidelines_accepted_at,
    attemptError?.message ?? afterError?.message ?? `affected rows=${attempted?.length ?? 'unknown'}`,
  );
} catch (error) {
  check('verification completed without an unexpected error', false, String(error));
} finally {
  await auth.signOut().catch(() => {});
  await tutor?.auth.signOut().catch(() => {});
  if (studentId) {
    const { error } = await admin
      .from('users')
      .update({
        guidelines_accepted_at: new Date().toISOString(),
        guidelines_version: GUIDELINES_VERSION,
      })
      .eq('id', studentId);
    check('demo student guidelines acceptance restored', !error, error?.message ?? '');
  }
}

const failures = results.filter((result) => !result.ok);
console.log(`\n${results.length - failures.length} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
