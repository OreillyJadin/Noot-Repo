/** Stripe charge totals, in cents. amount_refunded is cumulative across every refund on the charge. */
export interface ChargeTotals {
  amount?: number | null;
  amount_captured?: number | null;
  amount_refunded?: number | null;
}

/**
 * Share (0–100) of the booking's card charge that went back to the student: the uncaptured part of a
 * partial capture (cancel-booking's late cancel) plus everything refunded. A hold released without
 * capture counts as 100. Never reports 100 unless the whole charge is back.
 */
export function chargeRefundPercent(charge: ChargeTotals): number {
  const captured = Math.max(0, charge.amount_captured ?? 0);
  const total = (charge.amount ?? 0) > 0 ? (charge.amount as number) : captured;
  if (total <= 0) return 100;
  const refunded = Math.max(0, charge.amount_refunded ?? 0);
  const back = Math.min(total, total - Math.min(captured, total) + refunded);
  const pct = Math.min(100, Math.max(0, Math.round((back * 100) / total)));
  return back < total ? Math.min(pct, 99) : pct;
}
