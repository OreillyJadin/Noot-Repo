// Edge Function: cancel-booking.
// Cancels a booking and records the intended refund state per the cancellation
// policy. Either party to the booking may cancel:
//   - Student cancels: refund tiered by lead time (>24h → 100%, >=2h → 50%, else 0%).
//   - Tutor cancels: student is always refunded 100%.
// Real money movement (Stripe refund / releasing held funds) is out of scope here —
// we only persist the intended state in the DB columns.
//
// Deno runtime. Self-contained (no _shared import).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });

    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401, headers: cors });

    // service role: bypasses RLS
    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const body = (await req.json().catch(() => ({}))) as { bookingId?: string };
    const bookingId = body.bookingId;
    if (!bookingId) {
      return Response.json({ error: 'bookingId is required' }, { status: 400, headers: cors });
    }

    // Load booking.
    const { data: booking, error: loadError } = await db
      .from('bookings')
      .select('id, student_id, tutor_id, scheduled_at, status')
      .eq('id', bookingId)
      .single();

    if (loadError || !booking) {
      return Response.json({ error: 'Booking not found' }, { status: 404, headers: cors });
    }

    // Verify the caller is a party to the booking.
    const isStudent = booking.student_id === user.id;
    const isTutor = booking.tutor_id === user.id;
    if (!isStudent && !isTutor) {
      return Response.json(
        { error: 'Not authorized to cancel this booking' },
        { status: 403, headers: cors },
      );
    }

    if (booking.status === 'cancelled') {
      return Response.json(
        { error: 'Booking is already cancelled' },
        { status: 400, headers: cors },
      );
    }

    // Compute refund percent per the cancellation policy.
    const now = new Date();
    let refundPercent: number;
    if (isStudent) {
      const hours = (new Date(booking.scheduled_at).getTime() - now.getTime()) / 3.6e6;
      refundPercent = hours > 24 ? 100 : hours >= 2 ? 50 : 0;
    } else {
      // Tutor cancelled → student always fully refunded.
      refundPercent = 100;
      // TODO: increment tutor cancellation-rate tracking when tutor cancels.
    }

    const refundStatus = refundPercent > 0 ? 'refunded' : 'not_refunded';

    // TODO(stripe): issue the actual refund / release held funds per tier.

    const { error: updateError } = await db
      .from('bookings')
      .update({
        status: 'cancelled',
        cancelled_at: now.toISOString(),
        refund_percent: refundPercent,
        refund_status: refundStatus,
      })
      .eq('id', bookingId);

    if (updateError) {
      return Response.json({ error: updateError.message }, { status: 400, headers: cors });
    }

    return Response.json(
      { status: 'cancelled', refundPercent, refundStatus },
      { headers: cors },
    );
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 400, headers: cors });
  }
});
