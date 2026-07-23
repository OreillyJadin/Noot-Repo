// Edge Function: complete-session.
// The caller must be the booking's TUTOR. Marks a confirmed session complete: captures the
// held PaymentIntent, transfers the tutor's payout to their Connect account, sets
// status='completed', then fires award-referral-bonus (non-fatal). Idempotent: a booking
// already 'completed' is a no-op. Simulated bookings (sim_pi_…) just flip to completed.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

    const { bookingId } = await req.json().catch(() => ({}));
    if (!bookingId) return Response.json({ error: 'bookingId required' }, { status: 400, headers: cors });

    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: booking } = await db
      .from('bookings')
      .select('id, tutor_id, status, stripe_payment_intent_id, tutor_payout_amount')
      .eq('id', bookingId)
      .maybeSingle();
    if (!booking) return Response.json({ error: 'booking not found' }, { status: 404, headers: cors });
    if (booking.tutor_id !== user.id) return Response.json({ error: 'forbidden' }, { status: 403, headers: cors });
    if (booking.status === 'completed') return Response.json({ status: 'completed', captured: false, alreadyComplete: true }, { headers: cors });
    if (booking.status !== 'confirmed') {
      return Response.json({ error: `Cannot complete a ${booking.status} session` }, { status: 400, headers: cors });
    }

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
      if (!connectId) {
        return Response.json({ error: 'Set up payouts before completing — no connected Stripe account.' }, { status: 400, headers: cors });
      }

      const { default: Stripe } = await import('https://esm.sh/stripe@16?target=deno');
      const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });

      const capturedPi = await stripe.paymentIntents.capture(pi, {}, { idempotencyKey: `capture_${bookingId}` });
      captured = true;
      chargeId = typeof capturedPi.latest_charge === 'string' ? capturedPi.latest_charge : (capturedPi.latest_charge?.id ?? null);

      const transfer = await stripe.transfers.create(
        {
          amount: Math.round(Number(booking.tutor_payout_amount) * 100),
          currency: 'usd',
          destination: connectId,
          transfer_group: bookingId,
          metadata: { booking_id: bookingId },
        },
        { idempotencyKey: `transfer_${bookingId}` },
      );
      transferId = transfer.id;
    }

    const { error: upErr } = await db
      .from('bookings')
      .update({ status: 'completed', stripe_charge_id: chargeId, stripe_transfer_id: transferId })
      .eq('id', bookingId);
    if (upErr) throw upErr;

    // Referral bonus (service-role internal call) — never fatal to completion.
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

    return Response.json({ status: 'completed', captured, transferId }, { headers: cors });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 400, headers: cors });
  }
});
