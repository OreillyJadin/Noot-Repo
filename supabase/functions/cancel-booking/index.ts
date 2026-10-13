// Edge Function: cancel-booking.
// Cancels a booking and records the intended refund state per the cancellation
// policy. Either party to the booking may cancel:
//   - Student cancels: refund tiered by lead time (12h+ → 100%, >=2h → 50%, else 0%).
//     On late cancellations, the tutor is paid their non-refunded share of the stored payout.
//   - Tutor cancels: student is always refunded 100%.
//
// Deno runtime.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireActiveUser } from '../_shared/auth.ts';
import { assertPayoutReady } from '../_shared/booking.ts';
import { lateCancelTutorPayoutCents, studentCancelRefundPercent } from '../_shared/cancellation.ts';

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
      .select('id, student_id, tutor_id, scheduled_at, status, price, credit_applied, tutor_payout_amount, stripe_payment_intent_id')
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

    // Compute refund percent per the cancellation policy.
    const now = new Date();
    let refundPercent: number;
    if (isStudent) {
      const hours = (new Date(booking.scheduled_at).getTime() - now.getTime()) / 3.6e6;
      refundPercent = studentCancelRefundPercent(hours);
    } else {
      // Tutor cancelled → student always fully refunded.
      refundPercent = 100;
      // TODO: increment tutor cancellation-rate tracking when tutor cancels.
    }

    const refundStatus = refundPercent > 0 ? 'refunded' : 'not_refunded';

    // Real money movement on the held (manual-capture) PaymentIntent:
    //   100% refund → cancel the authorization (nothing captured);
    //   partial     → capture only the non-refunded portion (the rest auto-releases);
    //   0% refund   → capture the full amount (late-cancel fee).
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    const pi = booking.stripe_payment_intent_id as string | null;
    let chargeId: string | null = null;
    let transferId: string | null = null;
    let payoutFailedAt: string | null = null;
    if (stripeKey && pi && pi.startsWith('pi_')) {
      const { default: Stripe } = await import('https://esm.sh/stripe@16?target=deno');
      const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
      try {
        if (refundPercent === 100) {
          await stripe.paymentIntents.cancel(pi, {}, { idempotencyKey: `cancel_${bookingId}` });
        } else {
          // The card was held for the price minus any Noot credit (0040), so the late-cancel
          // share comes out of that, not the full price.
          // Whole cents, so e.g. $17.33 − $5 can't round a cent away.
          const chargedCents = Math.round(Number(booking.price) * 100) - Math.round(Number(booking.credit_applied ?? 0) * 100);
          const captureCents = Math.round((chargedCents * (100 - refundPercent)) / 100);
          const capturedPi = await stripe.paymentIntents.capture(
            pi,
            { amount_to_capture: captureCents },
            { idempotencyKey: `cancelcap_${bookingId}` },
          );
          chargeId = typeof capturedPi.latest_charge === 'string'
            ? capturedPi.latest_charge
            : (capturedPi.latest_charge?.id ?? null);

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
                await assertPayoutReady(stripe, connectId);
                const transfer = await stripe.transfers.create(
                  {
                    amount,
                    currency: 'usd',
                    destination: connectId!,
                    transfer_group: bookingId,
                    metadata: {
                      booking_id: bookingId,
                      reason: 'late_cancel',
                      refund_percent: String(refundPercent),
                    },
                  },
                  { idempotencyKey: `cancel_transfer_${bookingId}` },
                );
                transferId = transfer.id;
              } catch (transferErr) {
                payoutFailedAt = now.toISOString();
                console.error('cancel-booking: late-cancel payout failed', bookingId, String(transferErr));
              }
            }
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

    const { error: updateError } = await db
      .from('bookings')
      .update({
        status: 'cancelled',
        cancelled_at: now.toISOString(),
        refund_percent: refundPercent,
        refund_status: refundStatus,
        stripe_charge_id: chargeId,
        stripe_transfer_id: transferId,
        ...(payoutFailedAt ? { payout_failed_at: payoutFailedAt } : {}),
      })
      .eq('id', bookingId);

    if (updateError) {
      return Response.json({ error: updateError.message }, { status: 400, headers: cors });
    }

    // Noot credit comes back in the same proportion as the cash refund (cumulative, so a
    // later full refund in Stripe tops it up; repeating changes nothing).
    if (Number(booking.credit_applied ?? 0) > 0) {
      const { error: creditErr } = await db.rpc('return_booking_credit', { p_booking: bookingId, p_percent: refundPercent });
      if (creditErr) console.error('cancel-booking: credit return failed', bookingId, creditErr.message);
    }

    return Response.json(
      { status: 'cancelled', refundPercent, refundStatus, payoutFailed: !!payoutFailedAt },
      { headers: cors },
    );
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 400, headers: cors });
  }
});
