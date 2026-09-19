// App Review demo data (APP_REVIEW_TICKETS.md T8). Idempotent — safe to re-run.
//
//   node supabase/seed_app_review.mjs                 # dry run, prints the plan
//   node supabase/seed_app_review.mjs --apply         # write it
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
//     node supabase/seed_app_review.mjs --apply       # against the cloud project
//
// WHY THIS EXISTS
// The original App Review data was applied straight to production as an untracked
// migration (see 0035-0037), so it could not be re-run or reviewed. By 2026-09-18 it had
// rotted in three ways at once:
//
//   1. Every seeded booking was in the PAST, so the reviewer's Upcoming tab was empty —
//      while the ASC checklist asks for the student account to have an upcoming session.
//   2. Every tutor's stripe_connect_account_id was a fake string ('acct_demo_tutor1'),
//      which Stripe rejects with account_invalid. tutor_profiles.stripe_charges_enabled
//      said true, so nothing caught it up front: a reviewer could book and be charged a
//      hold, then complete-session would fail on assertPayoutReady (T18) and the session
//      could never be completed.
//   3. Every row was session_type 'video' with a meet.example.com link, but T14 removed
//      video sessions — the exact "sells something it can't deliver" problem Apple cited.
//
// Dates here are relative to run time, so re-running before a submission refreshes them.
// Contains NO credentials: it only references existing accounts by email and never
// creates or modifies an auth user. Reviewer passwords stay out of the repo
// (APP_REVIEW_START_HERE.md).
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const APPLY = process.argv.includes('--apply');

/**
 * A Connect account that can actually receive a transfer, for the demo tutors.
 *
 * Deliberately has NO default. Connect ids do not cross Stripe accounts, so a hardcoded id
 * goes stale the moment the account changes — which is exactly what happened at the
 * sandbox -> live cutover on 2026-09-19, when the previous default (`acct_1TwADu1nmgWvUthV`,
 * a sandbox account) became invalid. Leaving it unset skips the repoint entirely and leaves
 * the tutors with no payout account, which is the honest state: they must onboard.
 *
 * Set it only to an id you have confirmed under the CURRENT keys, e.g.
 *   curl https://api.stripe.com/v1/accounts/acct_xxx -u "$STRIPE_SECRET_KEY_LIVE:"
 */
const CONNECT_ACCOUNT = process.env.DEMO_CONNECT_ACCOUNT ?? null;

/** Must match FEE_RATE in supabase/functions/_shared/booking.ts. */
const FEE_RATE = 0.175;
const round2 = (n) => Math.round(n * 100) / 100;

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const IS_LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0)(:|\/|$)/.test(URL);

const STUDENT_REVIEW = 'student.review@watchmenventures.com';
const TUTOR_REVIEW = 'tutor.review@watchmenventures.com';

const day = (n) => new Date(Date.now() + n * 86400_000).toISOString();

/**
 * Fixed ids so re-running replaces rather than duplicates. Prices are NOT written here —
 * they are derived from tutor_courses.hourly_rate exactly as resolveBooking() does, so
 * demo prices can never disagree with what the server would compute for the same session.
 */
const PLAN = [
  // The reviewer's student account: something upcoming, something pending, some history.
  { id: 'a0000001-0000-4000-8000-000000000001', student: STUDENT_REVIEW, tutor: TUTOR_REVIEW,
    course: 'MATH 125', minutes: 60, when: 2, status: 'confirmed', location: 'Gorgas Library, Room 205' },
  { id: 'a0000001-0000-4000-8000-000000000002', student: STUDENT_REVIEW, tutor: 'tutor3@crimson.ua.edu',
    course: 'ST 260', minutes: 60, when: 4, status: 'pending', location: 'Lloyd Hall, Room 32' },
  { id: 'a0000001-0000-4000-8000-000000000003', student: STUDENT_REVIEW, tutor: 'tutor2@crimson.ua.edu',
    course: 'CH 101', minutes: 90, when: -7, status: 'completed', location: 'Science and Engineering Complex',
    rating: 5, comment: 'Really clear explanations, walked me through every step.' },

  // The reviewer's tutor account needs its own upcoming session and some history.
  { id: 'a0000001-0000-4000-8000-000000000004', student: 'student1@crimson.ua.edu', tutor: TUTOR_REVIEW,
    course: 'ST 260', minutes: 60, when: 3, status: 'confirmed', location: 'Bidgood Hall, Room 110' },
  { id: 'a0000001-0000-4000-8000-000000000005', student: 'student1@crimson.ua.edu', tutor: TUTOR_REVIEW,
    course: 'MATH 126', minutes: 90, when: -14, status: 'completed', location: 'Gorgas Library, Room 205',
    rating: 5, comment: 'Patient and well prepared. Booked again for next week.' },
  { id: 'a0000001-0000-4000-8000-000000000006', student: 'student2@crimson.ua.edu', tutor: 'tutor1@crimson.ua.edu',
    course: 'CS 200', minutes: 60, when: -21, status: 'completed', location: 'Shelby Hall, Room 1093',
    rating: 4, comment: 'Good session, helped me debug my assignment.' },
];

const fail = (msg) => { console.error(`❌ ${msg}`); process.exit(1); };

