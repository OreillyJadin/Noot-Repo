// Edge Function: create-payment-intent (ARCHITECTURE.md §5).
// B4 → create a Stripe PaymentIntent with MANUAL capture (held payment), released
// to the tutor on session completion. Deno runtime. Skeleton — wire the real
// booking lookup, application_fee_amount (Free/$0 at launch), and auth check.
//
// This is one of the two allowed places to import Stripe directly.
import Stripe from 'https://esm.sh/stripe@16?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
});

Deno.serve(async (req: Request) => {
  try {
    const { amountCents } = await req.json();
    const intent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      capture_method: 'manual', // held until session completion
      // application_fee_amount: 0, // Free at launch; toggle on later
    });
    return Response.json({ clientSecret: intent.client_secret });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 400 });
  }
});
