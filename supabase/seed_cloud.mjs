// Full demo seed — populates the whole app with realistic, interconnected data so no
// screen looks empty: approved tutors (with weekly availability + courses), several
// students, and real bookings (upcoming + completed), conversations + messages, and
// approved reviews. Uses the Admin API (service role) so it works against LOCAL or CLOUD.
// Idempotent: re-running wipes this seed's bookings/messages first, then recreates them.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node supabase/seed_cloud.mjs
//
// Defaults target the local stack. Password for every account: "password123".
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const PASSWORD = 'password123';
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

// ── tutors ───────────────────────────────────────────────────────────────────
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

// Weekly availability per tutor (index-aligned). [dayOfWeek 0=Sun..6=Sat, start, end]
const AVAIL = [
  [[1, '14:00', '18:00'], [2, '14:00', '18:00'], [3, '16:00', '20:00'], [4, '14:00', '18:00'], [5, '12:00', '16:00']],
  [[1, '09:00', '12:00'], [3, '09:00', '12:00'], [5, '09:00', '13:00'], [6, '10:00', '14:00']],
  [[2, '17:00', '21:00'], [4, '17:00', '21:00'], [0, '13:00', '17:00']],
  [[1, '12:00', '15:00'], [2, '12:00', '15:00'], [3, '12:00', '15:00'], [4, '12:00', '15:00'], [5, '12:00', '15:00']],
  [[0, '10:00', '14:00'], [3, '18:00', '21:00'], [5, '15:00', '19:00'], [6, '09:00', '12:00']],
];

// ── students ─────────────────────────────────────────────────────────────────
// [email, first, last, year, major, gender, courses[]]
const STUDENTS = [
  ['student@crimson.ua.edu', 'Lindsay', 'Carter', 'Sophomore', 'Undecided', 'f', ['MGT 300', 'EC 110']],
  ['student1@crimson.ua.edu', 'Riley', 'Thompson', 'Freshman', 'Business', 'f', ['MGT 300']],
  ['student2@crimson.ua.edu', 'Jordan', 'Mills', 'Junior', 'Marketing', 'm', ['MGT 300', 'MKT 300']],
  ['student3@crimson.ua.edu', 'Priya', 'Shah', 'Sophomore', 'Economics', 'f', ['MGT 300', 'EC 110']],
];

const DAY = 86_400_000;

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

async function ensureUser(email, existing) {
  if (existing.has(email)) return existing.get(email);
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  // Created WITH its password, so the "password changed" trigger (0041) never fires for it.
  // Stamp it here or the app would start every seeded account at "Create your password".
  const stamp = await admin.from('users').update({ password_set_at: new Date().toISOString() }).eq('id', data.user.id);
  if (stamp.error) throw new Error(`password_set_at ${email}: ${stamp.error.message}`);
  existing.set(email, data.user.id);
  return data.user.id;
}

const chk = (label, { error }) => { if (error) throw new Error(`${label}: ${error.message}`); };

async function seedTutor(row, idx, existing) {
  const [email, first, last, year, major, gender, bio, grade, rating, sessions, courses] = row;
  const id = await ensureUser(email, existing);
  chk(`${email} users`, await admin.from('users').update({ first_name: first, last_name: last, year, major, gender }).eq('id', id));
  chk(`${email} role`, await admin.from('user_roles').upsert({ user_id: id, role: 'tutor' }, { onConflict: 'user_id,role' }));
  chk(`${email} profile`, await admin.from('tutor_profiles').upsert({
    user_id: id, bio, subjects: courses.map((c) => c[0]), hourly_rate: courses[0][2],
    approval_status: 'approved', rating_avg: rating, total_sessions: sessions, verified_grade: grade,
  }, { onConflict: 'user_id' }));
  await admin.from('tutor_courses').delete().eq('tutor_id', id);
  chk(`${email} courses`, await admin.from('tutor_courses').insert(
    courses.map((c) => ({ tutor_id: id, course_code: c[0], grade: c[1], hourly_rate: c[2], sessions: c[3] })),
  ));
  await admin.from('tutor_availability').delete().eq('tutor_id', id);
  const av = AVAIL[idx] ?? [];
  if (av.length) chk(`${email} availability`, await admin.from('tutor_availability').insert(
    av.map(([dow, st, et]) => ({ tutor_id: id, day_of_week: dow, start_time: st, end_time: et })),
  ));
  console.log(`✅ tutor  ${email.padEnd(26)} ${courses.length} courses · ${av.length} windows`);
  return id;
}

