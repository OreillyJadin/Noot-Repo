// Edge Function: payments-webhook (our business webhook — NOT the Stripe Sync Engine's
// `stripe-webhook`, which is a separate endpoint). verify_jwt is OFF; auth is the Stripe
// signature (STRIPE_WEBHOOK_SECRET). Handles the events our payout/refund flow cares about:
//   - account.updated   → cache the tutor's Connect charges/payouts readiness
//   - charge.refunded   → mark the booking refunded (reconciliation)
//   - payment_intent.succeeded → no-op (money moves synchronously in complete-session)
import Stripe from 'https://esm.sh/stripe@16?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  const sig = req.headers.get('stripe-signature');
  const whsec = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!sig || !whsec || !stripeKey) {
    return new Response('Webhook not configured', { status: 400 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig, whsec);
  } catch (err) {
    return new Response(`Bad signature: ${String(err)}`, { status: 400 });
  }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    switch (event.type) {
      case 'account.updated': {
        const acct = event.data.object as Stripe.Account;
        await db
          .from('tutor_profiles')
          .update({
            stripe_charges_enabled: acct.charges_enabled,
            stripe_payouts_enabled: acct.payouts_enabled,
            stripe_onboarded_at: acct.details_submitted ? new Date().toISOString() : null,
          })
          .eq('stripe_connect_account_id', acct.id);
        break;
      }
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        const pi = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
        if (pi) {
          await db
            .from('bookings')
            .update({ refund_status: 'refunded', stripe_refund_id: charge.refunds?.data?.[0]?.id ?? null })
            .eq('stripe_payment_intent_id', pi);
        }
        break;
      }
      default:
        break; // payment_intent.succeeded etc. — no-op
    }
  } catch (err) {
    // Log-and-ack: returning 200 avoids Stripe retphony storms; failures are visible in logs.
    console.error('payments-webhook handler error:', String(err));
  }

  return Response.json({ received: true });
});
