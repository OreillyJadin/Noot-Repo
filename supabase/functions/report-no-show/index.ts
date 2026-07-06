// Edge Function: report-no-show.
// A party reports that the OTHER party did not show up for a booked session.
// Body: { bookingId, party: 'student'|'tutor' } where `party` = who DID NOT show.
// The caller must be the OTHER party to the booking.
//  - tutor no-show  -> student refunded  (refund_percent=100, refund_status='refunded')
//  - student no-show -> tutor still paid  (refund_percent=0,   refund_status='not_refunded')
// Self-contained; SUPABASE_* env vars are auto-injected by the runtime.
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
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401, headers: cors });

    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!); // service role: bypasses RLS

    const body = await req.json().catch(() => ({}));
    const bookingId: string | undefined = body?.bookingId;
    const party: string | undefined = body?.party;
    if (!bookingId) return Response.json({ error: 'bookingId is required' }, { status: 400, headers: cors });
    if (party !== 'student' && party !== 'tutor') {
      return Response.json({ error: "party must be 'student' or 'tutor'" }, { status: 400, headers: cors });
    }

    // Load the booking.
    const { data: booking, error: loadErr } = await db
      .from('bookings')
      .select('id, student_id, tutor_id, status')
      .eq('id', bookingId)
      .single();
    if (loadErr || !booking) return Response.json({ error: 'Booking not found' }, { status: 404, headers: cors });

    // Verify the caller is a party to the booking...
    const isStudent = booking.student_id === user.id;
    const isTutor = booking.tutor_id === user.id;
    if (!isStudent && !isTutor) {
      return Response.json({ error: 'Not a party to this booking' }, { status: 403, headers: cors });
    }

    // ...and specifically the OTHER party from the one who no-showed.
    // If the tutor didn't show, the student must be the reporter (and vice versa).
    const reporterMatchesOtherParty = party === 'tutor' ? isStudent : isTutor;
    if (!reporterMatchesOtherParty) {
      return Response.json(
        { error: 'Only the other party may report a no-show' },
        { status: 403, headers: cors },
      );
    }

    // Determine refund outcome.
    const tutorNoShow = party === 'tutor';
    const refundPercent = tutorNoShow ? 100 : 0;
    const refundStatus = tutorNoShow ? 'refunded' : 'not_refunded';

    const { error: updateErr } = await db
      .from('bookings')
      .update({
        status: 'no_show',
        refund_percent: refundPercent,
        refund_status: refundStatus,
      })
      .eq('id', bookingId);
    if (updateErr) return Response.json({ error: updateErr.message }, { status: 400, headers: cors });

    // TODO(stripe): process refund/payout — refund the student's held charge when the
    // tutor no-shows (100%), or capture/release payout to the tutor when the student
    // no-shows (0% refund).
    // TODO: 3-strike escalation tracking — accumulate no-show strikes per user and
    // escalate (warn/suspend) once a threshold is reached.

    return Response.json({ status: 'no_show', refundPercent }, { headers: cors });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 400, headers: cors });
  }
});
