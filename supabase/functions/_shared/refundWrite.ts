import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

type RefundWriteRow = { id: string; refund_percent: number; refund_status: string };

export async function updateConfirmedBookingRaiseOnly(
  db: SupabaseClient,
  bookingId: string,
  base: Record<string, unknown>,
  refundPercent: number,
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
  if (first.data) return { data: first.data, error: null };

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

  return { data: fallback.data, error: fallback.error };
}
