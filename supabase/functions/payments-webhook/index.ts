// Edge Function: payments-webhook (our business webhook — NOT the Stripe Sync Engine's
// `stripe-webhook`, which is a separate endpoint). verify_jwt is OFF; auth is the Stripe
// signature (STRIPE_WEBHOOK_SECRET). Handles the events our payout/refund flow cares about:
//   - account.updated   → cache the tutor's Connect charges/payouts readiness
//   - charge.refunded   → mark the booking refunded (reconciliation); give the student back
//                         the same share of the Noot credit they used, and on a FULL refund
//                         take back the invite reward the session earned (0040)
//   - charge.dispute.created → take back the invite reward the session earned
//   - charge.dispute.closed (lost) → give the student back the credit they used
// Credit failures (CreditError) return 500 so Stripe redelivers; every credit call is idempotent.
//   - payment_intent.succeeded → no-op (money moves synchronously in complete-session)
import Stripe from 'https://esm.sh/stripe@16?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type Db = ReturnType<typeof createClient>;

/** A credit-side failure: answered with 500 so Stripe redelivers the event. */
class CreditError extends Error {}

/** The booking behind a PaymentIntent, if any. */
async function bookingFor(db: Db, paymentIntentId: string): Promise<string | null> {
  const { data, error } = await db.from('bookings').select('id').eq('stripe_payment_intent_id', paymentIntentId).maybeSingle();
  if (error) throw new CreditError(`booking lookup failed: ${error.message}`);
  return (data?.id as string | undefined) ?? null;
}

/** Run a credit RPC; throws so the handler answers 500 and Stripe retries. */
async function creditRpc(db: Db, fn: string, args: Record<string, unknown>): Promise<void> {
  const { error } = await db.rpc(fn, args);
  if (error) throw new CreditError(`${fn} failed: ${error.message}`);
}

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
          const bookingId = await bookingFor(db, pi);
          if (bookingId) {
            // Same share of credit as of cash. A cancelled hold that never captured counts as 100%.
            const pct = charge.amount_captured > 0
              ? Math.min(100, Math.round((charge.amount_refunded / charge.amount_captured) * 100))
              : 100;
            await creditRpc(db, 'return_booking_credit', { p_booking: bookingId, p_percent: pct });
            // `refunded` is true only for a full refund.
            if (charge.refunded) await creditRpc(db, 'reverse_invite_rewards', { p_booking: bookingId });
          }
        }
        break;
      }
      case 'charge.dispute.created':
      case 'charge.dispute.closed': {
        const dispute = event.data.object as Stripe.Dispute;
        const pi = typeof dispute.payment_intent === 'string' ? dispute.payment_intent : dispute.payment_intent?.id;
        const bookingId = pi ? await bookingFor(db, pi) : null;
        if (!bookingId) break;
        if (event.type === 'charge.dispute.created') {
          // The inviter's $5 comes back now; the student's credit only if we lose.
          await creditRpc(db, 'reverse_invite_rewards', { p_booking: bookingId });
        } else if (dispute.status === 'lost') {
          await creditRpc(db, 'return_booking_credit', { p_booking: bookingId, p_percent: 100 });
        }
        break;
      }
      default:
        break; // payment_intent.succeeded etc. — no-op
    }
  } catch (err) {
    if (err instanceof CreditError) {
      console.error('payments-webhook credit error:', String(err));
      return new Response('Credit update failed; please retry', { status: 500 });
    }
    // Log-and-ack: returning 200 avoids Stripe retphony storms; failures are visible in logs.
    console.error('payments-webhook handler error:', String(err));
  }

  return Response.json({ received: true });
});