async function seedStudent(row, existing) {
  const [email, first, last, year, major, gender, courses] = row;
  const id = await ensureUser(email, existing);
  chk(`${email} users`, await admin.from('users').update({
    first_name: first, last_name: last, year, major, gender, courses, active_role: 'student',
  }).eq('id', id));
  console.log(`✅ student ${email.padEnd(25)} ${first} ${last}`);
  return id;
}

// One booking (+ optional review). `days` is signed: negative = past, positive = future.
function bookingRow(studentId, tutorId, { subject, rate, days, durationMin, type, status, hour = 15 }) {
  const scheduled = new Date(Date.now() + days * DAY);
  scheduled.setHours(hour, 0, 0, 0);
  const price = Math.round(rate * (durationMin / 60) * 100) / 100;
  return {
    student_id: studentId, tutor_id: tutorId, subject,
    scheduled_at: scheduled.toISOString(), duration_minutes: durationMin,
    price, platform_fee: 0, tutor_payout_amount: price,
    session_type: type,
    meeting_link: type === 'video' ? 'https://meet.noot.app/demo' : null,
    location: type === 'in_person' ? 'Gorgas Library, Fl 2' : null,
    status,
    cancellation_deadline: new Date(scheduled.getTime() - DAY).toISOString(),
    refund_status: 'not_applicable',
    stripe_payment_intent_id: `sim_pi_seed_${Math.random().toString(36).slice(2, 10)}`,
  };
}

