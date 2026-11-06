// Edge Function: complete-session.
// The caller must be the booking's TUTOR. Marks a confirmed session complete: captures the
// held PaymentIntent, transfers the tutor's payout to their Connect account funded from
// that charge (see _shared/payouts.ts), sets status='completed', then fires
// award-referral-bonus (non-fatal). Idempotent: a booking
// already 'completed' retries an unpaid/failed payout before re-firing the award. Simulated bookings
// (sim_pi_…) just flip to completed.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireActiveUser } from '../_shared/auth.ts';
import { BookingError, assertSessionElapsed } from '../_shared/booking.ts';
import { completeBooking } from '../_shared/completeBooking.ts';
import { serveWithErrorReporting } from '../_shared/observability.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serveWithErrorReporting('complete-session', async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401, headers: cors });

    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const inactiveResponse = await requireActiveUser(db, user.id, cors);
    if (inactiveResponse) return inactiveResponse;

    const { bookingId } = await req.json().catch(() => ({}));
    if (!bookingId) return Response.json({ error: 'bookingId required' }, { status: 400, headers: cors });

    const { data: booking } = await db
      .from('bookings')
      .select('id, student_id, tutor_id, subject, status, scheduled_at, duration_minutes, stripe_payment_intent_id, stripe_transfer_id, payout_failed_at, tutor_payout_amount, price, created_at, dispute_status, completion_claimed_at')
      .eq('id', bookingId)
      .maybeSingle();
    if (!booking) return Response.json({ error: 'booking not found' }, { status: 404, headers: cors });
    if (booking.tutor_id !== user.id) return Response.json({ error: 'forbidden' }, { status: 403, headers: cors });
    if (booking.dispute_status === 'flagged') {
      return Response.json({ error: 'This session is under review by the noot team.' }, { status: 409, headers: cors });
    }
    if (booking.status === 'confirmed') {
      assertSessionElapsed(booking.scheduled_at, Number(booking.duration_minutes));
      if (booking.completion_claimed_at) {
        return Response.json({
          status: 'completion_pending',
          objectBy: new Date(Date.parse(booking.completion_claimed_at) + 24 * 60 * 60 * 1000).toISOString(),
        }, { headers: cors });
      }
      const claimedAt = new Date().toISOString();
      const { data: claimed, error } = await db.from('bookings').update({ completion_claimed_at: claimedAt })
        .eq('id', bookingId).eq('status', 'confirmed').eq('dispute_status', 'none')
        .is('completion_claimed_at', null).select('id').maybeSingle();
      if (error) throw error;
      if (!claimed) return Response.json({ error: 'This session changed. Refresh and try again.' }, { status: 409, headers: cors });
      const { data: tutor } = await db.from('users').select('first_name').eq('id', user.id).maybeSingle();
      const tutorName = tutor?.first_name?.trim() || 'Your tutor';
      const { error: notificationError } = await db.rpc('create_notification', {
        p_user: booking.student_id,
        p_type: 'booking',
        p_title: 'Session marked complete',
        p_body: `${tutorName} marked ${booking.subject} complete. If the session didn't happen, tell us within 24 hours.`,
        p_data: { bookingId },
      });
      if (notificationError) console.error('complete-session: completion notification failed', bookingId);
      return Response.json({
        status: 'completion_pending',
        objectBy: new Date(Date.parse(claimedAt) + 24 * 60 * 60 * 1000).toISOString(),
      }, { headers: cors });
    }
    const result = await completeBooking(db, url, booking);
    return Response.json(result.body, { status: result.status, headers: cors });
  } catch (err) {
    if (err instanceof BookingError) {
      return Response.json({ error: err.message }, { status: err.status, headers: cors });
    }
    // Generic on purpose: Stripe error strings can embed a partially-redacted API key.
    console.error('complete-session failed', JSON.stringify(err), err);
    return Response.json(
      { error: 'Something went wrong completing that session. Please try again.' },
      { status: 400, headers: cors },
    );
  }
});
