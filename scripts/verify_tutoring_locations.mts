// Verifies the campus location catalog is readable to anon and students, but read-only.
//   pnpm dlx tsx scripts/verify_tutoring_locations.mts
import { createClient } from '@supabase/supabase-js';
import { api, auth, initSupabase } from '../packages/core/src/index.ts';
import { DEV_PASSWORD } from './_devPassword.mjs';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const PASSWORD = DEV_PASSWORD;
const tag = Date.now();
const email = `verify-locations-${tag}@crimson.ua.edu`;
const inactiveName = `Verify inactive location ${tag}`;
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
let userId: string | null = null;
let inactiveId: string | null = null;
let pass = 0;
let fail = 0;

if (!['127.0.0.1', 'localhost'].includes(new globalThis.URL(URL).hostname)) {
  throw new Error('verify_tutoring_locations only runs against local Supabase');
}

function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
}

initSupabase({ url: URL, anonKey: ANON });

try {
  const { data: inactive, error: inactiveError } = await admin
    .from('tutoring_locations')
    .insert({ university_id: 'ua', category: 'building', name: inactiveName, is_active: false })
    .select('id')
    .single();
  if (inactiveError || !inactive) throw inactiveError ?? new Error('Could not seed inactive location');
  inactiveId = inactive.id;

  const anonLocations = await api.locations.list();
  check('anon reads at least 60 active campus locations', anonLocations.length >= 60, `${anonLocations.length} rows`);
  check(
    'anon list includes Gorgas Library as a library',
    anonLocations.some((location) => location.name === 'Gorgas Library' && location.category === 'library'),
  );
  const anonInactive = await anon.from('tutoring_locations').select('id').eq('id', inactiveId);
  check(
    'inactive location is hidden from anon',
    !anonInactive.error && (anonInactive.data ?? []).length === 0,
    anonInactive.error?.message ?? `${anonInactive.data?.length ?? 0} rows`,
  );

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (createError || !created.user) throw createError ?? new Error('Could not create verification student');
  userId = created.user.id;
  const { error: profileError } = await admin.from('users').update({
    status: 'active',
    first_name: 'Verify',
    last_name: 'Locations',
    password_set_at: new Date().toISOString(),
    terms_accepted_at: new Date().toISOString(),
    terms_version: 'verify_tutoring_locations',
    guidelines_accepted_at: new Date().toISOString(),
    guidelines_version: 'verify_tutoring_locations',
  }).eq('id', userId);
  if (profileError) throw profileError;

  const signedIn = await auth.signInWithPassword(email, PASSWORD);
  if (!signedIn.ok) throw new Error(signedIn.error);
  const studentLocations = await api.locations.list();
  check('fresh student reads the catalog through api.locations.list()', studentLocations.length >= 60,
    `${studentLocations.length} rows`);

  const student = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: studentSignInError } = await student.auth.signInWithPassword({ email, password: PASSWORD });
  if (studentSignInError) throw studentSignInError;
  const attemptedInsert = await student
    .from('tutoring_locations')
    .insert({ university_id: 'ua', category: 'building', name: `Student insert ${tag}` })
    .select('id');
  check(
    'student cannot insert campus locations',
    !!attemptedInsert.error || (attemptedInsert.data ?? []).length === 0,
    attemptedInsert.error?.message ?? `${attemptedInsert.data?.length ?? 0} rows`,
  );
  if (attemptedInsert.data?.length) {
    await admin.from('tutoring_locations').delete().in('id', attemptedInsert.data.map((row) => row.id));
  }

  const firstActiveId = anonLocations[0]?.id;
  const attemptedUpdate = firstActiveId
    ? await student.from('tutoring_locations')
      .update({ name: anonLocations[0]!.name })
      .eq('id', firstActiveId)
      .select('id')
    : null;
  check(
    'student cannot update campus locations',
    !!attemptedUpdate && (!!attemptedUpdate.error || (attemptedUpdate.data ?? []).length === 0),
    attemptedUpdate?.error?.message ?? `${attemptedUpdate?.data?.length ?? 0} rows`,
  );
} finally {
  if (userId) {
    await admin.auth.admin.deleteUser(userId);
    await admin.from('users').delete().eq('id', userId);
  }
  if (inactiveId) await admin.from('tutoring_locations').delete().eq('id', inactiveId);
}

console.log(`\n${fail === 0 ? '✅ all' : `❌ ${fail} failed,`} ${pass} passed`);
process.exit(fail === 0 ? 0 : 1);