async function main() {
  const existing = await existingIdByEmail();

  const tutorIds = {};
  for (let i = 0; i < TUTORS.length; i++) {
    const key = TUTORS[i][0].split('@')[0];
    tutorIds[key] = await seedTutor(TUTORS[i], i, existing);
  }
  const studentIds = {};
  for (const s of STUDENTS) {
    const key = s[0].split('@')[0];
    studentIds[key] = await seedStudent(s, existing);
  }

  // Wipe this seed's transactional data (bookings cascade to reviews) so re-runs are clean.
  const allStudents = Object.values(studentIds);
  await admin.from('bookings').delete().in('student_id', allStudents);
  for (const sid of allStudents) await admin.from('conversations').delete().eq('student_id', sid);

  // Booking plan: mix of upcoming (confirmed) + past (completed, reviewed) across pairs.
  const plan = [
    { s: 'student',  t: 'sara',  subject: 'MGT 300', rate: 28, days: 1,   dur: 60, type: 'video',     status: 'confirmed' },
    { s: 'student',  t: 'devon', subject: 'MGT 300', rate: 34, days: -9,  dur: 60, type: 'in_person', status: 'completed', review: [5, 'Explained the frameworks better than lecture. Booked again.'] },
    { s: 'student1', t: 'sara',  subject: 'MGT 300', rate: 28, days: 2,   dur: 90, type: 'in_person', status: 'confirmed' },
    { s: 'student1', t: 'devon', subject: 'MGT 300', rate: 34, days: -14, dur: 60, type: 'video',     status: 'completed', review: [5, 'Super patient and great with exam prep.'] },
    { s: 'student2', t: 'maya',  subject: 'MGT 300', rate: 22, days: 3,   dur: 60, type: 'in_person', status: 'confirmed' },
    { s: 'student2', t: 'sara',  subject: 'MGT 300', rate: 28, days: -6,  dur: 60, type: 'video',     status: 'completed', review: [5, 'Knows the material cold. Highly recommend.'] },
    { s: 'student3', t: 'nina',  subject: 'MGT 300', rate: 30, days: -8,  dur: 90, type: 'in_person', status: 'completed', review: [4, 'Met at Gorgas and went through the whole study guide.'] },
    { s: 'student3', t: 'alex',  subject: 'MGT 300', rate: 25, days: 2,   dur: 60, type: 'video',     status: 'confirmed' },
  ];

  let bk = 0, rv = 0, msg = 0;
  const convCache = {};
  for (const p of plan) {
    const sid = studentIds[p.s], tid = tutorIds[p.t];
    const { data: booking, error: bErr } = await admin
      .from('bookings')
      .insert(bookingRow(sid, tid, { subject: p.subject, rate: p.rate, days: p.days, durationMin: p.dur, type: p.type, status: p.status }))
      .select('id')
      .single();
    chk(`booking ${p.s}->${p.t}`, { error: bErr });
    bk++;

    // Approved review for completed sessions (student rates tutor).
    if (p.review) {
      chk(`review ${p.s}->${p.t}`, await admin.from('reviews').insert({
        booking_id: booking.id, reviewer_id: sid, subject_user_id: tid,
        rating: p.review[0], comment: p.review[1], approval_status: 'approved',
        reviewed_at: new Date().toISOString(),
      }));
      rv++;
    }

    // Conversation + a couple messages per pair (upsert conversation, idempotent-ish).
    const ckey = `${sid}:${tid}`;
    if (!convCache[ckey]) {
      const { data: conv, error: cErr } = await admin
        .from('conversations')
        .upsert({ student_id: sid, tutor_id: tid }, { onConflict: 'student_id,tutor_id' })
        .select('id')
        .single();
      chk(`conversation ${p.s}->${p.t}`, { error: cErr });
      convCache[ckey] = conv.id;
      chk('messages', await admin.from('messages').insert([
        { conversation_id: conv.id, sender_id: sid, content: `Hi! Looking forward to our ${p.subject} session.` },
        { conversation_id: conv.id, sender_id: tid, content: 'Great — see you then. Bring any practice problems you want to go over.' },
      ]));
      msg += 2;
    }
  }

  console.log(`\n✅ activity: ${bk} bookings · ${rv} reviews · ${Object.keys(convCache).length} conversations · ${msg} messages`);

  // --- ambassador + referrals (populate the ambassador dashboard with a full pipeline) ---
  const ambId = await ensureUser('ambassador@crimson.ua.edu', existing);
  chk('ambassador users', await admin.from('users').update({
    first_name: 'Amara', last_name: 'Bell', year: 'Junior', major: 'Communications', gender: 'f', active_role: 'ambassador',
  }).eq('id', ambId));
  chk('ambassador role', await admin.from('user_roles').upsert({ user_id: ambId, role: 'ambassador' }, { onConflict: 'user_id,role' }));
  const AMB_CODE = 'NOOT-DEMO01';
  chk('ambassador profile', await admin.from('ambassador_profiles').upsert({ user_id: ambId, referral_code: AMB_CODE }, { onConflict: 'user_id' }));

  const referred = [studentIds.student1, studentIds.student2, studentIds.student3].filter(Boolean);
  await admin.from('referrals').delete().in('referred_user_id', referred); // cascades to bonuses
  const { data: refs, error: refErr } = await admin.from('referrals').insert(
    referred.map((sid) => ({ ambassador_id: ambId, referred_user_id: sid, referred_role: 'student', referral_code_used: AMB_CODE })),
  ).select('id, referred_user_id');
  chk('referrals', { error: refErr });
  const refByStudent = Object.fromEntries((refs ?? []).map((r) => [r.referred_user_id, r.id]));
  // student1 = bonus paid · student2 = bonus pending · student3 = signed up (no bonus)
  const bonuses = [];
  if (refByStudent[studentIds.student1]) bonuses.push({ ambassador_id: ambId, referral_id: refByStudent[studentIds.student1], bonus_amount: 5, status: 'paid', paid_at: new Date().toISOString() });
  if (refByStudent[studentIds.student2]) bonuses.push({ ambassador_id: ambId, referral_id: refByStudent[studentIds.student2], bonus_amount: 5, status: 'pending' });
  if (bonuses.length) chk('referral_bonuses', await admin.from('referral_bonuses').insert(bonuses));
  const paidTotal = bonuses.filter((b) => b.status === 'paid').reduce((s, b) => s + b.bonus_amount, 0);
  chk('ambassador totals', await admin.from('ambassador_profiles').update({ total_referrals: referred.length, total_earned: paidTotal }).eq('user_id', ambId));
  console.log(`✅ ambassador ambassador@crimson.ua.edu · code ${AMB_CODE} · ${referred.length} referrals · ${bonuses.length} bonuses ($${paidTotal} paid)`);
  console.log('\nLogins (password: ' + PASSWORD + ')');
  console.log('  students: ' + STUDENTS.map((s) => s[0]).join(', '));
  console.log('  tutors:   ' + TUTORS.map((t) => t[0]).join(', '));
}

main().then(() => console.log('\nDone.')).catch((e) => { console.error('❌', e.message); process.exit(1); });
