// Demo seed — creates approved tutors + a dev student/tutor so the wired screens
// have real data to show. Idempotent: safe to re-run. Uses the admin API (service
// role), so it works against local AND cloud.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node supabase/seed_demo.mjs
//
// Defaults target the local stack. Dev password for every account: "password123".
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const PASSWORD = 'password123';

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

// Is this pointed at a local stack, or at a real project? The script accepts SUPABASE_URL, and
// the demo accounts already exist on production — so it HAS been aimed at a cloud project
// before. That's fine for demo tutors; it is NOT fine for the admin accounts below.
const IS_LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0|host\.docker\.internal)(:|\/|$)/.test(URL);
if (!IS_LOCAL) {
  console.warn(`⚠️  Target is NOT a local stack: ${URL}`);
  console.warn('   Demo tutors/student will be written to that project.');
}

// The UA course catalog. Course pickers (My courses, the tutor's course list, search
// suggestions) all read `courses`, so without this local dev has no courses to pick and the
// pickers look broken. This is a real slice of the production catalog — the subjects the demo
// data uses plus the big intro subjects — not invented codes, so what you pick locally matches
// what exists in production.
// NB: resolved via path, not `new URL(...)` — this module shadows the global URL with the
// Supabase endpoint constant a few lines up.
const HERE = dirname(fileURLToPath(import.meta.url));
const COURSES = JSON.parse(readFileSync(join(HERE, 'seed_courses.json'), 'utf8'));

async function seedCourses() {
  // Chunked: a single 500-row insert is fine, but this keeps the request comfortably small
  // and gives a useful error if one batch trips a constraint.
  for (let i = 0; i < COURSES.length; i += 200) {
    const batch = COURSES.slice(i, i + 200);
    const { error } = await admin.from('courses').upsert(batch, { onConflict: 'course_id' });
    if (error) throw new Error(`courses: ${error.message}`);
  }
  console.log(`✅ course catalog (${COURSES.length} courses)`);
}

// [email, first, last, year, major, gender, bio, verifiedGrade, ratingAvg, totalSessions,
//  courses: [code, grade, rate, sessions][]]
const TUTORS = [
  ['sara@crimson.ua.edu', 'Sara', 'Williams', 'Senior', 'Management', 'f',
    'Senior in Management, minoring in Econ. I took MGT 300 with Prof. Reynolds and pulled an A — I know exactly what shows up on his exams.', 'A', 4.9, 48,
    [['MGT 300', 'A', 28, 48], ['MGT 301', 'A-', 26, 12], ['EC 110', 'A', 22, 9]]],
  ['devon@crimson.ua.edu', 'Devon', 'Reynolds', 'Grad', 'MBA', 'm',
    "First-year MBA and former undergrad TA for MGT 300. I've coached 70+ sessions on this exact course.", 'A', 5.0, 71,
    [['MGT 300', 'A', 34, 52], ['MGT 410', 'A', 38, 19]]],
  ['maya@crimson.ua.edu', 'Maya', 'Patel', 'Junior', 'Marketing', 'f',
    "Junior in Marketing. MGT 300 clicked for me once I stopped memorizing and started drawing the frameworks out.", 'A-', 4.8, 23,
    [['MGT 300', 'A-', 22, 18], ['MKT 300', 'A', 24, 14]]],
  ['alex@crimson.ua.edu', 'Alex', 'Johnson', 'Senior', 'Finance', 'm',
    'Finance senior. I tutor MGT 300 and the quantitative side of the business core.', 'A', 4.7, 31,
    [['MGT 300', 'A', 25, 21], ['FI 302', 'A', 30, 16]]],
  ['nina@crimson.ua.edu', 'Nina', 'Kim', 'Grad', 'Management', 'f',
    'PhD student in Management and current MGT 300 lab instructor. I teach this material every semester.', 'A', 4.9, 56,
    [['MGT 300', 'A', 30, 44], ['MGT 486', 'A', 40, 12]]],
];

// Recurring weekly availability per tutor (index-aligned with TUTORS above).
// [dayOfWeek (0=Sun … 6=Sat), startTime "HH:MM", endTime "HH:MM"]. Varied so each
// tutor's booking calendar looks different, with weekday + weekend coverage.
const AVAIL = [
  // Sara — weekday afternoons/evenings + Fri midday
  [[1, '14:00', '18:00'], [2, '14:00', '18:00'], [3, '16:00', '20:00'], [4, '14:00', '18:00'], [5, '12:00', '16:00']],
  // Devon — mornings, incl. Saturday
  [[1, '09:00', '12:00'], [3, '09:00', '12:00'], [5, '09:00', '13:00'], [6, '10:00', '14:00']],
  // Maya — evenings + Sunday afternoon
  [[2, '17:00', '21:00'], [4, '17:00', '21:00'], [0, '13:00', '17:00']],
  // Alex — consistent midday Mon–Fri
  [[1, '12:00', '15:00'], [2, '12:00', '15:00'], [3, '12:00', '15:00'], [4, '12:00', '15:00'], [5, '12:00', '15:00']],
  // Nina — weekend-heavy + Wed evening
  [[0, '10:00', '14:00'], [3, '18:00', '21:00'], [5, '15:00', '19:00'], [6, '09:00', '12:00']],
];

