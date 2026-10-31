// Tutor payouts may have charge-funded and platform-balance transfers, so refunds are allocated
// proportionally across both from the captured charge; released authorizations are excluded.
// Reversal metadata makes retries idempotent beyond Stripe's 24-hour idempotency-key window.
import type Stripe from 'https://esm.sh/stripe@16?target=deno';
import type { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type Db = ReturnType<typeof createClient>;

export type RefundLike = {
  id: string;
  amount: number;
  created: number;
  status: string | null;
  balance_transaction?: string | { reporting_category: string } | null;
};

export type ReversalLike = { amount: number; metadata?: Record<string, string> | null };

export type TransferLike = {
  id: string;
  amount: number;
  amount_reversed: number;
  created: number;
  reversals: ReversalLike[];
  refundBaselineCents?: number;
};

export type RefundShare = { refundId: string; cents: number };
export type PlannedReversal = { refundId: string; transferId: string; cents: number };
export type ReversalAttempt = PlannedReversal & { reversalId: string | null; error: string | null };

/** Real Stripe-side refunds in creation order; succeeded refunds need expanded balance data. */
export function stripeSideRefunds(refunds: RefundLike[]): RefundLike[] {
  return refunds
    .filter((refund) => {
      if (refund.status !== 'succeeded' && refund.status !== 'pending') return false;
      const category = typeof refund.balance_transaction === 'object' && refund.balance_transaction !== null
        ? refund.balance_transaction.reporting_category
        : undefined;
      if (refund.status === 'succeeded' && !category) {
        throw new Error('Refund balance transaction missing');
      }
      return category !== 'partial_capture_reversal';
    })
    .sort((a, b) => a.created - b.created || a.id.localeCompare(b.id));
}

/** Allocate each refund's cumulative share of the tutor's total transferred payout. */
export function reversalShares(
  refunds: RefundLike[],
  capturedCents: number,
  transferredCents: number,
  baselineCents = 0,
): RefundShare[] {
  if (capturedCents <= 0 || transferredCents <= 0) return [];

  const ordered = [...refunds].sort((a, b) => a.created - b.created || a.id.localeCompare(b.id));
  const shares: RefundShare[] = [];
  let refundedCents = 0;
  let previousTarget = 0;
  for (const refund of ordered) {
    refundedCents = Math.min(capturedCents, refundedCents + Math.max(0, refund.amount));
    const basis = capturedCents - baselineCents;
    const target = basis > 0 ? Math.round(transferredCents * Math.max(0, refundedCents - baselineCents) / basis) : 0;
    const cents = target - previousTarget;
    if (cents > 0) shares.push({ refundId: refund.id, cents });
    previousTarget = target;
  }
  return shares;
}

/** Spread only the still-needed refund share over transfer funds that remain reversible. */
export function planReversals(shares: RefundShare[], transfers: TransferLike[]): PlannedReversal[] {
  const ordered = [...transfers].sort((a, b) => a.created - b.created || a.id.localeCompare(b.id));
  const remaining = new Map(ordered.map((transfer) => [
    transfer.id,
    Math.max(0, transfer.amount - transfer.amount_reversed),
  ]));
  const planned: PlannedReversal[] = [];

  for (const share of shares) {
    const done = ordered.reduce((sum, transfer) => sum + transfer.reversals.reduce(
      (reversalSum, reversal) => reversalSum + (
        reversal.metadata?.refund_id === share.refundId ? Math.max(0, reversal.amount) : 0
      ),
      0,
    ), 0);
    let need = Math.max(0, share.cents - done);
    for (const transfer of ordered) {
      if (need <= 0) break;
      const cents = Math.min(need, remaining.get(transfer.id) ?? 0);
      if (cents <= 0) continue;
      planned.push({ refundId: share.refundId, transferId: transfer.id, cents });
      remaining.set(transfer.id, (remaining.get(transfer.id) ?? 0) - cents);
      need -= cents;
    }
  }

  return planned;
}

/** Read current Stripe state, plan proportional reversals, and retain failed creates for retry. */
export async function reverseTutorTransfers(args: {
  stripe: Stripe;
  bookingId: string;
  chargeId: string;
  fallbackTransferId: string | null;
}): Promise<ReversalAttempt[]> {
  const { stripe, bookingId, chargeId, fallbackTransferId } = args;
  const charge = await stripe.charges.retrieve(chargeId);
  const refunds: RefundLike[] = [];
  for await (const refund of stripe.refunds.list({
    charge: chargeId,
    limit: 100,
    expand: ['data.balance_transaction'],
  })) {
    refunds.push(refund as RefundLike);
  }

  const listedTransfers = await stripe.transfers.list({ transfer_group: bookingId, limit: 100 });
  let stripeTransfers = listedTransfers.data;
  if (stripeTransfers.length === 0 && fallbackTransferId) {
    stripeTransfers = [await stripe.transfers.retrieve(fallbackTransferId)];
  }

  const transfers: TransferLike[] = [];
  for (const transfer of stripeTransfers) {
    const reversals = await stripe.transfers.listReversals(transfer.id, { limit: 100 });
    transfers.push({
      id: transfer.id,
      amount: transfer.amount,
      amount_reversed: transfer.amount_reversed,
      created: transfer.created,
      refundBaselineCents: transfer.metadata?.refund_baseline_cents === undefined
        ? undefined : Number(transfer.metadata.refund_baseline_cents),
      reversals: reversals.data.map((reversal) => ({
        amount: reversal.amount,
        metadata: reversal.metadata,
      })),
    });
  }

  const shares = reversalShares(
    stripeSideRefunds(refunds).filter((refund) => refund.status === 'succeeded'),
    charge.amount_captured ?? 0,
    transfers.filter((transfer) => transfer.refundBaselineCents === undefined).reduce((sum, transfer) => sum + transfer.amount, 0),
  );
  const planned = planReversals(shares, transfers.filter((transfer) => transfer.refundBaselineCents === undefined));
  for (const transfer of transfers.filter((item) => item.refundBaselineCents !== undefined)) {
    planned.push(...planReversals(reversalShares(
      stripeSideRefunds(refunds), charge.amount_captured ?? 0, transfer.amount, transfer.refundBaselineCents,
    ), [transfer]));
  }
  const attempts: ReversalAttempt[] = [];

  for (const item of planned) {
    try {
      const reversal = await stripe.transfers.createReversal(
        item.transferId,
        {
          amount: item.cents,
          metadata: {
            booking_id: bookingId,
            refund_id: item.refundId,
            charge_id: chargeId,
            reason: 'stripe_refund',
          },
        },
        { idempotencyKey: `reversal_${item.refundId}_${item.transferId}` },
      );
      attempts.push({ ...item, reversalId: reversal.id, error: null });
    } catch (error) {
      const stripeError = error as { code?: string | null; type?: string | null; message?: string | null };
      const code = stripeError.code ?? stripeError.type ?? 'error';
      const message = stripeError.message ?? String(error);
      attempts.push({
        ...item,
        reversalId: null,
        error: `${code}: ${message}`.slice(0, 500),
      });
    }
  }

  return attempts;
}

export async function settleTutorReversals(
  db: Db,
  stripe: Stripe,
  bookingId: string,
  chargeId: string,
): Promise<void> {
  const { data: booking, error: transferLookupError } = await db
    .from('bookings')
    .select('stripe_transfer_id')
    .eq('id', bookingId)
    .maybeSingle();
  if (transferLookupError) throw new Error('booking transfer lookup failed');

  const fallbackTransferId = (booking?.stripe_transfer_id as string | null | undefined) ?? null;
  if (!fallbackTransferId) return;

  let attempts: ReversalAttempt[];
  try {
    attempts = await reverseTutorTransfers({
      stripe,
      bookingId,
      chargeId,
      fallbackTransferId,
    });
  } catch {
    throw new Error('transfer reversal lookup failed');
  }

  for (const attempt of attempts) {
    const { error: recordError } = await db
      .from('tutor_transfer_reversals')
      .upsert({
        booking_id: bookingId,
        stripe_charge_id: chargeId,
        stripe_refund_id: attempt.refundId,
        stripe_transfer_id: attempt.transferId,
        amount_cents: attempt.cents,
        status: attempt.error ? 'failed' : 'reversed',
        stripe_reversal_id: attempt.reversalId,
        last_error: attempt.error,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'stripe_refund_id,stripe_transfer_id' });
    if (recordError) throw new Error('transfer reversal record failed');
    if (attempt.error) {
      console.error(
        'payments-webhook: transfer reversal failed',
        bookingId,
        attempt.refundId,
        attempt.transferId,
        attempt.error,
      );
    }
  }
}
