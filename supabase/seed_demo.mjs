// Demo seed — creates approved tutors + a dev student/tutor so the wired screens
// have real data to show. Idempotent: safe to re-run. Uses the admin API (service
// role), so it works against local AND cloud.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node supabase/seed_demo.mjs
//
// Defaults target the local stack. Dev password for every account: "password123".
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const PASSWORD = 'password123';

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

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

const DEV_STUDENT = ['student@crimson.ua.edu', 'Lindsay', 'Carter', 'Sophomore', 'Undecided', 'f'];

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

async function seedTutor(row) {
  const [email, first, last, year, major, gender, bio, grade, rating, sessions, courses] = row;
  const id = await ensureUser(email);
  const chk = (label, { error }) => { if (error) throw new Error(`${email} ${label}: ${error.message}`); };
  chk('users', await admin.from('users').update({ first_name: first, last_name: last, year, major, gender }).eq('id', id));
  chk('role', await admin.from('user_roles').upsert({ user_id: id, role: 'tutor' }, { onConflict: 'user_id,role' }));
  chk('profile', await admin.from('tutor_profiles').upsert({
    user_id: id, bio, subjects: courses.map((c) => c[0]), hourly_rate: courses[0][2],
    approval_status: 'approved', rating_avg: rating, total_sessions: sessions, verified_grade: grade,
  }, { onConflict: 'user_id' }));
  await admin.from('tutor_courses').delete().eq('tutor_id', id);
  chk('courses', await admin.from('tutor_courses').insert(
    courses.map((c) => ({ tutor_id: id, course_code: c[0], grade: c[1], hourly_rate: c[2], sessions: c[3] })),
  ));
  console.log(`✅ tutor ${email} (${courses.length} courses)`);
}

const [se, sf, sl, sy, sm, sg] = DEV_STUDENT;
const sid = await ensureUser(se);
await admin.from('users').update({ first_name: sf, last_name: sl, year: sy, major: sm, gender: sg }).eq('id', sid);
console.log(`✅ dev student ${se}`);
for (const row of TUTORS) await seedTutor(row);
console.log(`\nDone. Dev login — student: ${se} · tutor: ${TUTORS[0][0]} · password: ${PASSWORD}`);