const DEV_STUDENT = ['student@crimson.ua.edu', 'Lindsay', 'Carter', 'Sophomore', 'Undecided', 'f'];

// Admin accounts. Without at least one of these the Admin panel is unreachable locally (the
// entry point is gated on roles.includes('admin')), and the admin team chat needs two to be
// worth looking at. The 'admin' role can only be granted with the service role — RLS blocks
// clients from writing it, which is why it's seeded here rather than in-app.
// [email, first, last]
const ADMINS = [
  ['admin@crimson.ua.edu', 'Jordan', 'Blake'],
  ['admin2@crimson.ua.edu', 'Riley', 'Chen'],
];

async function existingIdByEmail() {
  const map = new Map();
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users) map.set(u.email, u.id);
    if (data.users.length < 1000) break;
    page += 1;
  }
  return map;
}

async function ensureUser(email) {
  const existing = await existingIdByEmail();
  if (existing.has(email)) return existing.get(email);
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  return data.user.id;
}

async function seedTutor(row, idx) {
  const [email, first, last, year, major, gender, bio, grade, rating, sessions, courses] = row;
  const id = await ensureUser(email);
  const chk = (label, { error }) => { if (error) throw new Error(`${email} ${label}: ${error.message}`); };
  chk('users', await admin.from('users').update({ first_name: first, last_name: last, year, major, gender }).eq('id', id));
  chk('role', await admin.from('user_roles').upsert({ user_id: id, role: 'tutor' }, { onConflict: 'user_id,role' }));
  chk('profile', await admin.from('tutor_profiles').upsert({
    user_id: id, bio, subjects: courses.map((c) => c[0]), hourly_rate: courses[0][2],
    approval_status: 'approved', rating_avg: rating, total_sessions: sessions, verified_grade: grade,
    // An approved application was submitted (0038). Not grade-verified: nobody is by default.
    submitted_at: new Date().toISOString(),
  }, { onConflict: 'user_id' }));
  await admin.from('tutor_courses').delete().eq('tutor_id', id);
  chk('courses', await admin.from('tutor_courses').insert(
    courses.map((c) => ({ tutor_id: id, course_code: c[0], grade: c[1], hourly_rate: c[2], sessions: c[3] })),
  ));
  await admin.from('tutor_availability').delete().eq('tutor_id', id);
  const av = AVAIL[idx] ?? [];
  if (av.length) {
    chk('availability', await admin.from('tutor_availability').insert(
      av.map(([dow, st, et]) => ({ tutor_id: id, day_of_week: dow, start_time: st, end_time: et })),
    ));
  }
  console.log(`✅ tutor ${email} (${courses.length} courses, ${av.length} availability windows)`);
}

await seedCourses();

const [se, sf, sl, sy, sm, sg] = DEV_STUDENT;
const sid = await ensureUser(se);
await admin.from('users').update({ first_name: sf, last_name: sl, year: sy, major: sm, gender: sg }).eq('id', sid);
console.log(`✅ dev student ${se}`);
for (let i = 0; i < TUTORS.length; i++) await seedTutor(TUTORS[i], i);

// ADMIN ACCOUNTS ARE LOCAL-ONLY BY DEFAULT.
// These are created with the published dev password and granted the 'admin' role, which now
// also reads the private admin team chat (0024). Creating them on a real project would mint a
// live admin login with a password that's written down in CLAUDE.md, and would overwrite the
// name on any existing account at the same address. Local dev needs them (the Admin panel is
// unreachable without one); production must never get them by accident.
const seedAdmins = IS_LOCAL || process.env.SEED_ADMINS === '1';
if (!seedAdmins) {
  console.log(`⏭️  skipping admin accounts — target is not local (set SEED_ADMINS=1 to force)`);
}
for (const [ae, af, al] of seedAdmins ? ADMINS : []) {
  const aid = await ensureUser(ae);
  const nameRes = await admin.from('users').update({ first_name: af, last_name: al }).eq('id', aid);
  if (nameRes.error) throw new Error(`${ae} users: ${nameRes.error.message}`);
  const roleRes = await admin
    .from('user_roles')
    .upsert({ user_id: aid, role: 'admin' }, { onConflict: 'user_id,role' });
  if (roleRes.error) throw new Error(`${ae} role: ${roleRes.error.message}`);
  console.log(`✅ admin ${ae}`);
}

console.log(
  `\nDone. Dev login — student: ${se} · tutor: ${TUTORS[0][0]}` +
    (seedAdmins ? ` · admin: ${ADMINS[0][0]}` : '') +
    ` · password: ${PASSWORD}`,
);
