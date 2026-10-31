// Tutor payouts are funded from the booking's own charge (ISSUES_2026-10-03.md §3.2).
//
// A Stripe transfer created with `source_transaction` is paid from that charge the moment
// it settles, so it never fails because Noot's platform balance is short (a fresh charge
// is not spendable for ~2 days). Stripe refuses a source-linked transfer larger than the
// charge, and a Noot-credit booking's payout can be larger than what the card paid (the
// card is charged at least $1, the rest is Noot's own credit). That credit-funded
// remainder is the part Noot owes from its own money anyway, so it is a second, plain
// transfer from the platform balance. Each half keeps a stable idempotency key so a
// retry resumes rather than paying twice.
import type Stripe from 'https://esm.sh/stripe@16?target=deno';
import { capturedRefundCents } from './refunds.ts';

export type ChargeFunds = Pick<Stripe.Charge, 'amount' | 'amount_captured' | 'amount_refunded'>;

/** Cents of a captured charge still available to back a source_transaction transfer. */
export function chargeAvailableCents(charge: ChargeFunds | null, capturedRefundedCents: number): number {
  if (!charge) return 0;
  return Math.max(0, Number(charge.amount_captured ?? 0) - Math.max(0, capturedRefundedCents));
}

export type PayoutSplit = { fromCharge: number; fromBalance: number };

/** Split a payout into the part the charge can fund and the part the balance must. */
export function splitPayoutFunding(payoutCents: number, availableCents: number): PayoutSplit {
  const payout = Math.max(0, Math.round(payoutCents));
  const fromCharge = Math.min(payout, Math.max(0, Math.round(availableCents)));
  return { fromCharge, fromBalance: payout - fromCharge };
}

export type PayoutResult = {
  /** Id of the first transfer created (the charge-funded one when there is one). */
  transferId: string | null;
  /** Both halves sent, or nothing was owed. */
  complete: boolean;
  /** Cents still owed to the tutor when `complete` is false. */
  shortfallCents: number;
  /** The error that stopped the payout, for logging. */
  error: unknown;
};

export type PayoutArgs = {
  stripe: Stripe;
  bookingId: string;
  destination: string;
  payoutCents: number;
  /** The captured charge, expanded from the PaymentIntent's `latest_charge`. */
  charge: (ChargeFunds & Pick<Stripe.Charge, 'id'>) | null;
  /** Idempotency key for the main transfer; the balance remainder appends `_balance`. */
  idempotencyKey: string;
  metadata: Record<string, string>;
};

/**
 * Pay the tutor: first from the charge (source_transaction), then any remainder from the
 * platform balance. Never throws — the caller already captured the money and must record
 * the outcome either way.
 */
export async function payTutor(args: PayoutArgs): Promise<PayoutResult> {
  const { stripe, bookingId, destination, payoutCents, charge, idempotencyKey, metadata } = args;
  const base = { currency: 'usd', destination, transfer_group: bookingId } as const;
  let transferId: string | null = null;
  let owed = Math.max(0, Math.round(payoutCents));
  try {
    const refunded = charge ? await capturedRefundCents(stripe, charge) : 0;
    const { fromCharge, fromBalance } = splitPayoutFunding(payoutCents, chargeAvailableCents(charge, refunded));
    if (fromCharge > 0) {
      const t = await stripe.transfers.create(
        {
          ...base,
          amount: fromCharge,
          source_transaction: charge!.id,
          metadata: { ...metadata, funding: 'session_charge', charge_id: charge!.id },
        },
        { idempotencyKey },
      );
      transferId = t.id;
      owed -= fromCharge;
    }
    if (fromBalance > 0) {
      const t = await stripe.transfers.create(
        {
          ...base,
          amount: fromBalance,
          metadata: { ...metadata, funding: 'platform_balance', credit_funded_cents: String(fromBalance) },
        },
        { idempotencyKey: `${idempotencyKey}_balance` },
      );
      transferId ??= t.id;
      owed -= fromBalance;
    }
    return { transferId, complete: true, shortfallCents: 0, error: null };
  } catch (error) {
    return { transferId, complete: false, shortfallCents: owed, error };
  }
}
