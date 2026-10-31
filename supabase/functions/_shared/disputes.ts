import type Stripe from 'https://esm.sh/stripe@16?target=deno';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { settleTutorReversals } from './reversals.ts';

export function disputeHoldsPayout(status: string): boolean {
  return status !== 'won' && status !== 'warning_closed';
}

export async function reconcileDispute(db: SupabaseClient, stripe: Stripe, disputeId: string) {
  const dispute = await stripe.disputes.retrieve(disputeId);
  const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge.id;
  const charge = await stripe.charges.retrieve(chargeId);
  const pi = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
  if (!pi) return null;
  const { data: booking, error: lookupError } = await db.from('bookings').select('id')
    .eq('stripe_payment_intent_id', pi).maybeSingle();
  if (lookupError) throw new Error('dispute booking lookup failed');
  if (!booking) return null;
  const row = {
    stripe_dispute_id: dispute.id, booking_id: booking.id, stripe_charge_id: chargeId,
    status: dispute.status, amount_cents: dispute.amount,
    payout_hold: disputeHoldsPayout(dispute.status),
    admin_followup: dispute.status === 'lost'
      ? 'Lost: tutor share clawback attempted; review tutor_transfer_reversals for failed attempts. Unpaid tutor funds remain held.'
      : disputeHoldsPayout(dispute.status)
        ? 'Disputed: unpaid tutor payout held; review evidence and respond in Stripe.'
        : 'Hold released: review/retry any payout previously flagged failed; no automatic repayment.',
    updated_at: new Date().toISOString(),
  };
  const { error: insertError } = await db.from('booking_payment_disputes')
    .upsert(row, { onConflict: 'stripe_dispute_id', ignoreDuplicates: true });
  if (insertError) throw new Error('dispute insert failed');
  // Closed disputes cannot return to an open state when an older event races with close.
  const { error: updateError } = await db.from('booking_payment_disputes').update(row)
    .eq('stripe_dispute_id', dispute.id).not('status', 'in', '(won,lost,warning_closed)');
  if (updateError) throw new Error('dispute update failed');
  const { data: stored, error: stateError } = await db.from('booking_payment_disputes')
    .select('status').eq('stripe_dispute_id', dispute.id).single();
  if (stateError) throw new Error('dispute state lookup failed');
  if (stored.status === 'lost') await settleTutorReversals(db, stripe, booking.id, chargeId, {
    id: dispute.id, amount: dispute.amount,
  });
  return { bookingId: booking.id as string, status: stored.status as string };
}
