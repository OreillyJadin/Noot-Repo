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
import { splitPrice } from './fees.ts';

// Noot's cut lives in ./fees.ts (17.5% verified, 32.5% unverified). ARCHITECTURE.md §8
// is stale and says $0.00.

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

export type ResolvedBooking = {
  tutorId: string;
  courseCode: string;
  durationMinutes: number;
  scheduledAt: string;
  hourlyRate: number;
  /** Dollars, 2dp — what goes in bookings.price. */
  price: number;
  /** Integer cents — what Stripe is asked to authorize. */
  amountCents: number;
  platformFee: number;
  tutorPayout: number;
};

/** Thrown for anything the client is allowed to be told about. */
export class BookingError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'BookingError';
    this.status = status;
  }
}

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

  // Blocks are symmetric, matching is_blocked_between() in 0028_reports_and_blocks.sql. Read
  // straight off the table rather than via RPC: that function is only granted to
  // `authenticated`, and this runs as service role.
  const { data: blocks, error: blockErr } = await db
    .from('user_blocks')
    .select('blocker_id')  // composite PK (blocker_id, blocked_id) — there is no id column
    .or(
      `and(blocker_id.eq.${input.studentId},blocked_id.eq.${tutorId}),` +
        `and(blocker_id.eq.${tutorId},blocked_id.eq.${input.studentId})`,
    )
    .limit(1);
  if (blockErr) dbFail('block lookup', blockErr);
  // Deliberately vague: don't disclose that the other party blocked you.
  if ((blocks ?? []).length > 0) throw new BookingError('That tutor is no longer available', 404);

  // Price comes from the tutor's own rate for this specific course. Never from the client.
  const { data: course, error: courseErr } = await db
    .from('tutor_courses')
    .select('hourly_rate')
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
      throw new BookingError('That time was just booked. Please pick another slot.', 409);
    }
  }

  const price = round2((hourlyRate * durationMinutes) / 60);
  if (price <= 0) throw new BookingError('Computed price was zero', 409);
  // The tutor's verification decides noot's cut (fees.ts). Locked in on the booking row.
  const { platformFee, tutorPayout } = splitPrice(price, profile.grades_verified_at != null);

  return {
    tutorId,
    courseCode,
    durationMinutes,
    scheduledAt: scheduled.toISOString(),
    hourlyRate,
    price,
    amountCents: Math.round(price * 100),
    platformFee,
    tutorPayout,
  };
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
  // deno-lint-ignore no-explicit-any
  stripe: any,
  connectId: string | null,
): Promise<void> {
  if (!connectId) {
    throw new BookingError('Set up payouts before completing — no connected Stripe account.', 400);
  }
  let account: { charges_enabled?: boolean; payouts_enabled?: boolean };
  try {
    account = await stripe.accounts.retrieve(connectId);
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
  if (!account.charges_enabled || !account.payouts_enabled) {
    throw new BookingError(
      'Stripe payout setup is incomplete for this account. Finish onboarding, then try again.',
      409,
    );
  }
}
