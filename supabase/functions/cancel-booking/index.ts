// Edge Function: cancel-booking.
// Cancels a booking and records a raise-only refund share, accounting for refunds
// already made in Stripe. Either party to the booking may cancel:
//   - Student cancels: refund tiered by lead time (12h+ → 100%, >=2h → 50%, else 0%).
//     On late cancellations, the tutor is paid their non-refunded share of the stored payout.
//   - Tutor cancels: student is always refunded 100%.
//
// Deno runtime.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireActiveUser } from '../_shared/auth.ts';
import { assertPayoutReady } from '../_shared/booking.ts';
import { lateCancelTutorPayoutCents, studentCancelRefundPercent } from '../_shared/cancellation.ts';
import { serveWithErrorReporting } from '../_shared/observability.ts';
import { otherOutcomeTransferExists, payTutor } from '../_shared/payouts.ts';
import { capturedRefundCents, chargeRefundedCents, chargeRefundPercent, refundOwedCents } from '../_shared/refunds.ts';
import { raiseRefundedCents, updateConfirmedBookingRaiseOnly } from '../_shared/refundWrite.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serveWithErrorReporting('cancel-booking', async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });

    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401, headers: cors });

    // service role: bypasses RLS
    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const inactiveResponse = await requireActiveUser(db, user.id, cors);
    if (inactiveResponse) return inactiveResponse;

    const body = (await req.json().catch(() => ({}))) as { bookingId?: string };
    const bookingId = body.bookingId;
    if (!bookingId) {
      return Response.json({ error: 'bookingId is required' }, { status: 400, headers: cors });
    }

    // Load booking.
    const { data: booking, error: loadError } = await db
      .from('bookings')
      .select('id, student_id, tutor_id, subject, scheduled_at, status, price, student_fee, credit_applied, tutor_payout_amount, stripe_payment_intent_id')
      .eq('id', bookingId)
      .single();

    if (loadError || !booking) {
      return Response.json({ error: 'Booking not found' }, { status: 404, headers: cors });
    }

    // Verify the caller is a party to the booking.
    const isStudent = booking.student_id === user.id;
    const isTutor = booking.tutor_id === user.id;
    if (!isStudent && !isTutor) {
      return Response.json(
        { error: 'Not authorized to cancel this booking' },
        { status: 403, headers: cors },
      );
    }

    if (booking.status === 'cancelled') {
      return Response.json(
        { error: 'Booking is already cancelled' },
        { status: 400, headers: cors },
      );
    }

    const now = new Date();
    const chargedCents = Math.round(Number(booking.price) * 100) +
      Math.round(Number(booking.student_fee) * 100) -
      Math.round(Number(booking.credit_applied ?? 0) * 100);
    const hasCardAmount = chargedCents > 0 && (booking.stripe_payment_intent_id as string | null)?.startsWith('pi_');
    if (booking.status === 'pending') {
      const paymentIntentId = booking.stripe_payment_intent_id as string | null;
      const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
      const noRealHold = !paymentIntentId || paymentIntentId.startsWith('sim_pi_');
      const { data: cancelled, error: updateError } = await db
        .from('bookings')
        .update({
          status: 'cancelled',
          cancelled_by_role: isStudent ? 'student' : 'tutor',
          cancelled_from_status: 'pending',
          cancelled_at: now.toISOString(),
          refund_percent: 100,
          refund_status: 'refunded',
          stripe_charge_id: null,
          stripe_transfer_id: null,
          hold_released_at: noRealHold ? now.toISOString() : null,
        })
        .eq('id', bookingId)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle();
      if (updateError) throw updateError;
      if (!cancelled) {
        return Response.json({ error: 'This request is no longer pending' }, { status: 409, headers: cors });
      }
      if (hasCardAmount) await raiseRefundedCents(db, bookingId, chargedCents);

      const { error: creditError } = await db.rpc('return_booking_credit', {
        p_booking: bookingId,
        p_percent: 100,
      });
      if (creditError) console.error('cancel-booking: pending credit return failed', bookingId);

      let holdReleased = noRealHold;
      if (paymentIntentId?.startsWith('pi_') && stripeKey) {
        try {
          const { default: Stripe } = await import('https://esm.sh/stripe@16?target=deno');
          const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
          try {
            await stripe.paymentIntents.cancel(
              paymentIntentId,
              {},
              { idempotencyKey: `cancel_${bookingId}` },
            );
            holdReleased = true;
          } catch {
            try {
              const current = await stripe.paymentIntents.retrieve(paymentIntentId);
              holdReleased = current.status === 'canceled';
            } catch {
              holdReleased = false;
            }
          }
        } catch {
          holdReleased = false;
        }
        if (!holdReleased) console.error('cancel-booking: pending hold release failed', bookingId);
      }
      if (holdReleased && !noRealHold) {
        const { error: holdUpdateError } = await db
          .from('bookings')
          .update({ hold_released_at: now.toISOString() })
          .eq('id', bookingId)
          .eq('status', 'cancelled')
          .is('hold_released_at', null);
        if (holdUpdateError) console.error('cancel-booking: hold release timestamp failed', bookingId);
      }

      const recipientId = isStudent ? booking.tutor_id : booking.student_id;
      const { data: actor } = await db.from('users').select('first_name').eq('id', user.id).maybeSingle();
      const actorName = actor?.first_name?.trim() || (isStudent ? 'The student' : 'The tutor');
      const { error: notificationError } = await db.rpc('create_notification', {
        p_user: recipientId,
        p_type: 'booking',
        p_title: 'Session request cancelled',
        p_body: `${actorName} cancelled the ${booking.subject} session request.`,
        p_data: { bookingId },
      });
      if (notificationError) console.error('cancel-booking: counterpart notification failed', bookingId);
      return Response.json(
        { status: 'cancelled', refundPercent: 100, refundStatus: 'refunded', payoutFailed: false, holdReleased },
        { headers: cors },
      );
    }

    // Only an upcoming session can be cancelled; a completed, no-show or disputed one has
    // already settled its money and credit.
    if (booking.status !== 'confirmed') {
      return Response.json(
        { error: 'This booking can no longer be cancelled' },
        { status: 409, headers: cors },
      );
    }

    // Compute refund percent per the cancellation policy.
    let refundPercent: number;
    if (isStudent) {
      const hours = (new Date(booking.scheduled_at).getTime() - now.getTime()) / 3.6e6;
      refundPercent = studentCancelRefundPercent(hours);
    } else {
      // Tutor cancelled → student always fully refunded.
      refundPercent = 100;
      // TODO: increment tutor cancellation-rate tracking when tutor cancels.
    }

    // Real money movement on the held (manual-capture) PaymentIntent:
    //   100% refund → cancel the authorization (nothing captured);
    //   partial     → capture only the non-refunded portion (the rest auto-releases);
    //   0% refund   → capture the full amount (late-cancel fee).
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    const pi = booking.stripe_payment_intent_id as string | null;
    let chargeId: string | null = null;
    let transferId: string | null = null;
    let payoutFailedAt: string | null = null;
    let refundedCents: number | null = null;
    if (stripeKey && pi && pi.startsWith('pi_')) {
      const { default: Stripe } = await import('https://esm.sh/stripe@16?target=deno');
      const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
      try {
        const current = await stripe.paymentIntents.retrieve(pi, { expand: ['latest_charge'] });
        const payLateCancelTutor = async (charge: Parameters<typeof payTutor>[0]['charge']) => {
          if (booking.tutor_payout_amount == null) {
            payoutFailedAt = now.toISOString();
          } else {
            const amount = lateCancelTutorPayoutCents(Number(booking.tutor_payout_amount), refundPercent);
            if (amount > 0) {
              try {
                const { data: profile, error: profileError } = await db
                  .from('tutor_profiles')
                  .select('stripe_connect_account_id')
                  .eq('user_id', booking.tutor_id)
                  .maybeSingle();
                if (profileError) throw profileError;
                const connectId = (profile?.stripe_connect_account_id as string | null | undefined) ?? null;
                await assertPayoutReady(stripeKey, connectId);
                // Funded from the part of the charge that was kept; any Noot-credit
                // remainder comes from the platform balance (see _shared/payouts.ts).
                const payout = await payTutor({
                  stripe,
                  bookingId,
                  destination: connectId!,
                  payoutCents: amount,
                  charge,
                  idempotencyKey: `cancel_transfer_${bookingId}`,
                  metadata: {
                    booking_id: bookingId,
                    reason: 'late_cancel',
                    refund_percent: String(refundPercent),
                  },
                });
                transferId = payout.transferId;
                if (!payout.complete) {
                  payoutFailedAt = now.toISOString();
                  console.error('cancel-booking: late-cancel payout failed', bookingId, `owed ${payout.shortfallCents}c`, String(payout.error));
                }
              } catch (transferErr) {
                payoutFailedAt = now.toISOString();
                console.error('cancel-booking: late-cancel payout failed', bookingId, String(transferErr));
              }
            }
          }
        };

        if (current.status === 'canceled') {
          refundPercent = 100;
        } else if (current.status === 'succeeded') {
          if (await otherOutcomeTransferExists(stripe, bookingId, refundPercent < 100 ? 'late_cancel' : null)) {
            return Response.json({ error: 'This session was already completed or cancelled.' }, { status: 409, headers: cors });
          }
          const charge = current.latest_charge;
          if (!charge || typeof charge === 'string') throw new Error('Captured charge was not expanded');
          const refunded = await capturedRefundCents(stripe, charge);
          const owed = refundOwedCents(charge, refunded, refundPercent);
          const refundedAfter = refunded + owed;
          if (owed > 0) {
            await stripe.refunds.create(
              {
                charge: charge.id,
                amount: owed,
                metadata: { booking_id: bookingId, reason: 'cancel' },
              },
              { idempotencyKey: `cancelrefund_${bookingId}` },
            );
          }
          refundPercent = Math.max(refundPercent, chargeRefundPercent(charge, refundedAfter));
          refundedCents = chargeRefundedCents(charge, refundedAfter);
          chargeId = charge.id;
          if (refundPercent < 100) await payLateCancelTutor(charge);
        } else {
          if (refundPercent === 100) {
            await stripe.paymentIntents.cancel(pi, {}, { idempotencyKey: `cancel_${bookingId}` });
          } else {
            // The card was held for session price plus service fee, minus any Noot credit.
            const captureCents = Math.round((chargedCents * (100 - refundPercent)) / 100);
            const capturedPi = await stripe.paymentIntents.capture(
              pi,
              { amount_to_capture: captureCents, expand: ['latest_charge'] },
              { idempotencyKey: `cancelcap_${bookingId}` },
            );
            const charge = typeof capturedPi.latest_charge === 'string' ? null : capturedPi.latest_charge;
            chargeId = typeof capturedPi.latest_charge === 'string' ? capturedPi.latest_charge : (charge?.id ?? null);
            await payLateCancelTutor(charge);
          }
        }
      } catch (stripeErr) {
        console.error('cancel-booking: payment step failed', bookingId, String(stripeErr));
        return Response.json(
          { error: 'The payment step failed. Please try again.' },
          { status: 400, headers: cors },
        );
      }
    }

    if (refundedCents === null && hasCardAmount) {
      refundedCents = chargedCents - Math.round((chargedCents * (100 - refundPercent)) / 100);
    }
    const base = {
      status: 'cancelled',
      cancelled_by_role: isStudent ? 'student' : 'tutor',
      cancelled_from_status: 'confirmed',
      cancelled_at: now.toISOString(),
      stripe_charge_id: chargeId,
      stripe_transfer_id: transferId,
      ...(payoutFailedAt ? { payout_failed_at: payoutFailedAt } : {}),
    };
    const { data: updated, error: updateError } =
      await updateConfirmedBookingRaiseOnly(db, bookingId, base, refundPercent, refundedCents);

    if (updateError) {
      return Response.json({ error: updateError.message }, { status: 400, headers: cors });
    }
    if (!updated) {
      return Response.json({ error: 'This booking is no longer cancellable' }, { status: 409, headers: cors });
    }
    const actualRefundPercent = Number(updated.refund_percent);
    const actualRefundStatus = updated.refund_status;

    // Noot credit comes back in the same proportion as the cash refund (cumulative, so a
    // later full refund in Stripe tops it up; repeating changes nothing).
    if (Number(booking.credit_applied ?? 0) > 0) {
      const { error: creditErr } = await db.rpc('return_booking_credit', { p_booking: bookingId, p_percent: actualRefundPercent });
      if (creditErr) console.error('cancel-booking: credit return failed', bookingId, creditErr.message);
    }

    const recipientId = isStudent ? booking.tutor_id : booking.student_id;
    const { data: actor } = await db.from('users').select('first_name').eq('id', user.id).maybeSingle();
    const actorName = actor?.first_name?.trim() || (isStudent ? 'The student' : 'The tutor');
    const { error: notificationError } = await db.rpc('create_notification', {
      p_user: recipientId,
      p_type: 'booking',
      p_title: 'Session cancelled',
      p_body: `${actorName} cancelled your ${booking.subject} session.`,
      p_data: { bookingId },
    });
    if (notificationError) console.error('cancel-booking: counterpart notification failed', bookingId);

    return Response.json(
      { status: 'cancelled', refundPercent: actualRefundPercent, refundStatus: actualRefundStatus, payoutFailed: !!payoutFailedAt },
      { headers: cors },
    );
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 400, headers: cors });
  }
});
