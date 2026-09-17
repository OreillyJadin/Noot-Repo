// Edge Function: confirm-booking.
// The caller (user.id) is the STUDENT. Creates a confirmed booking, ensures a
// conversation exists between student and tutor, and optionally posts an opening
// message.
//
// Body: { tutorId, courseCode, scheduledAt, durationMinutes, sessionType, location,
//         meetingLink, message, paymentIntentId }. The price is NOT accepted from the
// client — resolveBooking() re-derives it from tutor_courses.hourly_rate and the held
// PaymentIntent is retrieved and checked against it (T5). Before that check existed, an
// inflated `price` against a small hold became a real transfer in complete-session.
//
// Self-contained: SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
// are auto-injected by the runtime.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { BookingError, resolveBooking } from '../_shared/booking.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401, headers: cors });

    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!); // service role: bypasses RLS
    const body = await req.json().catch(() => ({}));

    const {
      courseCode,
      sessionType,
      location,
      meetingLink,
      message,
      paymentIntentId,
    } = body as {
      courseCode?: string;
      sessionType?: string;
      location?: string;
      meetingLink?: string;
      message?: string;
      paymentIntentId?: string;
    };

    // Only in-person sessions are sold at launch: noot has no video provider, so a video
    // booking would leave the student with no way to attend (T14). Existing 'video' rows
    // still render; we just don't create new ones.
    if (sessionType !== 'in_person') {
      return Response.json(
        { error: "Only in-person sessions can be booked right now (sessionType must be 'in_person')." },
        { status: 400, headers: cors },
      );
    }

    // The caller is the student and must be a party to the booking they create.
    const studentId = user.id;

    // Single source of truth for price, fee, payout and tutor eligibility. This also
    // rejects blocked pairs, which the service-role inserts below would otherwise bypass.
    const resolved = await resolveBooking(db, {
      studentId,
      tutorId: body?.tutorId,
      courseCode,
      durationMinutes: body?.durationMinutes,
      scheduledAt: body?.scheduledAt,
    });

    // Verify the held PaymentIntent really covers this booking. Without this the amount
    // Stripe authorized and the amount we pay the tutor are unrelated numbers.
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    let storedPaymentIntentId: string;
    if (stripeKey) {
      if (!paymentIntentId || !paymentIntentId.startsWith('pi_')) {
        return Response.json({ error: 'A completed payment is required' }, { status: 400, headers: cors });
      }
      const { default: Stripe } = await import('https://esm.sh/stripe@16?target=deno');
      const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId);

      if (pi.metadata?.user_id !== studentId) {
        return Response.json({ error: 'That payment belongs to someone else' }, { status: 403, headers: cors });
      }
      if (pi.metadata?.tutor_id !== resolved.tutorId || pi.metadata?.course_code !== resolved.courseCode) {
        return Response.json({ error: 'That payment was for a different session' }, { status: 400, headers: cors });
      }
      if (pi.amount !== resolved.amountCents) {
        return Response.json({ error: 'The payment amount does not match this session' }, { status: 400, headers: cors });
      }
      // Manual capture: the hold is authorized and waiting to be captured.
      if (pi.status !== 'requires_capture') {
        return Response.json({ error: 'The payment has not been authorized yet' }, { status: 400, headers: cors });
      }
      // One hold, one booking.
      const { data: reused } = await db
        .from('bookings')
        .select('id')
        .eq('stripe_payment_intent_id', paymentIntentId)
        .limit(1);
      if ((reused ?? []).length > 0) {
        return Response.json({ error: 'That payment has already been used' }, { status: 409, headers: cors });
      }
      storedPaymentIntentId = paymentIntentId;
    } else {
      // No Stripe configured (local/dev) — create-payment-intent returned a simulated id.
      storedPaymentIntentId = paymentIntentId ?? 'sim_pi_' + crypto.randomUUID();
    }

    const cancellationDeadline = new Date(
      new Date(resolved.scheduledAt).getTime() - 24 * 60 * 60 * 1000,
    ).toISOString();

    const { data: booking, error: bookingError } = await db
      .from('bookings')
      .insert({
        student_id: studentId,
        tutor_id: resolved.tutorId,
        subject: resolved.courseCode,
        scheduled_at: resolved.scheduledAt,
        duration_minutes: resolved.durationMinutes,
        price: resolved.price,
        platform_fee: resolved.platformFee,
        tutor_payout_amount: resolved.tutorPayout,
        session_type: sessionType,
        meeting_link: meetingLink ?? null,
        location: location ?? null,
        status: 'confirmed',
        cancellation_deadline: cancellationDeadline,
        refund_status: 'not_applicable',
        stripe_payment_intent_id: storedPaymentIntentId,
      })
      .select('id')
      .single();

    if (bookingError) throw bookingError;

    const { data: conversation, error: conversationError } = await db
      .from('conversations')
      .upsert(
        { student_id: studentId, tutor_id: resolved.tutorId },
        { onConflict: 'student_id,tutor_id' },
      )
      .select('id')
      .single();

    if (conversationError) throw conversationError;

    if (message && message.trim().length > 0) {
      const { error: messageError } = await db.from('messages').insert({
        conversation_id: conversation.id,
        sender_id: studentId,
        content: message,
      });
      if (messageError) throw messageError;
    }

    return Response.json(
      { bookingId: booking.id, conversationId: conversation.id, price: resolved.price },
      { headers: cors },
    );
  } catch (e) {
    if (e instanceof BookingError) {
      return Response.json({ error: e.message }, { status: e.status, headers: cors });
    }
    // Deliberately generic — see the note in create-payment-intent.
    console.error('confirm-booking failed', JSON.stringify(e), e);
    return Response.json(
      { error: 'Something went wrong confirming that booking. Please try again.' },
      { status: 400, headers: cors },
    );
  }
});
