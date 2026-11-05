import type { Cashout } from './models';

export function mapCashout(row: Record<string, unknown>): Cashout {
  const transferId = row.stripe_transfer_id;
  return {
    id: row.id as string,
    amountCents: Number(row.amount_cents ?? 0),
    status: row.status as Cashout['status'],
    createdAt: row.created_at as string,
    paidAt: (row.paid_at as string | null) ?? null,
    rejectedAt: (row.rejected_at as string | null) ?? null,
    payingAt: typeof row.paying_at === 'string' ? row.paying_at : null,
    payUnknownAt: typeof row.pay_unknown_at === 'string' ? row.pay_unknown_at : null,
    transferRef: typeof transferId === 'string' ? transferId.slice(-8) : null,
  };
}
