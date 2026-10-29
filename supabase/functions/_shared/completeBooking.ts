import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { assertPayoutReady, assertSessionElapsed } from './booking.ts';
import { payTutor } from './payouts.ts';

type BookingToComplete = {
  id: string;
  tutor_id: string;
  status: string;
  scheduled_at: string;
  duration_minutes: number;
  stripe_payment_intent_id: string | null;
  tutor_payout_amount: number;
  price: number;
};

export type CompleteResult = {
  status: number;
  body: Record<string, unknown>;
};

async function awardInvites(url: string, bookingId: string): Promise<void> {
  try {
    await fetch(`${url}/functions/v1/award-referral-bonus`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ bookingId }),
    });
  } catch { /* non-fatal */ }
}

const CANCELLED_MESSAGE = 'This session was cancelled or reported as a no-show.';

export async function completeBooking(
  db: SupabaseClient,
  url: string,
  booking: BookingToComplete,
): Promise<CompleteResult> {
  const bookingId = booking.id;
  const paidSession = Number(booking.price) > 0;
  if (booking.status === 'completed') {
    if (paidSession) await awardInvites(url, bookingId);
    return { status: 200, body: { status: 'completed', captured: false, alreadyComplete: true } };
  }
  if (booking.status !== 'confirmed') {
    return { status: 400, body: { error: `Cannot complete a ${booking.status} session` } };
  }

  assertSessionElapsed(booking.scheduled_at, Number(booking.duration_minutes));

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  const pi = booking.stripe_payment_intent_id;
  let captured = false;
  let transferId: string | null = null;
  let chargeId: string | null = null;

  if (stripeKey && pi && pi.startsWith('pi_')) {
    const { default: Stripe } = await import('https://esm.sh/stripe@16?target=deno');
    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
    const currentPi = await stripe.paymentIntents.retrieve(pi);

    if (currentPi.status === 'canceled') {
      const now = new Date().toISOString();
      const { data: expiredRows, error: expiredError } = await db
        .from('bookings')
        .update({
          status: 'cancelled',
          cancelled_at: now,
          cancelled_from_status: 'confirmed',
          refund_percent: 100,
          refund_status: 'refunded',
          hold_released_at: now,
        })
        .eq('id', bookingId)
        .eq('status', 'confirmed')
        .select('id');
      if (expiredError) throw expiredError;
      if (!expiredRows?.length) {
        return { status: 409, body: { error: CANCELLED_MESSAGE } };
      }
      console.error('complete-session: payment hold expired', bookingId);
      return {
        status: 409,
        body: {
          error: "The payment hold for this session expired, so the student wasn't charged and the session has been closed.",
          holdExpired: true,
        },
      };
    }

    const { data: prof } = await db
      .from('tutor_profiles')
      .select('stripe_connect_account_id')
      .eq('user_id', booking.tutor_id)
      .maybeSingle();
    const connectId = (prof?.stripe_connect_account_id as string | null | undefined) ?? null;

    await assertPayoutReady(stripeKey, connectId);

    const capturedPi = await stripe.paymentIntents.capture(
      pi,
      { expand: ['latest_charge'] },
      { idempotencyKey: `capture_${bookingId}` },
    );
    captured = true;
    const charge = typeof capturedPi.latest_charge === 'string' ? null : capturedPi.latest_charge;
    chargeId = typeof capturedPi.latest_charge === 'string' ? capturedPi.latest_charge : (charge?.id ?? null);

    const payout = await payTutor({
      stripe,
      bookingId,
      destination: connectId!,
      payoutCents: Math.round(Number(booking.tutor_payout_amount) * 100),
      charge,
      idempotencyKey: `transfer_${bookingId}`,
      metadata: { booking_id: bookingId },
    });
    transferId = payout.transferId;
    if (!payout.complete) {
      const failedAt = new Date().toISOString();
      const { data: flagged } = await db
        .from('bookings')
        .update({ status: 'completed', stripe_charge_id: chargeId, stripe_transfer_id: transferId, payout_failed_at: failedAt })
        .eq('id', bookingId)
        .eq('status', 'confirmed')
        .select('id');
      if (!flagged?.length) {
        await db.from('bookings').update({ payout_failed_at: failedAt }).eq('id', bookingId);
        console.error('complete-session: captured, transfer failed and the booking left confirmed meanwhile', bookingId, chargeId);
      }
      console.error('complete-session: captured but transfer failed', bookingId, `owed ${payout.shortfallCents}c`, String(payout.error));
      if (paidSession) await awardInvites(url, bookingId);
      return {
        status: 502,
        body: {
          error: 'The payment was taken but the payout to the tutor failed. Our team has been notified and will complete it.',
          captured: true,
          payoutFailed: true,
        },
      };
    }
  }

  const { data: completedRows, error: upError } = await db
    .from('bookings')
    .update({ status: 'completed', stripe_charge_id: chargeId, stripe_transfer_id: transferId })
    .eq('id', bookingId)
    .eq('status', 'confirmed')
    .select('id');
  if (upError) throw upError;
  if (!completedRows?.length) {
    if (captured) console.error('complete-session: captured but the booking left confirmed meanwhile', bookingId);
    return { status: 409, body: { error: CANCELLED_MESSAGE } };
  }

  if (paidSession) await awardInvites(url, bookingId);

  return { status: 200, body: { status: 'completed', captured, transferId } };
}
