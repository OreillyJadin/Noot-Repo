// Edge Function: payments-webhook (our business webhook — NOT the Stripe Sync Engine's
// `stripe-webhook`, which is a separate endpoint). verify_jwt is OFF; auth is either the
// platform endpoint signature (STRIPE_WEBHOOK_SECRET) or the Connect endpoint signature
// (STRIPE_CONNECT_WEBHOOK_SECRET). Connect events only process account.updated:
//   - account.updated   → cache Accounts v2 transfer/payout capability readiness
//   - charge.refunded   → mark the booking refunded, record refund_percent as the raise-only
//                         share of the charge returned to the student, give back the same share
//                         of Noot credit, and on a FULL refund take back the invite reward (0040)
//   - charge.refunded also proportionally reverses tutor transfers (_shared/reversals.ts)
//   - charge.dispute.created → take back the invite reward the session earned
//   - charge.dispute.closed (lost) → give the student back the credit they used
// Every handler failure returns 500 so Stripe redelivers; all handlers are idempotent.
//   - payment_intent.succeeded → no-op (money moves synchronously in complete-session)
import Stripe from 'https://esm.sh/stripe@16?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getPayoutStatus } from '../_shared/connect.ts';
import { capturedRefundCents, chargeRefundPercent } from '../_shared/refunds.ts';
import { verifyWithAnySecret, webhookSecrets } from '../_shared/webhook.ts';
import { serveWithErrorReporting } from '../_shared/observability.ts';
import { settleTutorReversals } from '../_shared/reversals.ts';

type Db = ReturnType<typeof createClient>;

/** A handler failure: answered with 500 so Stripe redelivers the event. */
class RetryableError extends Error {}

/** The booking behind a PaymentIntent, if any. */
async function bookingFor(db: Db, paymentIntentId: string): Promise<string | null> {
  const { data, error } = await db.from('bookings').select('id').eq('stripe_payment_intent_id', paymentIntentId).maybeSingle();
  if (error) throw new RetryableError('booking lookup failed');
  return (data?.id as string | undefined) ?? null;
}

/** Run a credit RPC; throws so the handler answers 500 and Stripe retries. */
async function creditRpc(db: Db, fn: string, args: Record<string, unknown>): Promise<void> {
  const { error } = await db.rpc(fn, args);
  if (error) throw new RetryableError(`${fn} failed`);
}

serveWithErrorReporting('payments-webhook', async (req: Request) => {
  const sig = req.headers.get('stripe-signature');
  const secrets = webhookSecrets({
    platform: Deno.env.get('STRIPE_WEBHOOK_SECRET'),
    connect: Deno.env.get('STRIPE_CONNECT_WEBHOOK_SECRET'),
  });
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!sig || secrets.length === 0 || !stripeKey) {
    return new Response('Webhook not configured', { status: 400 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
  const raw = await req.text();
  const event = await verifyWithAnySecret(
    secrets,
    (secret) => stripe.webhooks.constructEventAsync(raw, sig, secret),
  ) as Stripe.Event | null;
  if (!event) return new Response('Bad signature', { status: 400 });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    if (event.account && event.type !== 'account.updated') {
      return Response.json({ received: true });
    }

    switch (event.type) {
      case 'account.updated': {
        const acct = event.data.object as Stripe.Account;
        const { data: profiles, error: lookupError } = await db
          .from('tutor_profiles')
          .select('user_id')
          .eq('stripe_connect_account_id', acct.id);
        if (lookupError) throw new RetryableError('tutor profile lookup failed');
        if (!profiles?.length) break;

        let status;
        try {
          status = await getPayoutStatus(stripeKey, acct.id);
        } catch {
          throw new RetryableError('payout status lookup failed');
        }

        const { error: updateError } = await db
          .from('tutor_profiles')
          .update({
            // Cache transfersActive as the booking gate, plus payoutsActive and detailsSubmitted.
            stripe_charges_enabled: !status.closed && status.transfersActive,
            stripe_payouts_enabled: !status.closed && status.payoutsActive,
            stripe_onboarded_at: !status.closed && status.detailsSubmitted ? new Date().toISOString() : null,
          })
          .eq('stripe_connect_account_id', acct.id);
        if (updateError) throw new RetryableError('tutor profile update failed');
        break;
      }
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        const pi = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
        if (pi) {
          let refundedCents: number;
          try {
            refundedCents = await capturedRefundCents(stripe, charge);
          } catch {
            throw new RetryableError('charge refunds lookup failed');
          }
          const pct = chargeRefundPercent(charge, refundedCents);
          const { error: updateError } = await db
            .from('bookings')
            .update({ refund_status: 'refunded', stripe_refund_id: charge.refunds?.data?.[0]?.id ?? null })
            .eq('stripe_payment_intent_id', pi);
          if (updateError) throw new RetryableError('booking refund update failed');
          const { error: percentError } = await db
            .from('bookings')
            .update({ refund_percent: pct })
            .eq('stripe_payment_intent_id', pi)
            .lt('refund_percent', pct);
          if (percentError) throw new RetryableError('booking refund percent update failed');
          const bookingId = await bookingFor(db, pi);
          if (bookingId) {
            // Same share of credit as of cash. A cancelled hold that never captured counts as 100%.
            await creditRpc(db, 'return_booking_credit', { p_booking: bookingId, p_percent: pct });
            // `refunded` is true only for a full refund.
            if (charge.refunded) await creditRpc(db, 'reverse_invite_rewards', { p_booking: bookingId });
            await settleTutorReversals(db, stripe, bookingId, charge.id).catch((error) => { throw new RetryableError(error instanceof Error ? error.message : 'transfer reversal failed'); });
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
    const message = err instanceof RetryableError ? err.message : 'unexpected handler error';
    console.error(`payments-webhook ${event.type} ${event.id} failed: ${message}`);
    return new Response('Webhook handling failed; please retry', { status: 500 });
  }

  return Response.json({ received: true });
});
