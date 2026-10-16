// Shared booking price authority (APP_REVIEW_TICKETS.md T5).
//
// The server is the ONLY place a booking price may be computed. Before this existed,
// create-payment-intent trusted `amountCents` and confirm-booking trusted `price`, both
// straight from the client — and complete-session transfers `tutor_payout_amount` out of
// the platform balance, so an inflated price against a tiny hold was a real cash-out.
//
// Both functions call resolveBooking() and use ONLY what it returns. Nothing about money
// or tutor eligibility is read from the request body.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { splitPrice, studentFeeFor } from './fees.ts';
import { getPayoutStatus, type PayoutStatus } from './connect.ts';

// The tutor-side split is computed on the session price; the student fee is added to the
// held amount separately.

/**
 * How far ahead a session may be booked, in days. Kept at 6 because payment is a
 * manual-capture hold and card authorizations lapse after about 7 days (T6). Must stay
 * in step with BOOKING_HORIZON_DAYS in apps/mobile/lib/data.ts.
 */
export const BOOKING_HORIZON_DAYS = 6;

export type ResolveBookingInput = {
  studentId: string;
  tutorId: unknown;
  courseCode: unknown;
  durationMinutes: unknown;
  scheduledAt: unknown;
};

/**
 * True when either direction of user_blocks exists between the pair. Mirrors
 * is_blocked_between() in 0028_reports_and_blocks.sql, for service-role writes
 * that bypass the block check inside the messages_insert policy. Read off the
 * table rather than the RPC: that function is granted only to `authenticated`.
 */
export async function isBlockedBetween(db: SupabaseClient, a: string, b: string): Promise<boolean> {
  const { data, error } = await db
    .from('user_blocks')
    .select('blocker_id') // composite PK (blocker_id, blocked_id) — there is no id column
    .or(`and(blocker_id.eq.${a},blocked_id.eq.${b}),and(blocker_id.eq.${b},blocked_id.eq.${a})`)
    .limit(1);
  if (error) dbFail('block lookup', error);
  return (data ?? []).length > 0;
}

export type ResolvedBooking = {
  tutorId: string;
  courseCode: string;
  durationMinutes: number;
  scheduledAt: string;
  hourlyRate: number;
  /** Dollars, 2dp — what goes in bookings.price. */
  price: number;
  /** Dollars, 2dp — the student service fee stored on the booking. */
  studentFee: number;
  /** Integer cents — session price plus student service fee, before credit. */
  amountCents: number;
  platformFee: number;
  tutorPayout: number;
};

/** Thrown for anything the client is allowed to be told about. */
export class BookingError extends Error {
  status: number;
  /** Marks the slot-taken failures so a caller can release the card hold they left behind. */
  reason?: 'slot_taken';
  constructor(message: string, status = 400, reason?: 'slot_taken') {
    super(message);
    this.name = 'BookingError';
    this.status = status;
    this.reason = reason;
  }
}

/** What the loser of a same-slot race is told — their hold is released, not captured. */
export const SLOT_TAKEN_NOT_CHARGED = 'Someone just booked that time, so you weren’t charged. Please pick another time.';

/**
 * A PostgrestError is a plain object, so `String(err)` on one yields "[object Object]" and
 * the real cause is lost. Log the detail and give the caller something generic.
 */
