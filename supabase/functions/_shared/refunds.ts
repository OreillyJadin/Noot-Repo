/** Stripe charge totals, in cents. amount_refunded can include a released authorization. */
export interface ChargeTotals {
  amount?: number | null;
  amount_captured?: number | null;
  amount_refunded?: number | null;
}

interface RefundRecord {
  amount: number;
  status?: string | null;
  balance_transaction?: string | { reporting_category: string } | null;
}

export interface RefundReader {
  refunds: {
    list(params: { charge: string; limit: number; expand: string[] }): AsyncIterable<RefundRecord>;
  };
}

/** Read all actual refunds; Stripe may also list the uncaptured hold as a refund. */
export async function capturedRefundCents(
  stripe: RefundReader,
  charge: ChargeTotals & { id: string },
): Promise<number> {
  const captured = Math.max(0, charge.amount_captured ?? 0);
  if (captured === 0) return 0;
  if (captured >= (charge.amount ?? captured)) {
    return Math.min(captured, Math.max(0, charge.amount_refunded ?? 0));
  }
  let refunded = 0;
  for await (const refund of stripe.refunds.list({
    charge: charge.id, limit: 100, expand: ['data.balance_transaction'],
  })) {
    if (refund.status !== 'succeeded' && refund.status !== 'pending') continue;
    const category = typeof refund.balance_transaction === 'object'
      ? refund.balance_transaction?.reporting_category : undefined;
    if (refund.status === 'succeeded' && !category) throw new Error('Refund balance transaction missing');
    if (category !== 'partial_capture_reversal') refunded += Math.max(0, refund.amount);
  }
  return Math.min(captured, refunded);
}

/**
 * Share (0–100) of the booking's card charge that went back to the student: the uncaptured part of a
 * partial capture (cancel-booking's late cancel) plus everything refunded. A hold released without
 * capture counts as 100. Never reports 100 unless the whole charge is back.
 */
export function chargeRefundPercent(charge: ChargeTotals, capturedRefundedCents: number): number {
  const captured = Math.max(0, charge.amount_captured ?? 0);
  const total = (charge.amount ?? 0) > 0 ? (charge.amount as number) : captured;
  if (total <= 0) return 100;
  const refunded = Math.max(0, capturedRefundedCents);
  const back = Math.min(total, total - Math.min(captured, total) + refunded);
  const pct = Math.min(100, Math.max(0, Math.round((back * 100) / total)));
  return back < total ? Math.min(pct, 99) : pct;
}
