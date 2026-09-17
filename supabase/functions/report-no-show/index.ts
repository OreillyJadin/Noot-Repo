// Edge Function: report-no-show.
// A party reports that the OTHER party did not show up for a booked session.
// Body: { bookingId, party: 'student'|'tutor' } where `party` = who DID NOT show.
// The caller must be the OTHER party to the booking.
//  - tutor no-show  -> student refunded  (refund_percent=100, refund_status='refunded')
//  - student no-show -> tutor still paid  (refund_percent=0,   refund_status='not_refunded')
// Self-contained; SUPABASE_* env vars are auto-injected by the runtime.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  BookingError,
  NO_SHOW_WINDOW_HOURS,
  assertPayoutReady,
  assertSessionElapsed,
} from '../_shared/booking.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
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
      .select('id, student_id, tutor_id, status, scheduled_at, duration_minutes, price, stripe_payment_intent_id, tutor_payout_amount')
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
    const refundPercent = tutorNoShow ? 100 : 0;
    const refundStatus = tutorNoShow ? 'refunded' : 'not_refunded';

    // Real money movement on the held PaymentIntent:
    //   tutor no-show  → cancel the authorization (student charged $0);
    //   student no-show → capture the full charge + transfer the payout to the tutor.
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    const pi = booking.stripe_payment_intent_id as string | null;
    let transferId: string | null = null;
    let chargeId: string | null = null;
    if (stripeKey && pi && pi.startsWith('pi_')) {
      const { default: Stripe } = await import('https://esm.sh/stripe@16?target=deno');
      const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
      try {
        if (tutorNoShow) {
          await stripe.paymentIntents.cancel(pi, {}, { idempotencyKey: `noshow_cancel_${bookingId}` });
        } else {
          const { data: prof } = await db
            .from('tutor_profiles')
            .select('stripe_connect_account_id')
            .eq('user_id', booking.tutor_id)
            .maybeSingle();
          const connectId = (prof?.stripe_connect_account_id as string | null | undefined) ?? null;
          // Check the destination before capturing, as in complete-session.
          await assertPayoutReady(stripe, connectId);
          const capped = await stripe.paymentIntents.capture(pi, {}, { idempotencyKey: `noshow_cap_${bookingId}` });
          chargeId = typeof capped.latest_charge === 'string' ? capped.latest_charge : (capped.latest_charge?.id ?? null);
          try {
            const transfer = await stripe.transfers.create(
              {
                amount: Math.round(Number(booking.tutor_payout_amount) * 100),
                currency: 'usd',
                destination: connectId!,
                transfer_group: bookingId,
                metadata: { booking_id: bookingId, reason: 'student_no_show' },
              },
              { idempotencyKey: `noshow_transfer_${bookingId}` },
            );
            transferId = transfer.id;
          } catch (transferErr) {
            // Captured but not paid out — record it and flag for a manual payout rather
            // than returning an error that makes the row look untouched.
            await db
              .from('bookings')
              .update({
                status: 'no_show',
                refund_percent: refundPercent,
                refund_status: refundStatus,
                stripe_charge_id: chargeId,
                payout_failed_at: new Date().toISOString(),
              })
              .eq('id', bookingId);
            console.error('report-no-show: captured but transfer failed', bookingId, String(transferErr));
            return Response.json(
              {
                error: 'The charge went through but the payout failed. Our team has been notified and will complete it.',
                captured: true,
                payoutFailed: true,
              },
              { status: 502, headers: cors },
            );
          }
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

    const { error: updateErr } = await db
      .from('bookings')
      .update({
        status: 'no_show',
        refund_percent: refundPercent,
        refund_status: refundStatus,
        stripe_charge_id: chargeId,
        stripe_transfer_id: transferId,
      })
      .eq('id', bookingId);
    if (updateErr) return Response.json({ error: updateErr.message }, { status: 400, headers: cors });

    // TODO: 3-strike escalation tracking — accumulate no-show strikes per user and
    // escalate (warn/suspend) once a threshold is reached.

    return Response.json({ status: 'no_show', refundPercent }, { headers: cors });
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
