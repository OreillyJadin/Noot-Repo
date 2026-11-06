import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type Stripe from 'https://esm.sh/stripe@16?target=deno';
import { assertPayoutReady, assertSessionElapsed } from './booking.ts';
import { cancelParentExtensions, effectiveDurationMinutes } from './extensions.ts';
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
  extends_booking_id?: string | null;
  stripe_transfer_id?: string | null;
  payout_failed_at?: string | null;
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

async function settleParentExtensions(
  db: SupabaseClient,
  url: string,
  parent: BookingToComplete,
  stripeClient?: Stripe,
): Promise<CompleteResult> {
  if (parent.extends_booking_id) return { status: 200, body: { status: 'completed' } };
  await cancelParentExtensions(db, parent.id, ['pending']);
  const { data: extension, error } = await db.from('bookings')
    .select('id, tutor_id, status, scheduled_at, duration_minutes, stripe_payment_intent_id, tutor_payout_amount, price, extends_booking_id, stripe_transfer_id, payout_failed_at')
    .eq('extends_booking_id', parent.id).eq('status', 'confirmed').maybeSingle();
  if (error) throw error;
  if (!extension) return { status: 200, body: { status: 'completed' } };
  return await completeBooking(db, url, extension as BookingToComplete, stripeClient);
}

export async function completeBooking(
  db: SupabaseClient,
  url: string,
  booking: BookingToComplete,
  stripeClient?: Stripe,
): Promise<CompleteResult> {
  const bookingId = booking.id;
  const paidSession = Number(booking.price) > 0;
  const alreadyComplete = booking.status === 'completed';
  const pi = booking.stripe_payment_intent_id;
  if (alreadyComplete && (!paidSession || pi?.startsWith('sim_pi_')
      || (booking.stripe_transfer_id && !booking.payout_failed_at))) {
    const extensionResult = await settleParentExtensions(db, url, booking, stripeClient);
    if (extensionResult.status !== 200) return extensionResult;
    if (paidSession && !booking.extends_booking_id) await awardInvites(url, bookingId);
    return { status: 200, body: { status: 'completed', captured: false, alreadyComplete: true } };
  }
  if (!alreadyComplete && booking.status !== 'confirmed') {
    return { status: 400, body: { error: `Cannot complete a ${booking.status} session` } };
  }

  if (!alreadyComplete) {
    const duration = booking.extends_booking_id
      ? Number(booking.duration_minutes)
      : await effectiveDurationMinutes(db, bookingId, Number(booking.duration_minutes));
    assertSessionElapsed(booking.scheduled_at, duration);
  }

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (stripeKey && paidSession && !pi) {
    return { status: 409, body: { error: 'This session has no confirmed payment and cannot be completed.' } };
  }
  if (alreadyComplete && (!stripeKey || !pi?.startsWith('pi_'))) {
    return { status: 503, body: { error: 'The session payout cannot be retried right now.' } };
  }
  let captured = false;
  let transferId: string | null = null;
  let chargeId: string | null = null;

  if (stripeKey && pi && pi.startsWith('pi_')) {
    const stripe = stripeClient ?? new (await import('https://esm.sh/stripe@16?target=deno')).default(
      stripeKey, { apiVersion: '2024-06-20' },
    );
    const currentPi = await stripe.paymentIntents.retrieve(pi, { expand: ['latest_charge'] });

    if (currentPi.status === 'canceled') {
      if (alreadyComplete) return { status: 409, body: { error: 'This session has no captured payment to pay out.' } };
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
      await cancelParentExtensions(db, bookingId);
      console.error('complete-session: payment hold expired', bookingId);
      return {
        status: 409,
        body: {
          error: "The payment hold for this session expired, so the student wasn't charged and the session has been closed.",
          holdExpired: true,
        },
      };
    }
    if (currentPi.status !== 'succeeded' && (alreadyComplete || currentPi.status !== 'requires_capture')) {
      return { status: 409, body: { error: 'This session has no captured payment to pay out.' } };
    }

    const { data: prof } = await db
      .from('tutor_profiles')
      .select('stripe_connect_account_id')
      .eq('user_id', booking.tutor_id)
      .maybeSingle();
    const connectId = (prof?.stripe_connect_account_id as string | null | undefined) ?? null;

    await assertPayoutReady(stripeKey, connectId);

    const capturedPi = currentPi.status === 'succeeded' ? currentPi : await stripe.paymentIntents.capture(
      pi,
      { expand: ['latest_charge'] },
      { idempotencyKey: `capture_${bookingId}` },
    );
    captured = currentPi.status !== 'succeeded';
    const charge = typeof capturedPi.latest_charge === 'string'
      ? await stripe.charges.retrieve(capturedPi.latest_charge) : capturedPi.latest_charge;
    if (!charge?.id || charge.amount_captured <= 0) throw new Error('Captured session charge missing');
    chargeId = charge.id;

    const payout = await payTutor({
      stripe,
      bookingId,
      destination: connectId!,
      payoutCents: Math.round(Number(booking.tutor_payout_amount) * 100),
      originalPayoutCents: Math.round(Number(booking.tutor_payout_amount) * 100),
      charge,
      idempotencyKey: `transfer_${bookingId}`,
      metadata: { booking_id: bookingId },
    });
    transferId = payout.transferId ?? booking.stripe_transfer_id ?? null;
    if (!payout.complete) {
      const failedAt = new Date().toISOString();
      const { data: flagged, error: flagError } = await db
        .from('bookings')
        .update({ status: 'completed', stripe_charge_id: chargeId, stripe_transfer_id: transferId, payout_failed_at: failedAt })
        .eq('id', bookingId)
        .eq('status', alreadyComplete ? 'completed' : 'confirmed')
        .select('id');
      if (flagError) throw flagError;
      if (!flagged?.length) {
        await db.from('bookings').update({ payout_failed_at: failedAt }).eq('id', bookingId);
        console.error('complete-session: captured, transfer failed and the booking left confirmed meanwhile', bookingId, chargeId);
      }
      console.error('complete-session: captured but transfer failed', bookingId, `owed ${payout.shortfallCents}c`, String(payout.error));
      if (flagged?.length) {
        const extensionResult = await settleParentExtensions(db, url, booking, stripeClient);
        if (extensionResult.status !== 200) {
          console.error('complete-session: extension settlement failed', bookingId);
        }
      }
      if (paidSession && !booking.extends_booking_id) await awardInvites(url, bookingId);
      return {
        status: 502,
        body: {
          error: 'The payment was taken but the payout to the tutor failed. Our team has been notified and will complete it.',
          captured,
          payoutFailed: true,
        },
      };
    }
  }

  const { data: completedRows, error: upError } = await db
    .from('bookings')
    .update({ status: 'completed', stripe_charge_id: chargeId, stripe_transfer_id: transferId, payout_failed_at: null })
    .eq('id', bookingId)
    .eq('status', alreadyComplete ? 'completed' : 'confirmed')
    .select('id');
  if (upError) throw upError;
  if (!completedRows?.length) {
    if (captured) console.error('complete-session: captured but the booking left confirmed meanwhile', bookingId);
    return { status: 409, body: { error: CANCELLED_MESSAGE } };
  }

  const extensionResult = await settleParentExtensions(db, url, booking, stripeClient);
  if (extensionResult.status !== 200) return extensionResult;
  if (paidSession && !booking.extends_booking_id) await awardInvites(url, bookingId);

  return { status: 200, body: { status: 'completed', captured, transferId, ...(alreadyComplete ? { alreadyComplete: true } : {}) } };
}
