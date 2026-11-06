import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireActiveUser } from '../_shared/auth.ts';
import { BookingError, NO_SHOW_WINDOW_HOURS, assertSessionElapsed } from '../_shared/booking.ts';
import { fetchAttendance, classifyAttendance } from '../_shared/daily.ts';
import { effectiveDurationMinutes } from '../_shared/extensions.ts';
import { serveWithErrorReporting } from '../_shared/observability.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const REVIEW_MESSAGE = 'This session is under review by the noot team.';

async function notify(db: ReturnType<typeof createClient>, userId: string, title: string, body: string, bookingId: string) {
  const { error } = await db.rpc('create_notification', {
    p_user: userId, p_type: 'booking', p_title: title, p_body: body, p_data: { bookingId },
  });
  if (error) console.error('report-no-show: notification failed', bookingId, userId);
}

serveWithErrorReporting('report-no-show', async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401, headers: cors });
    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const inactive = await requireActiveUser(db, user.id, cors);
    if (inactive) return inactive;
    const body = await req.json().catch(() => ({}));
    const bookingId: string | undefined = body?.bookingId;
    const party: string | undefined = body?.party;
    if (!bookingId) return Response.json({ error: 'bookingId is required' }, { status: 400, headers: cors });
    if (party !== 'student' && party !== 'tutor') {
      return Response.json({ error: "party must be 'student' or 'tutor'" }, { status: 400, headers: cors });
    }
    const { data: booking, error } = await db.from('bookings')
      .select('id, student_id, tutor_id, subject, status, scheduled_at, duration_minutes, session_type, daily_room_name, dispute_status, no_show_claimed_at, extends_booking_id')
      .eq('id', bookingId).maybeSingle();
    if (error || !booking) return Response.json({ error: 'Booking not found' }, { status: 404, headers: cors });
    const isStudent = booking.student_id === user.id;
    const isTutor = booking.tutor_id === user.id;
    if (!isStudent && !isTutor) return Response.json({ error: 'Not a party to this booking' }, { status: 403, headers: cors });
    if (booking.extends_booking_id) {
      return Response.json({ error: 'Manage this from the main session' }, { status: 400, headers: cors });
    }
    if (booking.dispute_status === 'flagged') return Response.json({ error: REVIEW_MESSAGE }, { status: 409, headers: cors });
    if (party === 'tutor' ? !isStudent : !isTutor) {
      return Response.json({ error: 'Only the other party may report a no-show' }, { status: 403, headers: cors });
    }
    if (booking.status !== 'confirmed') {
      return Response.json({ error: `Cannot report a no-show on a ${booking.status} session` }, { status: 409, headers: cors });
    }
    if (booking.no_show_claimed_at) return Response.json({ error: 'A no-show claim is already open' }, { status: 409, headers: cors });
    const duration = await effectiveDurationMinutes(db, booking.id, Number(booking.duration_minutes));
    assertSessionElapsed(booking.scheduled_at, duration, { withinHours: NO_SHOW_WINDOW_HOURS });

    const evidence = booking.session_type === 'video' && booking.daily_room_name
      ? await fetchAttendance(
        booking.daily_room_name, booking.scheduled_at, duration, booking.student_id, booking.tutor_id,
      )
      : null;
    const checkedAt = new Date().toISOString();
    const snapshot = evidence
      ? {
        checked_at: checkedAt,
        student_seconds: Math.round(evidence.get(booking.student_id) ?? 0),
        tutor_seconds: Math.round(evidence.get(booking.tutor_id) ?? 0),
      }
      : { checked_at: checkedAt, unavailable: true };
    const contradiction = evidence !== null && classifyAttendance({
      studentSeconds: snapshot.student_seconds ?? 0,
      tutorSeconds: snapshot.tutor_seconds ?? 0,
    })[party === 'tutor' ? 'tutorAttended' : 'studentAttended'];
    const flagged = contradiction;
    const patch = {
      no_show_claim_party: party,
      no_show_claimed_by: user.id,
      no_show_claimed_at: checkedAt,
      attendance: snapshot,
      ...(flagged ? {
        dispute_status: 'flagged',
        dispute_reason: 'No-show report contradicted by video attendance',
      } : {}),
    };
    const { data: claimed, error: claimError } = await db.from('bookings').update(patch)
      .eq('id', bookingId).eq('status', 'confirmed').eq('dispute_status', 'none')
      .is('no_show_claimed_at', null).select('id').maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) return Response.json({ error: 'A no-show claim is already open' }, { status: 409, headers: cors });

    const { data: reporter } = await db.from('users').select('first_name').eq('id', user.id).maybeSingle();
    const reporterName = reporter?.first_name?.trim() || (isStudent ? 'The student' : 'The tutor');
    const accusedId = party === 'student' ? booking.student_id : booking.tutor_id;
    const date = new Date(booking.scheduled_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
    const message = `${reporterName} reported you as a no-show for ${booking.subject} on ${date}. If you were there, contest it within 24 hours.`;
    if (flagged) {
      await notify(db, booking.student_id, 'Session under review', 'Video attendance contradicted a no-show report. Our team will review it.', bookingId);
      await notify(db, booking.tutor_id, 'Session under review', 'Video attendance contradicted a no-show report. Our team will review it.', bookingId);
      return Response.json({ status: 'under_review' }, { headers: cors });
    }
    await notify(db, accusedId, 'No-show claim', message, bookingId);
    return Response.json({
      status: 'claimed',
      contestBy: new Date(Date.parse(checkedAt) + 24 * 60 * 60 * 1000).toISOString(),
      attendance: snapshot,
    }, { headers: cors });
  } catch (e) {
    if (e instanceof BookingError) return Response.json({ error: e.message }, { status: e.status, headers: cors });
    console.error('report-no-show failed', JSON.stringify(e), e);
    return Response.json({ error: 'Something went wrong reporting that no-show. Please try again.' }, { status: 400, headers: cors });
  }
});
