// Edge Function: confirm-booking.
// The caller (user.id) is the STUDENT. Creates a pending booking request with an
// optional request note; the conversation is created only when the tutor accepts.
//
// Body: { tutorId, courseCode, scheduledAt, durationMinutes, sessionType, location,
//         meetingLink, message, paymentIntentId }. The price is NOT accepted from the
// client — resolveBooking() re-derives it from tutor_courses.hourly_rate and the held
// PaymentIntent is retrieved and checked against it (T5). Before that check existed, an
// inflated `price` against a small hold became a real transfer in complete-session.
//
// An admin student (public.is_admin() on the caller's JWT) books for free: the row is
// priced $0 with no PaymentIntent, no credit and no payout, and every later step
// (accept, chat, cancel, complete, no-show) already treats a null PaymentIntent as
// "nothing to move". Nobody else can reach that path — the price always comes from
// resolveBooking and a non-admin without a real `pi_` hold is refused below.
//
// Self-contained: SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
// are auto-injected by the runtime.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isAdmin, requireActiveUser } from '../_shared/auth.ts';
import { BookingError, freeBookingFor, resolveBooking, SLOT_TAKEN_NOT_CHARGED, type ResolvedBooking } from '../_shared/booking.ts';
import { cancellationDeadlineFor } from '../_shared/cancellation.ts';
import { acceptDeadline } from '../_shared/acceptance.ts';
import { creditToApply, parseCreditCents } from '../_shared/credits.ts';
import { serveWithErrorReporting } from '../_shared/observability.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serveWithErrorReporting('confirm-booking', async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401, headers: cors });

    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!); // service role: bypasses RLS
    const inactiveResponse = await requireActiveUser(db, user.id, cors);
    if (inactiveResponse) return inactiveResponse;

    const body = await req.json().catch(() => ({}));

    const {
      courseCode,
      sessionType,
      location,
      meetingLink,
      paymentIntentId,
    } = body as {
      courseCode?: string;
      sessionType?: string;
      location?: string;
      meetingLink?: string;
      paymentIntentId?: string;
    };
    const message = body?.message;
    if (message !== undefined && typeof message !== 'string') {
      return Response.json({ error: 'Your note must be text.' }, { status: 400, headers: cors });
    }
    const requestNote = typeof message === 'string' ? message.trim() || null : null;
    if (requestNote && Array.from(requestNote).length > 1000) {
      return Response.json(
        { error: 'Your note must be 1,000 characters or fewer.' },
        { status: 400, headers: cors },
      );
    }

    // Only in-person sessions are sold at launch: noot has no video provider, so a video
    // booking would leave the student with no way to attend (T14). Existing 'video' rows
    // still render; we just don't create new ones.
    if (sessionType !== 'in_person') {
      return Response.json(
        { error: "Only in-person sessions can be booked right now (sessionType must be 'in_person')." },
        { status: 400, headers: cors },
      );
    }

    // The caller is the student and must be a party to the booking they create.
    const studentId = user.id;

    // Single source of truth for price, fee, payout and tutor eligibility. This also
    // rejects blocked pairs, which the service-role inserts below would otherwise bypass.
    let resolved: ResolvedBooking;
    try {
      resolved = await resolveBooking(db, {
        studentId,
        tutorId: body?.tutorId,
        courseCode,
        durationMinutes: body?.durationMinutes,
        scheduledAt: body?.scheduledAt,
      });
    } catch (e) {
      // The competing booking was inserted before resolveBooking read the clashes — this
      // request loses the slot outright, so its authorized hold would just sit on the
      // card. Release it when it provably belongs to this student for this session and
      // no booking is using it; on any doubt leave it (cancel is unconditional below
      // that point) and surface the original "slot taken" message.
      if (e instanceof BookingError && e.reason === 'slot_taken') {
        try {
          const earlyStripeKey = Deno.env.get('STRIPE_SECRET_KEY');
          if (earlyStripeKey && typeof paymentIntentId === 'string' && paymentIntentId.startsWith('pi_')) {
            const { default: Stripe } = await import('https://esm.sh/stripe@16?target=deno');
            const stripe = new Stripe(earlyStripeKey, { apiVersion: '2024-06-20' });
            const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
            const { data: claimed } = await db
              .from('bookings')
              .select('id')
              .eq('stripe_payment_intent_id', paymentIntentId)
              .limit(1);
            if (
              pi.metadata?.user_id === studentId &&
              typeof body?.tutorId === 'string' &&
              pi.metadata?.tutor_id === body.tutorId &&
              pi.status === 'requires_capture' &&
              (claimed ?? []).length === 0
            ) {
              await stripe.paymentIntents.cancel(paymentIntentId, {}, {
                idempotencyKey: `release_unbooked_${paymentIntentId}`,
              });
              return Response.json({ error: SLOT_TAKEN_NOT_CHARGED }, { status: 409, headers: cors });
            }
          }
        } catch (releaseErr) {
          console.error('confirm-booking: could not release hold after lost slot race', String(releaseErr));
        }
      }
      throw e;
    }

    // Verify the held PaymentIntent really covers this booking. Without this the amount
    // Stripe authorized and the amount we pay the tutor are unrelated numbers.
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    let storedPaymentIntentId: string | null;
    // Noot credit taken off this booking (0040), and how to let the card hold go if the
    // credit can't be spent after all.
    let creditCents = 0;
    let releaseHold: (() => Promise<unknown>) | null = null;
    const adminFree = await isAdmin(userClient);
    if (adminFree) {
      resolved = freeBookingFor(resolved);
      storedPaymentIntentId = null;
    } else if (stripeKey) {
      if (!paymentIntentId || !paymentIntentId.startsWith('pi_')) {
        return Response.json({ error: 'A completed payment is required' }, { status: 400, headers: cors });
      }
      const { default: Stripe } = await import('https://esm.sh/stripe@16?target=deno');
      const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId);

      if (pi.metadata?.user_id !== studentId) {
        return Response.json({ error: 'That payment belongs to someone else' }, { status: 403, headers: cors });
      }
      if (pi.metadata?.tutor_id !== resolved.tutorId || pi.metadata?.course_code !== resolved.courseCode) {
        return Response.json({ error: 'That payment was for a different session' }, { status: 400, headers: cors });
      }
      // The hold is the session total (price plus student fee) minus credit. Credit is
      // re-checked against that total here and actually spent below, under a lock.
      const claimed = parseCreditCents(pi.metadata?.credit_cents, resolved.amountCents);
      if (claimed === null || pi.amount !== resolved.amountCents - claimed) {
        return Response.json({ error: 'The payment amount does not match this session' }, { status: 400, headers: cors });
      }
      creditCents = claimed;
      releaseHold = () => stripe.paymentIntents.cancel(paymentIntentId);
      // Manual capture: the hold is authorized and waiting to be captured.
      if (pi.status !== 'requires_capture') {
        return Response.json({ error: 'The payment has not been authorized yet' }, { status: 400, headers: cors });
      }
      // One hold, one booking.
      const { data: reused } = await db
        .from('bookings')
        .select('id')
        .eq('stripe_payment_intent_id', paymentIntentId)
        .limit(1);
      if ((reused ?? []).length > 0) {
        return Response.json({ error: 'That payment has already been used' }, { status: 409, headers: cors });
      }
      storedPaymentIntentId = paymentIntentId;
    } else {
      // No Stripe configured (local/dev) — create-payment-intent returned a simulated id.
      storedPaymentIntentId = paymentIntentId ?? 'sim_pi_' + crypto.randomUUID();
      const { data: bal } = await db.rpc('credit_balance_cents', { p_user: studentId });
      creditCents = creditToApply(Number(bal ?? 0), resolved.amountCents);
    }

    // Spend the credit before the booking exists, under spend_credit's per-user lock, so one
    // balance can't pay for two bookings confirmed at the same moment.
    if (creditCents > 0) {
      const { error: spendErr } = await db.rpc('spend_credit', {
        p_user: studentId,
        p_cents: creditCents,
        p_payment_intent: storedPaymentIntentId,
      });
      if (spendErr) {
        // Same PaymentIntent already spent = a double-submit of a confirm that's going
        // through. Leave its hold alone — releasing it would cancel the real booking's payment.
        if (spendErr.code === '23505') {
          // …unless that earlier attempt died before creating the booking: then nothing will
          // ever use the spend or the hold, so give both back. 60s leaves a live winner alone.
          const { data: prior } = await db
            .from('credit_ledger')
            .select('created_at')
            .eq('payment_intent_id', storedPaymentIntentId)
            .eq('kind', 'booking_spend')
            .maybeSingle();
          const { data: booked } = await db
            .from('bookings')
            .select('id')
            .eq('stripe_payment_intent_id', storedPaymentIntentId)
            .limit(1);
          const stale = prior && Date.now() - new Date(prior.created_at as string).getTime() > 60_000;
          if (stale && (booked ?? []).length === 0) {
            const { error: backErr } = await db.from('credit_ledger').insert({
              user_id: studentId, amount_cents: creditCents, kind: 'adjustment', payment_intent_id: storedPaymentIntentId,
            });
            // 23505 = an earlier retry already gave it back.
            if (backErr && backErr.code !== '23505') console.error('confirm-booking: orphaned credit NOT returned', storedPaymentIntentId, backErr.message);
            if (releaseHold) await releaseHold().catch((e) => console.error('confirm-booking: release hold failed', String(e)));
            return Response.json(
              { error: 'That checkout didn’t finish, so you weren’t charged and your credit is back. Please book again.' },
              { status: 409, headers: cors },
            );
          }
          return Response.json({ error: 'That payment has already been used' }, { status: 409, headers: cors });
        }
        if (releaseHold) await releaseHold().catch((e) => console.error('confirm-booking: release hold failed', String(e)));
        return Response.json(
          { error: 'Your Noot credit changed since checkout, so you weren’t charged. Please book again.' },
          { status: 409, headers: cors },
        );
      }
    }

    const cancellationDeadline = cancellationDeadlineFor(new Date(resolved.scheduledAt)).toISOString();
    const acceptBy = acceptDeadline(Date.now(), new Date(resolved.scheduledAt).getTime()).toISOString();

    const insertBooking = () =>
      db
        .from('bookings')
        .insert({
        student_id: studentId,
        tutor_id: resolved.tutorId,
        subject: resolved.courseCode,
        scheduled_at: resolved.scheduledAt,
        duration_minutes: resolved.durationMinutes,
        price: resolved.price,
        student_fee: resolved.studentFee,
        platform_fee: resolved.platformFee,
        tutor_payout_amount: resolved.tutorPayout,
        credit_applied: creditCents / 100,
        session_type: sessionType,
        meeting_link: meetingLink ?? null,
        location: location ?? null,
        request_note: requestNote,
        status: 'pending',
        accept_by: acceptBy,
        cancellation_deadline: cancellationDeadline,
        refund_status: 'not_applicable',
        stripe_payment_intent_id: storedPaymentIntentId,
        })
      .select('id')
      .single();

    // Two concurrent confirms can each wait on the other's exclusion-constraint tuple and
    // get aborted by the deadlock detector (40P01). The abort is transient — retry the
    // identical write once; a second 40P01 is handled like 23P01 below.
    const firstTry = await insertBooking();
    const { data: booking, error: bookingError } =
      firstTry.error?.code === '40P01' ? await insertBooking() : firstTry;

    if (bookingError) {
      // Another confirm with this PaymentIntent got there first (bookings_one_per_payment_intent).
      // Its booking uses the hold and any credit — leave both alone.
      if (bookingError.code === '23505' && bookingError.message.includes('bookings_one_per_payment_intent')) {
        return Response.json({ error: 'That payment has already been used' }, { status: 409, headers: cors });
      }
      // No booking, so nothing for the credit or the hold to pay for: give both back.
      if (creditCents > 0) {
        const { error: backErr } = await db
          .from('credit_ledger')
          .insert({ user_id: studentId, amount_cents: creditCents, kind: 'adjustment', payment_intent_id: storedPaymentIntentId });
        if (backErr && backErr.code !== '23505') console.error('confirm-booking: credit NOT returned after failed insert', storedPaymentIntentId, backErr.message);
      }
      if (releaseHold) await releaseHold().catch((e) => console.error('confirm-booking: release hold failed', String(e)));
      // Lost the slot to a concurrent confirm (bookings_tutor_no_overlap, 0063): the
      // credit and hold were just given back above, so say so instead of a generic error.
      // 40P01 is the same race surfacing as an un-retryable deadlock.
      if (bookingError.code === '23P01' || bookingError.code === '40P01') {
        return Response.json({ error: SLOT_TAKEN_NOT_CHARGED }, { status: 409, headers: cors });
      }
      if (
        bookingError.code === '23514' &&
        bookingError.message.includes('That wording breaks our community rules')
      ) {
        return Response.json({ error: bookingError.message }, { status: 400, headers: cors });
      }
      throw bookingError;
    }
    if (creditCents > 0) {
      // return_booking_credit also finds the spend by PaymentIntent, so a failure here is
      // logged rather than fatal.
      const { error: linkErr } = await db
        .from('credit_ledger')
        .update({ booking_id: booking.id })
        .eq('payment_intent_id', storedPaymentIntentId)
        .eq('kind', 'booking_spend');
      if (linkErr) console.error('confirm-booking: could not link credit spend', booking.id, linkErr.message);
    }

    return Response.json(
      {
        bookingId: booking.id,
        price: resolved.price,
        studentFee: resolved.studentFee,
        acceptBy,
        free: adminFree,
      },
      { headers: cors },
    );
  } catch (e) {
    if (e instanceof BookingError) {
      return Response.json({ error: e.message }, { status: e.status, headers: cors });
    }
    // Deliberately generic — see the note in create-payment-intent.
    console.error('confirm-booking failed', JSON.stringify(e), e);
    return Response.json(
      { error: 'Something went wrong confirming that booking. Please try again.' },
      { status: 400, headers: cors },
    );
  }
});
