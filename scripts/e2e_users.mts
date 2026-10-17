// e2e_users — create (idempotent) an E2E student + bookable tutor on the local
// stack for manual emulator testing. Mirrors verify_booking_chat.mts's setup but
// keeps the accounts (no cleanup) so the app can sign in interactively.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const URL = 'http://127.0.0.1:54321';
const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const PASSWORD = 'NootChat!Verify42';
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

const makeUser = async (email: string, first: string, last: string) => {
  // Reuse if it already exists so re-runs are idempotent.
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = list?.users.find((u) => u.email === email);
  const id = existing?.id
    ?? (await (async () => {
      const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
      if (error || !data.user) throw error ?? new Error(`createUser ${email} failed`);
      console.log(`created ${email} (${data.user.id})`);
      return data.user.id;
    })());
  if (existing) console.log(`exists  ${email} (${id})`);
  // Stamp flags every run: a db reset can drop public.users while auth.users survives.
  await admin.from('users').upsert({
    id, email, first_name: first, last_name: last,
    password_set_at: new Date().toISOString(),
    terms_accepted_at: new Date().toISOString(), terms_version: '2026-09-17',
    guidelines_accepted_at: new Date().toISOString(), guidelines_version: '2026-10-13',
  }, { onConflict: 'id' });
  return id;
};

const studentId = await makeUser('alex.rivera@crimson.ua.edu', 'Alex', 'Rivera');
const tutorId = await makeUser('sara.chen@crimson.ua.edu', 'Sara', 'Chen');

// The catalog comes from seed_courses.json via seed_demo.mjs, which is broken
// locally — after a db reset the table can be empty, so re-seed it ourselves.
let { data: course } = await admin
  .from('courses').select('course_code').eq('is_active', true).limit(1).maybeSingle();
if (!course) {
  const catalog = JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../supabase/seed_courses.json'), 'utf8'),
  ) as Record<string, unknown>[];
  for (let i = 0; i < catalog.length; i += 200) {
    const { error } = await admin.from('courses').upsert(catalog.slice(i, i + 200), { onConflict: 'course_id' });
    if (error) throw new Error(`courses seed: ${error.message}`);
  }
  console.log(`seeded course catalog (${catalog.length} courses)`);
  ({ data: course } = await admin.from('courses').select('course_code').eq('is_active', true).limit(1).maybeSingle());
}
if (!course) throw new Error('no active course in catalog even after seeding');
const courseCode = course.course_code as string;
console.log(`course  ${courseCode}`);

await admin.from('user_roles').upsert({ user_id: studentId, role: 'student' }, { onConflict: 'user_id,role' });
await admin.from('user_roles').upsert({ user_id: tutorId, role: 'tutor' }, { onConflict: 'user_id,role' });

const { error: profileError } = await admin.from('tutor_profiles').upsert({
  user_id: tutorId,
  bio: 'Junior studying biology. I tutored BSC discussion sections last year and can help with problem sets, lab prep and exam review.',
  subjects: [courseCode], hourly_rate: 40,
  approval_status: 'approved', submitted_at: new Date().toISOString(),
  stripe_charges_enabled: true, stripe_payouts_enabled: true,
}, { onConflict: 'user_id' });
if (profileError) throw profileError;

const { data: tc } = await admin.from('tutor_courses').select('id').eq('tutor_id', tutorId).eq('course_code', courseCode);
if (!tc?.length) {
  const { error: tcError } = await admin.from('tutor_courses').insert(
    { tutor_id: tutorId, course_code: courseCode, grade: 'A', hourly_rate: 40, sessions: 0 });
  if (tcError) throw tcError;
}
// Weekly availability every day 14:00–19:00 so the booking picker always has slots.
const { data: avail } = await admin.from('tutor_availability').select('id').eq('tutor_id', tutorId);
if (!avail?.length) {
  const { error: avError } = await admin.from('tutor_availability').insert(
    [0, 1, 2, 3, 4, 5, 6].map((d) => ({ tutor_id: tutorId, day_of_week: d, start_time: '14:00', end_time: '19:00' })),
  );
  if (avError) throw avError;
}

console.log(`tutor   sara.chen bookable on ${courseCode} @ $40/hr`);
console.log(`student ${studentId}\ntutor   ${tutorId}`);
console.log('DONE');