console.log(`Target: ${IS_LOCAL ? 'LOCAL' : 'CLOUD'} (${URL})`);
console.log(
  CONNECT_ACCOUNT
    ? `Connect account for demo tutors: ${CONNECT_ACCOUNT}`
    : 'Connect account for demo tutors: (none — set DEMO_CONNECT_ACCOUNT to repoint them)',
);
console.log(APPLY ? 'Mode: APPLY\n' : 'Mode: DRY RUN (pass --apply to write)\n');

// --- resolve accounts by email; never create them ---
const emails = [...new Set(PLAN.flatMap((b) => [b.student, b.tutor]))];
const { data: users, error: userErr } = await admin.from('users').select('id, email').in('email', emails);
if (userErr) fail(`user lookup failed: ${userErr.message}`);
const idFor = Object.fromEntries((users ?? []).map((u) => [u.email, u.id]));
const missing = emails.filter((e) => !idFor[e]);
if (missing.length) fail(`these demo accounts do not exist on this project: ${missing.join(', ')}`);

// --- derive prices from the tutor's real rate for that course ---
const rows = [];
for (const b of PLAN) {
  const tutorId = idFor[b.tutor];
  const { data: course, error } = await admin
    .from('tutor_courses').select('hourly_rate')
    .eq('tutor_id', tutorId).eq('course_code', b.course).maybeSingle();
  if (error) fail(`rate lookup failed for ${b.tutor} / ${b.course}: ${error.message}`);
  if (!course) fail(`${b.tutor} does not teach ${b.course} — fix the plan or the tutor_courses row`);

  const price = round2((Number(course.hourly_rate) * b.minutes) / 60);
  const platformFee = round2(price * FEE_RATE);
  const scheduledAt = day(b.when);
  rows.push({
    booking: {
      id: b.id,
      student_id: idFor[b.student],
      tutor_id: tutorId,
      subject: b.course,
      scheduled_at: scheduledAt,
      duration_minutes: b.minutes,
      price,
      platform_fee: platformFee,
      tutor_payout_amount: round2(price - platformFee),
      // Always in_person: T14 removed video sessions, and a seeded 'video' row renders as
      // "Online" with no way to meet — the thing Apple objected to.
      session_type: 'in_person',
      location: b.location,
      meeting_link: null,
      status: b.status,
      cancellation_deadline: new Date(new Date(scheduledAt).getTime() - 86400_000).toISOString(),
      refund_status: 'not_applicable',
      refund_percent: 0,
      dispute_status: 'none',
      // Deliberately null: no real Stripe hold exists for seeded rows, and
      // complete-session only enters its Stripe branch for a real `pi_` id.
      stripe_payment_intent_id: null,
    },
    review: b.rating == null ? null : {
      booking_id: b.id,
      reviewer_id: idFor[b.student],
      subject_user_id: tutorId,
      rating: b.rating,
      comment: b.comment,
      approval_status: 'approved',
    },
  });
}

for (const { booking: bk } of rows) {
  const when = new Date(bk.scheduled_at);
  const rel = Math.round((when - Date.now()) / 86400_000);
  console.log(
    `  ${bk.status.padEnd(9)} ${bk.subject.padEnd(9)} $${String(bk.price).padStart(6)} ` +
    `${rel >= 0 ? `in ${rel}d` : `${-rel}d ago`}  ${bk.location}`,
  );
}

if (!APPLY) {
  console.log('\nDry run — nothing written.');
  process.exit(0);
}

// --- 1. optionally give the demo tutors a Connect account that can receive a transfer ---
if (CONNECT_ACCOUNT) {
  const { data: fixed, error: connectErr } = await admin
    .from('tutor_profiles')
    .update({ stripe_connect_account_id: CONNECT_ACCOUNT, stripe_charges_enabled: true })
    .in('user_id', [...new Set(PLAN.map((b) => idFor[b.tutor]))])
    .select('user_id');
  if (connectErr) fail(`connect repoint failed: ${connectErr.message}`);
  console.log(`\n✅ repointed ${fixed?.length ?? 0} demo tutor payout account(s) to ${CONNECT_ACCOUNT}`);
} else {
  console.log('\n⏭️  skipped payout repoint (DEMO_CONNECT_ACCOUNT not set) — demo tutors have no');
  console.log('    payout account, so a booked session cannot be completed until one onboards.');
}

// --- 2. replace the seeded bookings (reviews first: they reference booking_id) ---
const ids = PLAN.map((b) => b.id);
const { error: delRev } = await admin.from('reviews').delete().in('booking_id', ids);
if (delRev) fail(`review cleanup failed: ${delRev.message}`);
const { error: delBk } = await admin.from('bookings').delete().in('id', ids);
if (delBk) fail(`booking cleanup failed: ${delBk.message}`);

const { error: insBk } = await admin.from('bookings').insert(rows.map((r) => r.booking));
if (insBk) fail(`booking insert failed: ${insBk.message}`);
console.log(`✅ seeded ${rows.length} bookings`);

const reviews = rows.map((r) => r.review).filter(Boolean);
const { error: insRev } = await admin.from('reviews').insert(reviews);
if (insRev) fail(`review insert failed: ${insRev.message}`);
console.log(`✅ seeded ${reviews.length} ratings`);

console.log('\nDone.');
