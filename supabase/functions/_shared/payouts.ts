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
import { disputeHoldsPayout } from './disputes.ts';

interface TransferRecord {
  metadata?: Record<string, string> | null;
}

export interface TransferReader {
  transfers: {
    list(params: { transfer_group: string; limit: number }): AsyncIterable<TransferRecord>;
  };
}

export type ChargeFunds = Pick<Stripe.Charge, 'amount' | 'amount_captured' | 'amount_refunded'>;

/** Whether a different outcome has already paid the tutor for this booking. */
export async function otherOutcomeTransferExists(
  stripe: TransferReader,
  bookingId: string,
  ownReason: string | null,
): Promise<boolean> {
  for await (const transfer of stripe.transfers.list({ transfer_group: bookingId, limit: 100 })) {
    if (ownReason === null || transfer.metadata?.reason !== ownReason) return true;
  }
  return false;
}

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
  originalPayoutCents: number;
  /** The captured charge, expanded from the PaymentIntent's `latest_charge`. */
  charge: (ChargeFunds & Pick<Stripe.Charge, 'id'>) | null;
  /** Idempotency key for the main transfer; the balance remainder appends `_balance`. */
  idempotencyKey: string;
  metadata: Record<string, string>;
};

export function refundAdjustedPayout(requested: number, original: number, charge: ChargeFunds | null, refunded: number): number {
  if (!charge) return Math.max(0, Math.round(requested));
  const total = charge.amount ?? charge.amount_captured ?? 0;
  const remaining = chargeAvailableCents(charge, refunded);
  return Math.max(0, Math.min(Math.round(requested), total > 0 ? Math.round(original * remaining / total) : 0));
}

/**
 * Pay the tutor: first from the charge (source_transaction), then any remainder from the
 * platform balance. Never throws — the caller already captured the money and must record
 * the outcome either way.
 */
export async function payTutor(args: PayoutArgs): Promise<PayoutResult> {
  const { stripe, bookingId, destination, payoutCents, idempotencyKey } = args;
  let { charge, metadata } = args;
  const base = { currency: 'usd', destination, transfer_group: bookingId } as const;
  let transferId: string | null = null;
  let owed = Math.max(0, Math.round(payoutCents));
  try {
    if (charge) charge = await stripe.charges.retrieve(charge.id);
    if (charge) {
      for await (const dispute of stripe.disputes.list({ charge: charge.id, limit: 100 })) {
        if (disputeHoldsPayout(dispute.status)) throw new Error(`Tutor payout held for dispute ${dispute.id}`);
      }
    }
    const refunded = charge ? await capturedRefundCents(stripe, charge) : 0;
    let target = refundAdjustedPayout(payoutCents, args.originalPayoutCents, charge, refunded);
    let baseline = refunded;
    for await (const transfer of stripe.transfers.list({ transfer_group: bookingId, limit: 100 })) {
      if ((transfer.metadata?.reason ?? '') !== (metadata.reason ?? '')) continue;
      if (transfer.metadata?.payout_target_cents !== undefined) {
        target = Number(transfer.metadata.payout_target_cents);
        baseline = Number(transfer.metadata.refund_baseline_cents ?? 0);
        break;
      }
    }
    metadata = { ...metadata, payout_target_cents: String(target), refund_baseline_cents: String(baseline) };
    owed = target;
    const { fromCharge, fromBalance } = splitPayoutFunding(target, chargeAvailableCents(charge, baseline));
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
