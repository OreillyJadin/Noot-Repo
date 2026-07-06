// Edge Function: create-payment-intent (ARCHITECTURE.md §5).
// B4 → create a Stripe PaymentIntent with MANUAL capture (held payment), released
// to the tutor on session completion. Deno runtime.
//
// Body: { amountCents }. If STRIPE_SECRET_KEY is set we create a real manual-capture
// PaymentIntent; otherwise we return a simulated intent so local/dev never crashes.
// This is one of the two allowed places to import Stripe directly.
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

    const body = await req.json().catch(() => ({}));
    const amountCents = Number(body?.amountCents);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return Response.json({ error: 'amountCents must be a positive number' }, { status: 400, headers: cors });
    }

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');

    if (!stripeKey) {
      // No Stripe key configured (local/dev): return a simulated intent, never crash.
      // TODO(stripe): set STRIPE_SECRET_KEY to create real manual-capture PaymentIntents.
      return Response.json(
        {
          clientSecret: 'sim_secret_' + crypto.randomUUID(),
          paymentIntentId: 'sim_pi_' + crypto.randomUUID(),
          simulated: true,
        },
        { headers: cors },
      );
    }

    const { default: Stripe } = await import('https://esm.sh/stripe@16?target=deno');
    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
    const intent = await stripe.paymentIntents.create({
      amount: Math.round(amountCents),
      currency: 'usd',
      capture_method: 'manual', // held until session completion
      // application_fee_amount: 0, // Free at launch; toggle on later
      metadata: { user_id: user.id },
    });

    return Response.json(
      {
        clientSecret: intent.client_secret,
        paymentIntentId: intent.id,
        simulated: false,
      },
      { headers: cors },
    );
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 400, headers: cors });
  }
});
