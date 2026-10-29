// Edge Function: complete-session.
// The caller must be the booking's TUTOR. Marks a confirmed session complete: captures the
// held PaymentIntent, transfers the tutor's payout to their Connect account funded from
// that charge (see _shared/payouts.ts), sets status='completed', then fires
// award-referral-bonus (non-fatal). Idempotent: a booking
// already 'completed' is a no-op apart from re-firing the award. Simulated bookings
// (sim_pi_…) just flip to completed.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireActiveUser } from '../_shared/auth.ts';
import { BookingError } from '../_shared/booking.ts';
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
      .select('id, tutor_id, status, scheduled_at, duration_minutes, stripe_payment_intent_id, tutor_payout_amount, price, created_at')
      .eq('id', bookingId)
      .maybeSingle();
    if (!booking) return Response.json({ error: 'booking not found' }, { status: 404, headers: cors });
    if (booking.tutor_id !== user.id) return Response.json({ error: 'forbidden' }, { status: 403, headers: cors });
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
