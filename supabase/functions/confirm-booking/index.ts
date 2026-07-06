// Edge Function: confirm-booking.
// The caller (user.id) is the STUDENT. Creates a confirmed booking, ensures a
// conversation exists between student and tutor, and optionally posts an opening
// message. Money movement is out of scope (see TODO(stripe) below).
//
// Self-contained: SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
// are auto-injected by the runtime.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
      tutorId,
      subject,
      scheduledAt,
      durationMinutes,
      sessionType,
      location,
      meetingLink,
      price,
      message,
      paymentIntentId,
    } = body as {
      tutorId?: string;
      subject?: string;
      scheduledAt?: string;
      durationMinutes?: number;
      sessionType?: string;
      location?: string;
      meetingLink?: string;
      price?: number;
      message?: string;
      paymentIntentId?: string;
    };

    if (!tutorId || !subject || !scheduledAt || !durationMinutes || !sessionType || price == null) {
      return Response.json({ error: 'Missing required fields' }, { status: 400, headers: cors });
    }

    // The caller is the student and must be a party to the booking they create.
    const studentId = user.id;

    const cancellationDeadline = new Date(
      new Date(scheduledAt).getTime() - 24 * 60 * 60 * 1000,
    ).toISOString();

    // TODO(stripe): capture the held PaymentIntent on completion.
    const { data: booking, error: bookingError } = await db
      .from('bookings')
      .insert({
        student_id: studentId,
        tutor_id: tutorId,
        subject,
        scheduled_at: scheduledAt,
        duration_minutes: durationMinutes,
        price,
        platform_fee: 0,
        tutor_payout_amount: price,
        session_type: sessionType,
        meeting_link: meetingLink ?? null,
        location: location ?? null,
        status: 'confirmed',
        cancellation_deadline: cancellationDeadline,
        refund_status: 'not_applicable',
        stripe_payment_intent_id: paymentIntentId ?? ('sim_pi_' + crypto.randomUUID()),
      })
      .select('id')
      .single();

    if (bookingError) throw bookingError;

    const { data: conversation, error: conversationError } = await db
      .from('conversations')
      .upsert(
        { student_id: studentId, tutor_id: tutorId },
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
      { bookingId: booking.id, conversationId: conversation.id },
      { headers: cors },
    );
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 400, headers: cors });
  }
});
