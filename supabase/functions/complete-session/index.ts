// Edge Function: complete-session.
// The caller must be the booking's TUTOR. Marks a confirmed session complete: captures the
// held PaymentIntent, transfers the tutor's payout to their Connect account, sets
// status='completed', then fires award-referral-bonus (non-fatal). Idempotent: a booking
// already 'completed' is a no-op apart from re-firing the award. Simulated bookings
// (sim_pi_…) just flip to completed.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { BookingError, assertPayoutReady, assertSessionElapsed } from '../_shared/booking.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Invite reward for a completed session (service-role internal call). Never fatal, and safe
// to repeat — award_invite_rewards pays each invited person's inviter once, ever.
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

    const { bookingId } = await req.json().catch(() => ({}));
    if (!bookingId) return Response.json({ error: 'bookingId required' }, { status: 400, headers: cors });

    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: booking } = await db
      .from('bookings')
      .select('id, tutor_id, status, scheduled_at, duration_minutes, stripe_payment_intent_id, tutor_payout_amount')
      .eq('id', bookingId)
      .maybeSingle();
    if (!booking) return Response.json({ error: 'booking not found' }, { status: 404, headers: cors });
    if (booking.tutor_id !== user.id) return Response.json({ error: 'forbidden' }, { status: 403, headers: cors });
    if (booking.status === 'completed') {
      // A retry, e.g. after the payout failed below: the reward may not have fired yet.
      await awardInvites(url, bookingId);
      return Response.json({ status: 'completed', captured: false, alreadyComplete: true }, { headers: cors });
    }
    if (booking.status !== 'confirmed') {
      return Response.json({ error: `Cannot complete a ${booking.status} session` }, { status: 400, headers: cors });
    }

    // A session can only be completed once it's actually over. Without this a tutor could
    // capture the hold for a session days away.
    assertSessionElapsed(booking.scheduled_at as string, Number(booking.duration_minutes));

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    const pi = booking.stripe_payment_intent_id as string | null;
    let captured = false;
    let transferId: string | null = null;
    let chargeId: string | null = null;

    // Real held payment → capture + transfer the payout to the tutor's connected account.
    if (stripeKey && pi && pi.startsWith('pi_')) {
      const { data: prof } = await db
        .from('tutor_profiles')
        .select('stripe_connect_account_id')
        .eq('user_id', booking.tutor_id)
        .maybeSingle();
      const connectId = (prof?.stripe_connect_account_id as string | null | undefined) ?? null;

      const { default: Stripe } = await import('https://esm.sh/stripe@16?target=deno');
      const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });

      // Check the destination BEFORE capturing. Capture-then-fail used to leave the
      // student charged, the tutor unpaid and the booking still 'confirmed'.
      await assertPayoutReady(stripe, connectId);

      const capturedPi = await stripe.paymentIntents.capture(pi, {}, { idempotencyKey: `capture_${bookingId}` });
      captured = true;
      chargeId = typeof capturedPi.latest_charge === 'string' ? capturedPi.latest_charge : (capturedPi.latest_charge?.id ?? null);

      try {
        const transfer = await stripe.transfers.create(
          {
            amount: Math.round(Number(booking.tutor_payout_amount) * 100),
            currency: 'usd',
            destination: connectId!,
            transfer_group: bookingId,
            metadata: { booking_id: bookingId },
          },
          { idempotencyKey: `transfer_${bookingId}` },
        );
        transferId = transfer.id;
      } catch (transferErr) {
        // The money IS captured at this point, so record that fact and flag the booking
        // rather than throwing and leaving the row looking untouched. Both ids are
        // idempotency-keyed, so a retry resumes safely.
        await db
          .from('bookings')
          .update({ status: 'completed', stripe_charge_id: chargeId, payout_failed_at: new Date().toISOString() })
          .eq('id', bookingId);
        console.error('complete-session: captured but transfer failed', bookingId, String(transferErr));
        // The session did happen and was paid for, so the invite reward still applies.
        await awardInvites(url, bookingId);
        return Response.json(
          {
            error: 'The payment was taken but the payout to the tutor failed. Our team has been notified and will complete it.',
            captured: true,
            payoutFailed: true,
          },
          { status: 502, headers: cors },
        );
      }
    }

    const { error: upErr } = await db
      .from('bookings')
      .update({ status: 'completed', stripe_charge_id: chargeId, stripe_transfer_id: transferId })
      .eq('id', bookingId);
    if (upErr) throw upErr;

    await awardInvites(url, bookingId);

    return Response.json({ status: 'completed', captured, transferId }, { headers: cors });
  } catch (err) {
    if (err instanceof BookingError) {
      return Response.json({ error: err.message }, { status: err.status, headers: cors });
    }
    // Generic on purpose: Stripe error strings can embed a partially-redacted API key.
    console.error('complete-session failed', JSON.stringify(err), err);
    return Response.json(
      { error: 'Something went wrong completing that session. Please try again.' },
      { status: 400, headers: cors },
    );
  }
});
