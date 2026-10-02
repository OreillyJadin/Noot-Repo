// Noot credits at checkout (0040). Pure (no imports) so it runs in Deno and the node tests.
//
// Credit comes off the price the student is charged; the tutor's payout and noot's fee are
// still computed from the full price (fees.ts), so noot absorbs the credit.

/**
 * The card is always charged at least this much. Stripe won't capture under $0.50, and a
 * 50% late-cancel on $1.00 captures exactly $0.50 — so every cancellation tier still works.
 */
export const MIN_CHARGE_CENTS = 100;

/** How much of a balance applies to a session priced `amountCents`. Never negative. */
export function creditToApply(balanceCents: number, amountCents: number): number {
  const room = Math.max(0, Math.floor(amountCents) - MIN_CHARGE_CENTS);
  return Math.max(0, Math.min(Math.floor(balanceCents), room));
}

/**
 * The credit a PaymentIntent claims (metadata.credit_cents), or null if the value isn't one
 * this booking could legitimately have — confirm-booking rejects the payment then.
 */
export function parseCreditCents(raw: unknown, amountCents: number): number | null {
  const s = raw == null || raw === '' ? '0' : String(raw);
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n <= creditToApply(n, amountCents) ? n : null;
}
