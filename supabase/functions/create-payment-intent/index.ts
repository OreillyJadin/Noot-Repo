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
      // Same shape as the real branch so the client has one code path.
      return Response.json(
        {
          paymentIntentClientSecret: 'sim_secret_' + crypto.randomUUID(),
          ephemeralKeySecret: null,
          customerId: null,
          paymentIntentId: 'sim_pi_' + crypto.randomUUID(),
          simulated: true,
        },
        { headers: cors },
      );
    }

    // Service-role client to read/persist the user's Stripe customer id.
    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { default: Stripe } = await import('https://esm.sh/stripe@16?target=deno');
    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });

    // A persistent Stripe Customer per user powers PaymentSheet (saved cards / Link).
    const { data: urow } = await db.from('users').select('stripe_customer_id').eq('id', user.id).maybeSingle();
    let customerId = (urow?.stripe_customer_id as string | null | undefined) ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email ?? undefined, metadata: { user_id: user.id } });
      customerId = customer.id;
      await db.from('users').update({ stripe_customer_id: customerId }).eq('id', user.id);
    }

    const ephemeralKey = await stripe.ephemeralKeys.create({ customer: customerId }, { apiVersion: '2024-06-20' });

    const intent = await stripe.paymentIntents.create({
      amount: Math.round(amountCents),
      currency: 'usd',
      capture_method: 'manual', // held until session completion (captured in complete-session)
      customer: customerId,
      automatic_payment_methods: { enabled: true },
      metadata: { user_id: user.id },
    });

    return Response.json(
      {
        paymentIntentClientSecret: intent.client_secret,
        ephemeralKeySecret: ephemeralKey.secret,
        customerId,
        paymentIntentId: intent.id,
        simulated: false,
      },
      { headers: cors },
    );
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 400, headers: cors });
  }
});
