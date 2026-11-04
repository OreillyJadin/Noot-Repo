import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { completeBooking, type CompleteResult } from './completeBooking.ts';

export async function autoCompleteBookings(
  db: SupabaseClient,
  url: string,
  complete: typeof completeBooking = completeBooking,
): Promise<CompleteResult> {
  const now = new Date().toISOString();
  const ended48HoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const created6DaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();
  const held4DaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
  const { data: bookings, error: loadError } = await db
    .from('bookings')
    .select('id, tutor_id, status, scheduled_at, scheduled_end, duration_minutes, stripe_payment_intent_id, tutor_payout_amount, price, created_at, hold_placed_at')
    .eq('status', 'confirmed')
    .eq('dispute_status', 'none')
    .is('no_show_party', null)
    .lte('scheduled_end', now)
    .or(`scheduled_end.lte.${ended48HoursAgo},hold_placed_at.lte.${held4DaysAgo},and(hold_placed_at.is.null,created_at.lte.${created6DaysAgo})`)
    .order('scheduled_end', { ascending: true })
    .limit(25);
  if (loadError) {
    console.error('auto-complete-sessions: booking lookup failed');
    return { status: 500, body: { error: 'Could not load sessions' } };
  }

  const { data: retries, error: retryError } = await db
    .from('bookings')
    .select('id, tutor_id, status, scheduled_at, duration_minutes, stripe_payment_intent_id, stripe_transfer_id, payout_failed_at, tutor_payout_amount, price')
    .eq('status', 'completed')
    .eq('dispute_status', 'none')
    .is('no_show_party', null)
    .gt('price', 0)
    .gt('tutor_payout_amount', 0)
    .like('stripe_payment_intent_id', 'pi_%')
    .or('payout_failed_at.not.is.null,stripe_transfer_id.is.null')
    .order('payout_failed_at', { ascending: true, nullsFirst: true })
    .limit(25);
  if (retryError) {
    console.error('auto-complete-sessions: payout retry lookup failed');
    return { status: 500, body: { error: 'Could not load payout retries' } };
  }

  let completed = 0;
  let holdExpired = 0;
  let failed = 0;
  for (const booking of [...(bookings ?? []), ...(retries ?? [])]) {
    try {
      const result = await complete(db, url, booking);
      if (result.body.holdExpired === true) {
        holdExpired += 1;
      } else if (result.status === 200 && result.body.status === 'completed') {
        completed += 1;
      } else {
        failed += 1;
        console.error('auto-complete-sessions: booking was not completed', booking.id);
      }
    } catch {
      failed += 1;
      console.error('auto-complete-sessions: booking failed', booking.id);
    }
  }

  return { status: 200, body: { completed, holdExpired, failed } };
}
