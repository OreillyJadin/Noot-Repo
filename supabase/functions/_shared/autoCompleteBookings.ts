import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { completeBooking, type CompleteResult } from './completeBooking.ts';

export async function autoCompleteBookings(
  db: SupabaseClient,
  url: string,
  complete: typeof completeBooking = completeBooking,
  clock = new Date(),
): Promise<CompleteResult> {
  const now = clock.toISOString();
  const ended48HoursAgo = new Date(clock.getTime() - 48 * 60 * 60 * 1000).toISOString();
  const created6DaysAgo = new Date(clock.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString();
  const held4DaysAgo = new Date(clock.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString();
  const retryBefore = new Date(clock.getTime() - 60 * 60 * 1000).toISOString();
  // Completion updates updated_at; later edits can conservatively delay a missing payout.
  const retryDue = `payout_failed_at.lt.${retryBefore},and(payout_failed_at.is.null,stripe_transfer_id.is.null,updated_at.lt.${retryBefore})`;
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
    .or(retryDue)
    .order('payout_failed_at', { ascending: true, nullsFirst: true })
    .order('updated_at', { ascending: true })
    .limit(25);
  if (retryError) {
    console.error('auto-complete-sessions: payout retry lookup failed');
    return { status: 500, body: { error: 'Could not load payout retries' } };
  }

  const candidates = [...(bookings ?? []), ...(retries ?? [])];
  const tutorIds: string[] = [...new Set(
    candidates.map((booking) => booking.tutor_id).filter((id): id is string => typeof id === 'string' && id.length > 0),
  )];
  const tutorById = new Map<string, { status: string; deleted_at: string | null }>();
  if (tutorIds.length) {
    const { data: tutors, error: tutorError } = await db
      .from('users')
      .select('id, status, deleted_at')
      .in('id', tutorIds);
    if (tutorError) {
      console.error('auto-complete-sessions: tutor lookup failed');
      return { status: 500, body: { error: 'Could not check tutor availability' } };
    }
    for (const tutor of tutors ?? []) tutorById.set(tutor.id, tutor);
  }

  let completed = 0;
  let holdExpired = 0;
  let failed = 0;
  for (const booking of candidates) {
    const tutor = tutorById.get(booking.tutor_id);
    if (!tutor || tutor.status !== 'active' || tutor.deleted_at !== null) {
      console.error('auto-complete-sessions: skipped booking for inactive tutor', booking.id);
      continue;
    }
    try {
      if (booking.status === 'completed') {
        // Claim before checking Connect/Stripe, so even early failures back off and rotate.
        const { data: claimed, error: claimError } = await db.from('bookings')
          .update({ payout_failed_at: now }).eq('id', booking.id).eq('status', 'completed')
          .or(retryDue).select('id');
        if (claimError) throw claimError;
        if (!claimed?.length) continue;
      }
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
