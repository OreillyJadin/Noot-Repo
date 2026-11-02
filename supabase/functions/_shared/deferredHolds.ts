import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type DeferredBooking = {
  id: string;
  student_id: string;
  scheduled_at: string;
  price: number;
  student_fee: number;
  credit_applied: number;
};

export function bookingChargeCents(booking: DeferredBooking): number {
  return Math.round((Number(booking.price) + Number(booking.student_fee) - Number(booking.credit_applied)) * 100);
}

export async function attachBookingHold(db: SupabaseClient, booking: DeferredBooking, id: string, created: number): Promise<boolean> {
  const { data, error } = await db.from('bookings').update({
    stripe_payment_intent_id: id,
    hold_placed_at: new Date(created * 1000).toISOString(),
    hold_failed_at: null,
    hold_failure_code: null,
  }).eq('id', booking.id).eq('scheduled_at', booking.scheduled_at)
    .in('status', ['pending', 'confirmed']).is('stripe_payment_intent_id', null).select('id');
  if (error) throw error;
  if (data?.length) return true;
  const { data: current, error: readError } = await db.from('bookings').select('stripe_payment_intent_id').eq('id', booking.id).single();
  if (readError) throw readError;
  return current.stripe_payment_intent_id === id;
}