function dbFail(where: string, error: unknown): never {
  console.error(`resolveBooking: ${where} failed`, JSON.stringify(error));
  throw new BookingError('Could not check that session. Please try again.', 500);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate a booking request and derive its price from the database.
 *
 * Asserts, in order: well-formed input; the student isn't booking themselves; the
 * scheduled time is in the future and inside the horizon; the tutor exists, is not
 * deleted, is approved, and can accept charges; neither party has blocked the other;
 * the tutor teaches this course; and the slot isn't already taken.
 *
 * `db` must be a service-role client — this deliberately reads rows (a deleted tutor,
 * the block table's other direction) that RLS hides from the student.
 */
export async function resolveBooking(
  db: SupabaseClient,
  input: ResolveBookingInput,
): Promise<ResolvedBooking> {
  const tutorId = typeof input.tutorId === 'string' ? input.tutorId.trim() : '';
  const courseCode = typeof input.courseCode === 'string' ? input.courseCode.trim() : '';
  const durationMinutes = Number(input.durationMinutes);
  const scheduledAtRaw = typeof input.scheduledAt === 'string' ? input.scheduledAt : '';

  if (!tutorId || !courseCode || !scheduledAtRaw) {
    throw new BookingError('tutorId, courseCode and scheduledAt are required');
  }
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0 || durationMinutes > 480) {
    throw new BookingError('durationMinutes must be between 1 and 480');
  }
  if (tutorId === input.studentId) {
    throw new BookingError('You cannot book yourself');
  }
  // Both ids are interpolated into the PostgREST `or` filter below, so they must be UUIDs.
  if (!UUID_RE.test(tutorId) || !UUID_RE.test(input.studentId)) {
    throw new BookingError('tutorId is not a valid id');
  }

  const scheduled = new Date(scheduledAtRaw);
  if (Number.isNaN(scheduled.getTime())) throw new BookingError('scheduledAt is not a valid date');
  const now = Date.now();
  if (scheduled.getTime() <= now) throw new BookingError('That time is in the past');
  if (scheduled.getTime() > now + BOOKING_HORIZON_DAYS * 24 * 60 * 60 * 1000) {
    throw new BookingError(`Sessions can only be booked up to ${BOOKING_HORIZON_DAYS} days ahead`);
  }

  // Tutor must be a real, live, approved tutor who can take money.
  const { data: tutor, error: tutorErr } = await db
    .from('users')
    // !user_id disambiguates: tutor_profiles also references users via reviewed_by.
    .select('id, deleted_at, tutor_profiles!user_id!inner(approval_status, stripe_charges_enabled, grades_verified_at)')
    .eq('id', tutorId)
    .maybeSingle();
  if (tutorErr) dbFail('tutor lookup', tutorErr);
  if (!tutor || tutor.deleted_at !== null) throw new BookingError('That tutor is no longer available', 404);

  const profile = Array.isArray(tutor.tutor_profiles) ? tutor.tutor_profiles[0] : tutor.tutor_profiles;
  if (!profile || profile.approval_status !== 'approved') {
    throw new BookingError('That tutor is no longer available', 404);
  }
  if (profile.stripe_charges_enabled !== true) {
    throw new BookingError('This tutor has not finished setting up payouts yet, so they cannot be booked.', 409);
  }

  // Deliberately vague: don't disclose that the other party blocked you.
  if (await isBlockedBetween(db, input.studentId, tutorId)) {
    throw new BookingError('That tutor is no longer available', 404);
  }

  // Price comes from the tutor's own rate for this specific course. Never from the client.
  const { data: course, error: courseErr } = await db
    .from('tutor_courses')
    .select('hourly_rate, currently_taking')
    .eq('tutor_id', tutorId)
    .eq('course_code', courseCode)
    .maybeSingle();
  if (courseErr) dbFail('course lookup', courseErr);
  if (!course) throw new BookingError('This tutor does not teach that course', 400);

  const hourlyRate = Number(course.hourly_rate);
  if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) {
    throw new BookingError('This tutor has not set a rate for that course yet', 409);
  }

  // Double-booking: any live booking for this tutor overlapping the requested window.
  const startMs = scheduled.getTime();
  const endMs = startMs + durationMinutes * 60 * 1000;
  const { data: clashes, error: clashErr } = await db
    .from('bookings')
    .select('scheduled_at, duration_minutes')
    .eq('tutor_id', tutorId)
    .in('status', ['pending', 'confirmed'])
    .gte('scheduled_at', new Date(startMs - 8 * 60 * 60 * 1000).toISOString())
    .lte('scheduled_at', new Date(endMs).toISOString());
  if (clashErr) dbFail('clash lookup', clashErr);
  for (const b of clashes ?? []) {
    const bStart = new Date(b.scheduled_at as string).getTime();
    const bEnd = bStart + Number(b.duration_minutes ?? 0) * 60 * 1000;
    if (bStart < endMs && startMs < bEnd) {
      throw new BookingError('That time was just booked. Please pick another slot.', 409, 'slot_taken');
    }
  }

  // An interview the noot team has scheduled with this tutor blocks its hour (ERR-032). Same
  // words as a booked slot: a student should not be able to tell the two apart.
  if (await interviewClash(db, tutorId, startMs, endMs)) {
    throw new BookingError('That time was just booked. Please pick another slot.', 409, 'slot_taken');
  }

  const price = round2((hourlyRate * durationMinutes) / 60);
  if (price <= 0) throw new BookingError('Computed price was zero', 409);
  const studentFee = studentFeeFor(price);
  // The verified rate is per course; currently-taking courses use the unverified rate (fees.ts).
  const { platformFee, tutorPayout } = splitPrice(
    price,
    profile.grades_verified_at != null && course.currently_taking !== true,
  );

  return {
    tutorId,
    courseCode,
    durationMinutes,
    scheduledAt: scheduled.toISOString(),
    hourlyRate,
    price,
    studentFee,
    amountCents: Math.round(price * 100) + Math.round(studentFee * 100),
    platformFee,
    tutorPayout,
  };
}

