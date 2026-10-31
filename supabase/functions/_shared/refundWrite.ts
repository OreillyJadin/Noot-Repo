import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

type RefundWriteRow = { id: string; refund_percent: number; refund_status: string };

export async function updateConfirmedBookingRaiseOnly(
  db: SupabaseClient,
  bookingId: string,
  base: Record<string, unknown>,
  refundPercent: number,
  refundedCents: number | null = null,
): Promise<{ data: RefundWriteRow | null; error: { message: string } | null }> {
  const refundStatus = refundPercent > 0 ? 'refunded' : 'not_refunded';
  const first = refundPercent > 0
    ? await db.from('bookings')
      .update({ ...base, refund_percent: refundPercent, refund_status: refundStatus })
      .eq('id', bookingId)
      .eq('status', 'confirmed')
      .lt('refund_percent', refundPercent)
      .select('id, refund_percent, refund_status')
      .maybeSingle()
    : await db.from('bookings')
      .update({ ...base, refund_status: refundStatus })
      .eq('id', bookingId)
      .eq('status', 'confirmed')
      .neq('refund_status', 'refunded')
      .select('id, refund_percent, refund_status')
      .maybeSingle();

  if (first.error) return { data: null, error: first.error };
  if (first.data) {
    if (refundedCents !== null) await raiseRefundedCents(db, bookingId, refundedCents);
    return { data: first.data, error: null };
  }

  const fallback = refundPercent > 0
    ? await db.from('bookings')
      .update({ ...base, refund_status: refundStatus })
      .eq('id', bookingId)
      .eq('status', 'confirmed')
      .select('id, refund_percent, refund_status')
      .maybeSingle()
    : await db.from('bookings')
      .update(base)
      .eq('id', bookingId)
      .eq('status', 'confirmed')
      .select('id, refund_percent, refund_status')
      .maybeSingle();

  if (fallback.data && refundedCents !== null) await raiseRefundedCents(db, bookingId, refundedCents);
  return { data: fallback.data, error: fallback.error };
}

/** Raise-only: never lowers a larger refunded_cents (e.g. one a refund webhook already wrote). */
export async function raiseRefundedCents(db: SupabaseClient, bookingId: string, cents: number): Promise<void> {
  const value = Math.max(0, Math.round(cents));
  const { error } = await db.from('bookings')
    .update({ refunded_cents: value })
    .eq('id', bookingId)
    .or(`refunded_cents.is.null,refunded_cents.lt.${value}`);
  if (error) console.error('refunded_cents update failed', bookingId, error.message);
}
