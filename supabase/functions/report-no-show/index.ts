// Edge Function: report-no-show.
// A party reports that the OTHER party did not show up for a booked session.
// Body: { bookingId, party: 'student'|'tutor' } where `party` = who DID NOT show.
// The caller must be the OTHER party to the booking.
// Refund percentages only rise and include funds already returned by Stripe.
// Self-contained; SUPABASE_* env vars are auto-injected by the runtime.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireActiveUser } from '../_shared/auth.ts';
import { serveWithErrorReporting } from '../_shared/observability.ts';
import { otherOutcomeTransferExists, payTutor } from '../_shared/payouts.ts';
import {
  BookingError,
  NO_SHOW_WINDOW_HOURS,
  assertPayoutReady,
  assertSessionElapsed,
} from '../_shared/booking.ts';
import { capturedRefundCents, chargeRefundPercent, refundOwedCents } from '../_shared/refunds.ts';
import { updateConfirmedBookingRaiseOnly } from '../_shared/refundWrite.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serveWithErrorReporting('report-no-show', async (req: Request) => {
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
    const bookingId: string | undefined = body?.bookingId;
    const party: string | undefined = body?.party;
    if (!bookingId) return Response.json({ error: 'bookingId is required' }, { status: 400, headers: cors });
    if (party !== 'student' && party !== 'tutor') {
      return Response.json({ error: "party must be 'student' or 'tutor'" }, { status: 400, headers: cors });
    }

    // Load the booking.
    const { data: booking, error: loadErr } = await db
      .from('bookings')
      .select('id, student_id, tutor_id, status, scheduled_at, duration_minutes, price, credit_applied, stripe_payment_intent_id, tutor_payout_amount')
      .eq('id', bookingId)
      .single();
    if (loadErr || !booking) return Response.json({ error: 'Booking not found' }, { status: 404, headers: cors });

    // Verify the caller is a party to the booking...
    const isStudent = booking.student_id === user.id;
    const isTutor = booking.tutor_id === user.id;
    if (!isStudent && !isTutor) {
      return Response.json({ error: 'Not a party to this booking' }, { status: 403, headers: cors });
    }

    // ...and specifically the OTHER party from the one who no-showed.
    // If the tutor didn't show, the student must be the reporter (and vice versa).
    const reporterMatchesOtherParty = party === 'tutor' ? isStudent : isTutor;
    if (!reporterMatchesOtherParty) {
      return Response.json(
        { error: 'Only the other party may report a no-show' },
        { status: 403, headers: cors },
      );
    }

    // Only a live booking can become a no-show — not one already cancelled, completed or
    // reported. `status` was being selected and never checked.
    if (booking.status !== 'confirmed') {
      return Response.json(
        { error: `Cannot report a no-show on a ${booking.status} session` },
        { status: 409, headers: cors },
      );
    }

    // And only after the session was actually due. Without this a tutor could tap
    // "Report a no-show" on an UPCOMING session (sessions.tsx shows the link there) and
    // capture the full hold days early, for a session that never happened.
    assertSessionElapsed(booking.scheduled_at as string, Number(booking.duration_minutes), {
      withinHours: NO_SHOW_WINDOW_HOURS,
    });

    // Determine refund outcome.
    const tutorNoShow = party === 'tutor';
    let refundPercent = tutorNoShow ? 100 : 0;

    // Reconcile Stripe's PaymentIntent before applying the no-show outcome.
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    const pi = booking.stripe_payment_intent_id as string | null;
    let transferId: string | null = null;
    let chargeId: string | null = null;
    if (stripeKey && pi && pi.startsWith('pi_')) {
      const { default: Stripe } = await import('https://esm.sh/stripe@16?target=deno');
      const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
      try {
        const current = await stripe.paymentIntents.retrieve(pi, { expand: ['latest_charge'] });
        const payNoShowTutor = async (
          charge: Parameters<typeof payTutor>[0]['charge'],
          connectId: string,
        ) => {
          const payout = await payTutor({
            stripe,
            bookingId,
            destination: connectId,
            payoutCents: Math.round(Number(booking.tutor_payout_amount) * 100),
            charge,
            idempotencyKey: `noshow_transfer_${bookingId}`,
            metadata: { booking_id: bookingId, reason: 'student_no_show' },
          });
          transferId = payout.transferId;
          if (!payout.complete) {
            // Captured but not (fully) paid out — record it and flag for a manual payout
            // rather than returning an error that makes the row look untouched.
            const failedAt = new Date().toISOString();
            const base = {
              status: 'no_show',
              no_show_party: party,
              stripe_charge_id: chargeId,
              stripe_transfer_id: transferId,
              payout_failed_at: failedAt,
            };
            const { data: flagged, error: flagError } =
              await updateConfirmedBookingRaiseOnly(db, bookingId, base, refundPercent);
            if (flagError) {
              console.error('report-no-show: payout failure status update failed', bookingId, flagError.message);
            }
            // Another outcome won meanwhile: keep it, but still flag the captured charge.
            if (!flagged) {
              await db.from('bookings').update({ payout_failed_at: failedAt }).eq('id', bookingId);
              console.error('report-no-show: captured, transfer failed and the booking left confirmed meanwhile', bookingId, chargeId);
            }
            console.error('report-no-show: captured but transfer failed', bookingId, `owed ${payout.shortfallCents}c`, String(payout.error));
            return Response.json(
              {
                error: 'The charge went through but the payout failed. Our team has been notified and will complete it.',
                captured: true,
                payoutFailed: true,
              },
              { status: 502, headers: cors },
            );
          }
          return null;
        };

        if (current.status === 'canceled') {
          refundPercent = 100;
        } else if (current.status === 'succeeded') {
          if (await otherOutcomeTransferExists(stripe, bookingId, tutorNoShow ? null : 'student_no_show')) {
            return Response.json({ error: 'This session was already completed or cancelled.' }, { status: 409, headers: cors });
          }
          const charge = current.latest_charge;
          if (!charge || typeof charge === 'string') throw new Error('Captured charge was not expanded');
          const refunded = await capturedRefundCents(stripe, charge);
          const targetPercent = tutorNoShow ? 100 : 0;
          let owed = 0;
          if (tutorNoShow) {
            owed = refundOwedCents(charge, refunded, targetPercent);
            if (owed > 0) {
              await stripe.refunds.create(
                {
                  charge: charge.id,
                  amount: owed,
                  metadata: { booking_id: bookingId, reason: 'tutor_no_show' },
                },
                { idempotencyKey: `noshow_refund_${bookingId}` },
              );
            }
          }
          refundPercent = Math.max(targetPercent, chargeRefundPercent(charge, refunded + owed));
          chargeId = charge.id;
          if (refundPercent < 100 && !tutorNoShow) {
            const { data: prof } = await db
              .from('tutor_profiles')
              .select('stripe_connect_account_id')
              .eq('user_id', booking.tutor_id)
              .maybeSingle();
            const connectId = (prof?.stripe_connect_account_id as string | null | undefined) ?? null;
            await assertPayoutReady(stripeKey, connectId);
            const payoutFailure = await payNoShowTutor(charge, connectId!);
            if (payoutFailure) return payoutFailure;
          }
        } else if (tutorNoShow) {
          await stripe.paymentIntents.cancel(pi, {}, { idempotencyKey: `noshow_cancel_${bookingId}` });
        } else {
          const { data: prof } = await db
            .from('tutor_profiles')
            .select('stripe_connect_account_id')
            .eq('user_id', booking.tutor_id)
            .maybeSingle();
          const connectId = (prof?.stripe_connect_account_id as string | null | undefined) ?? null;
          // Check the destination before capturing, as in complete-session.
          await assertPayoutReady(stripeKey, connectId);
          const capped = await stripe.paymentIntents.capture(
            pi,
            { expand: ['latest_charge'] },
            { idempotencyKey: `noshow_cap_${bookingId}` },
          );
          const charge = typeof capped.latest_charge === 'string' ? null : capped.latest_charge;
          chargeId = typeof capped.latest_charge === 'string' ? capped.latest_charge : (charge?.id ?? null);
          const payoutFailure = await payNoShowTutor(charge, connectId!);
          if (payoutFailure) return payoutFailure;
        }
      } catch (stripeErr) {
        if (stripeErr instanceof BookingError) {
          return Response.json({ error: stripeErr.message }, { status: stripeErr.status, headers: cors });
        }
        // Never surface a raw Stripe message — it can embed a redacted API key.
        console.error('report-no-show: stripe failed', JSON.stringify(stripeErr), stripeErr);
        return Response.json(
          { error: 'The payment step failed. Please try again.' },
          { status: 400, headers: cors },
        );
      }
    }

    const refundStatus = refundPercent > 0 ? 'refunded' : 'not_refunded';
    const base = {
      status: 'no_show',
      no_show_party: party,
      stripe_charge_id: chargeId,
      stripe_transfer_id: transferId,
    };
    const { data: noShowRow, error: updateErr } =
      await updateConfirmedBookingRaiseOnly(db, bookingId, base, refundPercent);
    if (updateErr) return Response.json({ error: updateErr.message }, { status: 400, headers: cors });
    // Completed or cancelled while we worked: that outcome stands, and no credit comes back.
    if (!noShowRow) {
      return Response.json({ error: 'This session was already completed or cancelled.' }, { status: 409, headers: cors });
    }

    const actualRefundPercent = Number(noShowRow.refund_percent);
    const actualRefundStatus = noShowRow.refund_status || refundStatus;
    if (actualRefundPercent > 0 && Number(booking.credit_applied ?? 0) > 0) {
      const { error: creditErr } = await db.rpc('return_booking_credit', {
        p_booking: bookingId,
        p_percent: actualRefundPercent,
      });
      if (creditErr) console.error('report-no-show: credit return failed', bookingId, creditErr.message);
    }

    return Response.json({
      status: 'no_show',
      refundPercent: actualRefundPercent,
      refundStatus: actualRefundStatus,
    }, { headers: cors });
  } catch (e) {
    if (e instanceof BookingError) {
      return Response.json({ error: e.message }, { status: e.status, headers: cors });
    }
    console.error('report-no-show failed', JSON.stringify(e), e);
    return Response.json(
      { error: 'Something went wrong reporting that no-show. Please try again.' },
      { status: 400, headers: cors },
    );
  }
});