/**
 * How long a tutor's interview with the noot team blocks their time, in minutes. Interviews
 * are stored as a start time only (tutor_interviews, 0042) and are offered at the top of an
 * availability window, so an hour is what they are given.
 */
export const INTERVIEW_MINUTES = 60;

/**
 * Whether [startMs, endMs) overlaps a live interview the noot team has scheduled with this
 * tutor (ERR-032). `db` must be a service-role client: students cannot read interviews.
 *
 * Today the admin screen only schedules interviews with applicants, who cannot be booked,
 * and approving one closes its interview (0042) — so through the app this never fires. It is
 * here so the rule holds if an interview is ever set for a tutor who is already bookable,
 * which schedule_tutor_interview itself allows.
 */
export async function interviewClash(
  db: SupabaseClient,
  tutorId: string,
  startMs: number,
  endMs: number,
): Promise<boolean> {
  const blockMs = INTERVIEW_MINUTES * 60 * 1000;
  const { data, error } = await db
    .from('tutor_interviews')
    .select('scheduled_at')
    .eq('tutor_id', tutorId)
    .is('cancelled_at', null)
    .gt('scheduled_at', new Date(startMs - blockMs).toISOString())
    .lt('scheduled_at', new Date(endMs).toISOString())
    .limit(1);
  if (error) dbFail('interview lookup', error);
  return (data ?? []).length > 0;
}

/**
 * How long after a session's scheduled end a no-show may be reported, in hours. A window
 * rather than "any time after" so a stale booking can't be turned into a payout months
 * later. Completion itself has no upper bound — the hold's ~7-day life is the real limit.
 */
export const NO_SHOW_WINDOW_HOURS = 48;

/**
 * Assert a session's scheduled time has actually passed before money moves.
 *
 * `report-no-show` and `complete-session` both capture a held PaymentIntent (and transfer
 * a payout). Neither checked the clock, so a tutor could tap "Report a no-show" on a
 * session days in the future and take the money for a session that hadn't happened —
 * reachable from the Upcoming tab, not just a tampered client.
 */
export function assertSessionElapsed(
  scheduledAt: string,
  durationMinutes: number,
  opts: { withinHours?: number } = {},
): void {
  const start = new Date(scheduledAt).getTime();
  if (Number.isNaN(start)) throw new BookingError('This booking has no valid start time', 409);
  const end = start + Number(durationMinutes ?? 0) * 60 * 1000;
  const now = Date.now();
  if (now < end) {
    throw new BookingError("That session hasn't finished yet.", 409);
  }
  if (opts.withinHours != null && now > end + opts.withinHours * 3600 * 1000) {
    throw new BookingError(
      `A no-show can only be reported within ${opts.withinHours} hours of the session.`,
      409,
    );
  }
}

/**
 * Confirm a tutor's connected account can actually receive the payout, BEFORE capturing.
 *
 * Capture-then-transfer with no rollback meant a failed transfer left the student charged,
 * the tutor unpaid, the booking still `confirmed`, and nothing flagged. A stale
 * `stripe_connect_account_id` from the other Stripe mode (T10) triggers exactly that, and
 * production holds several. Checking first turns a silent money-eating failure into a
 * clean refusal with nothing captured.
 */
export async function assertPayoutReady(
  stripeKey: string,
  connectId: string | null,
): Promise<void> {
  if (!connectId) {
    throw new BookingError('Set up payouts before completing — no connected Stripe account.', 400);
  }
  let status: PayoutStatus;
  try {
    status = await getPayoutStatus(stripeKey, connectId);
  } catch (err) {
    // Never rethrow a raw Stripe error from here. Stripe's own message for an
    // inaccessible account embeds a partially-redacted API key, and this string is
    // returned to the client. Log the detail, tell the user something useful.
    // `resource_missing` and a permission error mean the same thing to us: the stored id
    // is unusable under the current keys, which is exactly the test→live case (T10).
    console.error('assertPayoutReady: could not retrieve connected account', String(err));
    throw new BookingError(
      'This payout account is no longer valid. Please reconnect Stripe payouts, then try again.',
      409,
    );
  }
  if (status.closed) {
    console.error('assertPayoutReady: connected account is closed', connectId);
    throw new BookingError(
      'This payout account is no longer valid. Please reconnect Stripe payouts, then try again.',
      409,
    );
  }
  if (!status.transfersActive || !status.payoutsActive) {
    throw new BookingError(
      'Stripe payout setup is incomplete for this account. Finish onboarding, then try again.',
      409,
    );
  }
}
