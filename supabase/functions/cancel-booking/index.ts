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
      .select('id, student_id, tutor_id, scheduled_at, status, price, credit_applied, stripe_payment_intent_id')
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

    // Real money movement on the held (manual-capture) PaymentIntent:
    //   100% refund → cancel the authorization (nothing captured);
    //   partial     → capture only the non-refunded portion (the rest auto-releases);
    //   0% refund   → capture the full amount (late-cancel fee).
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    const pi = booking.stripe_payment_intent_id as string | null;
    if (stripeKey && pi && pi.startsWith('pi_')) {
      const { default: Stripe } = await import('https://esm.sh/stripe@16?target=deno');
      const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
      try {
        if (refundPercent === 100) {
          await stripe.paymentIntents.cancel(pi, {}, { idempotencyKey: `cancel_${bookingId}` });
        } else {
          // The card was held for the price minus any Noot credit (0040), so the late-cancel
          // share comes out of that, not the full price.
          // Whole cents, so e.g. $17.33 − $5 can't round a cent away.
          const chargedCents = Math.round(Number(booking.price) * 100) - Math.round(Number(booking.credit_applied ?? 0) * 100);
          const captureCents = Math.round((chargedCents * (100 - refundPercent)) / 100);
          await stripe.paymentIntents.capture(pi, { amount_to_capture: captureCents }, { idempotencyKey: `cancelcap_${bookingId}` });
        }
      } catch (stripeErr) {
        return Response.json({ error: 'Stripe: ' + String(stripeErr) }, { status: 400, headers: cors });
      }
    }

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

    // Noot credit comes back in the same proportion as the cash refund (cumulative, so a
    // later full refund in Stripe tops it up; repeating changes nothing).
    if (Number(booking.credit_applied ?? 0) > 0) {
      const { error: creditErr } = await db.rpc('return_booking_credit', { p_booking: bookingId, p_percent: refundPercent });
      if (creditErr) console.error('cancel-booking: credit return failed', bookingId, creditErr.message);
    }

    return Response.json(
      { status: 'cancelled', refundPercent, refundStatus },
      { headers: cors },
    );
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 400, headers: cors });
  }
});
