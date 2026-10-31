// Edge Function: payments-webhook (our business webhook — NOT the Stripe Sync Engine's
// `stripe-webhook`, which is a separate endpoint). verify_jwt is OFF; auth is either the
// platform endpoint signature (STRIPE_WEBHOOK_SECRET) or the Connect endpoint signature
// (STRIPE_CONNECT_WEBHOOK_SECRET). Connect events only process account.updated:
//   - account.updated   → cache Accounts v2 transfer/payout capability readiness
//   - charge.refunded / refund.updated / refund.failed / charge.refund.updated
//     → reconcile successful refunds from Stripe, including downward corrections on failure
//   - charge.refunded also proportionally reverses tutor transfers (_shared/reversals.ts)
//   - charge.dispute.created → take back the invite reward the session earned
//   - charge.dispute.closed (lost) → give the student back the credit they used
// Every handler failure returns 500 so Stripe redelivers; all handlers are idempotent.
//   - payment_intent.succeeded → no-op (money moves synchronously in complete-session)
import Stripe from 'https://esm.sh/stripe@16?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getPayoutStatus } from '../_shared/connect.ts';
import { reconcileRefunds } from '../_shared/refundReconciliation.ts';
import { verifyWithAnySecret, webhookSecrets } from '../_shared/webhook.ts';
import { serveWithErrorReporting } from '../_shared/observability.ts';
import { settleTutorReversals } from '../_shared/reversals.ts';
import { reconcileDispute } from '../_shared/disputes.ts';

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
      case 'charge.refunded':
      case 'refund.failed':
      case 'refund.updated':
      case 'charge.refund.updated': {
        const object = event.data.object;
        const reference = event.type === 'charge.refunded'
          ? (object as Stripe.Charge).id : (object as Stripe.Refund).charge;
        const chargeId = typeof reference === 'string' ? reference : reference?.id;
        if (!chargeId) break;
        const result = await reconcileRefunds(db, stripe, chargeId);
        if (result) {
          await creditRpc(db, 'return_booking_credit', { p_booking: result.bookingId, p_percent: result.percent });
          if (result.full) await creditRpc(db, 'reverse_invite_rewards', { p_booking: result.bookingId });
          await settleTutorReversals(db, stripe, result.bookingId, chargeId);
        }
        break;
      }
      case 'charge.dispute.created':
      case 'charge.dispute.closed': {
        const result = await reconcileDispute(db, stripe, (event.data.object as Stripe.Dispute).id);
        if (result) {
          if (result.status === 'lost') {
            await creditRpc(db, 'return_booking_credit', { p_booking: result.bookingId, p_percent: 100 });
          } else if (result.status !== 'won' && result.status !== 'warning_closed') {
            await creditRpc(db, 'reverse_invite_rewards', { p_booking: result.bookingId });
          }
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
