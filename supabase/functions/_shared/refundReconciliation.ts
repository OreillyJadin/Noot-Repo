import type Stripe from 'https://esm.sh/stripe@16?target=deno';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { chargeRefundedCents, chargeRefundPercent } from './refunds.ts';
import { stripeSideRefunds, type RefundLike } from './reversals.ts';

export function settledRefundCents(refunds: RefundLike[], captured: number): number {
  return Math.min(Math.max(0, captured), stripeSideRefunds(refunds)
    .filter((refund) => refund.status === 'succeeded')
    .reduce((sum, refund) => sum + Math.max(0, refund.amount), 0));
}

/** Event objects can be stale. Read current Stripe state before replacing either refund total. */
export async function reconcileRefunds(db: SupabaseClient, stripe: Stripe, chargeId: string) {
  const { data: booking, error: lookupError } = await db.from('bookings')
    .select('id, refund_percent, refunded_cents, refund_status, stripe_transfer_id')
    .eq('stripe_charge_id', chargeId).maybeSingle();
  if (lookupError) throw new Error('booking refund lookup failed');
  const charge = await stripe.charges.retrieve(chargeId);
  const pi = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
  const fallback = !booking && pi ? await db.from('bookings')
    .select('id, refund_percent, refunded_cents, refund_status, stripe_transfer_id')
    .eq('stripe_payment_intent_id', pi).maybeSingle() : null;
  if (fallback?.error) throw new Error('booking refund lookup failed');
  const row = booking ?? fallback?.data;
  if (!row) return null;

  const refunds: RefundLike[] = [];
  for await (const refund of stripe.refunds.list({
    charge: chargeId, limit: 100, expand: ['data.balance_transaction'],
  })) refunds.push(refund as RefundLike);
  const captured = settledRefundCents(refunds, charge.amount_captured);
  const cents = chargeRefundedCents(charge, captured);
  const percent = chargeRefundPercent(charge, captured);
  let update = db.from('bookings').update({
    refunded_cents: cents,
    refund_percent: percent,
    refund_status: cents > 0 ? 'refunded' : 'not_refunded',
    stripe_refund_id: stripeSideRefunds(refunds).filter((refund) => refund.status === 'succeeded').at(-1)?.id ?? null,
  }).eq('id', row.id).eq('refund_percent', row.refund_percent).eq('refund_status', row.refund_status);
  update = row.refunded_cents === null ? update.is('refunded_cents', null) : update.eq('refunded_cents', row.refunded_cents);
  const { data: changed, error: updateError } = await update.select('id').maybeSingle();
  if (updateError || !changed) throw new Error('booking refund changed concurrently; retry');

  const failedIds = new Set(refunds.filter((refund) =>
    refund.status === 'failed' || refund.status === 'canceled').map((refund) => refund.id));
  if (failedIds.size > 0) {
    const { error: obsoleteError } = await db.from('tutor_transfer_reversals')
      .update({ status: 'obsolete', last_error: 'refund failed/canceled; do not reverse tutor funds', updated_at: new Date().toISOString() })
      .eq('booking_id', row.id).in('stripe_refund_id', [...failedIds])
      .eq('status', 'failed').is('stripe_reversal_id', null);
    if (obsoleteError) throw new Error('obsolete reversal follow-up write failed');
    const transfers: Stripe.Transfer[] = [];
    for await (const transfer of stripe.transfers.list({ transfer_group: row.id, limit: 100 })) transfers.push(transfer);
    if (!transfers.length && row.stripe_transfer_id) transfers.push(await stripe.transfers.retrieve(row.stripe_transfer_id));
    for (const transfer of transfers) {
      const amounts = new Map<string, { cents: number; id: string }>();
      for await (const reversal of stripe.transfers.listReversals(transfer.id, { limit: 100 })) {
        const refundId = reversal.metadata?.refund_id;
        if (!refundId || !failedIds.has(refundId)) continue;
        const previous = amounts.get(refundId);
        amounts.set(refundId, { cents: (previous?.cents ?? 0) + reversal.amount, id: reversal.id });
      }
      for (const [refundId, reversed] of amounts) {
        // Stripe reversals cannot be canceled. A new transfer requires a reviewed restoration.
        const { error } = await db.from('tutor_transfer_reversals').upsert({
          booking_id: row.id, stripe_charge_id: chargeId, stripe_refund_id: refundId,
          stripe_transfer_id: transfer.id, stripe_reversal_id: reversed.id,
          amount_cents: reversed.cents, status: 'restoration_required',
          updated_at: new Date().toISOString(),
          last_error: 'refund_failed_restoration_required: refund failed/canceled after tutor reversal; review and restore tutor funds',
        }, { onConflict: 'stripe_refund_id,stripe_transfer_id' });
        if (error) throw new Error('refund restoration follow-up write failed');
      }
    }
  }
  return { bookingId: row.id as string, percent, full: cents >= charge.amount };
}
