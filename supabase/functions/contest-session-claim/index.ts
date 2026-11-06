import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireActiveUser } from '../_shared/auth.ts';
import { fetchAttendance, classifyAttendance } from '../_shared/daily.ts';
import { settleNoShow } from '../_shared/settleNoShow.ts';
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
  if (error) console.error('contest-session-claim: notification failed', bookingId, userId);
}

serveWithErrorReporting('contest-session-claim', async (req: Request) => {
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
    const bookingId: unknown = body?.bookingId;
    const kind: unknown = body?.kind;
    const noteValue: unknown = body?.note;
    if (typeof bookingId !== 'string' || !bookingId) {
      return Response.json({ error: 'bookingId is required' }, { status: 400, headers: cors });
    }
    if (kind !== 'no_show' && kind !== 'completion') {
      return Response.json({ error: "kind must be 'no_show' or 'completion'" }, { status: 400, headers: cors });
    }
    if (noteValue !== undefined && (typeof noteValue !== 'string' || noteValue.length > 300)) {
      return Response.json({ error: 'note must be 300 characters or fewer' }, { status: 400, headers: cors });
    }
    const note = typeof noteValue === 'string' ? noteValue.trim() : '';
    const { data: booking, error } = await db.from('bookings')
      .select('id, student_id, tutor_id, subject, status, session_type, daily_room_name, scheduled_at, duration_minutes, dispute_status, no_show_claim_party, no_show_claimed_at, no_show_contested_at, completion_claimed_at, completion_objected_at')
      .eq('id', bookingId).maybeSingle();
    if (error || !booking) return Response.json({ error: 'Booking not found' }, { status: 404, headers: cors });
    const isStudent = booking.student_id === user.id;
    const isTutor = booking.tutor_id === user.id;
    if (!isStudent && !isTutor) return Response.json({ error: 'Not a party to this booking' }, { status: 403, headers: cors });
    if (booking.dispute_status === 'flagged') return Response.json({ error: REVIEW_MESSAGE }, { status: 409, headers: cors });
    if (booking.status !== 'confirmed') return Response.json({ error: 'This claim is no longer open' }, { status: 409, headers: cors });

    if (kind === 'no_show') {
      const claimAt = booking.no_show_claimed_at;
      if (!claimAt || booking.no_show_contested_at || booking.no_show_claim_party == null) {
        return Response.json({ error: 'No open no-show claim' }, { status: 409, headers: cors });
      }
      const accusedId = booking.no_show_claim_party === 'tutor' ? booking.tutor_id : booking.student_id;
      if (accusedId !== user.id) return Response.json({ error: 'Only the accused party may contest this claim' }, { status: 403, headers: cors });
      if (Date.now() > Date.parse(claimAt) + 24 * 60 * 60 * 1000) {
        return Response.json({ error: 'The contest window has closed' }, { status: 409, headers: cors });
      }
      const evidence = booking.session_type === 'video' && booking.daily_room_name
        ? await fetchAttendance(
          booking.daily_room_name, booking.scheduled_at, Number(booking.duration_minutes), booking.student_id, booking.tutor_id,
        )
        : null;
      const checkedAt = new Date().toISOString();
      const snapshot = evidence
        ? { checked_at: checkedAt, student_seconds: Math.round(evidence.get(booking.student_id) ?? 0), tutor_seconds: Math.round(evidence.get(booking.tutor_id) ?? 0) }
        : { checked_at: checkedAt, unavailable: true };
      const reporterId = booking.no_show_claim_party === 'tutor' ? booking.student_id : booking.tutor_id;
      const reporterSeconds = evidence?.get(reporterId) ?? 0;
      const accusedSeconds = evidence?.get(accusedId) ?? 0;
      const attendance = evidence ? classifyAttendance({
        studentSeconds: snapshot.student_seconds ?? 0,
        tutorSeconds: snapshot.tutor_seconds ?? 0,
      }) : null;
      const clearEvidence = attendance !== null && accusedSeconds === 0 && reporterSeconds >= 300;
      const patch = {
        no_show_contested_at: checkedAt,
        no_show_contest_note: note || null,
        attendance: snapshot,
        ...(!clearEvidence ? {
          dispute_status: 'flagged',
          dispute_reason: `No-show contested: ${note}`.slice(0, 400),
        } : {}),
      };
      const { data: updated, error: updateError } = await db.from('bookings').update(patch)
        .eq('id', bookingId).eq('status', 'confirmed').eq('dispute_status', 'none')
        .eq('no_show_claimed_at', claimAt).is('no_show_contested_at', null)
        .select('id').maybeSingle();
      if (updateError) throw updateError;
      if (!updated) return Response.json({ error: 'This claim is no longer open' }, { status: 409, headers: cors });
      if (clearEvidence) {
        const result = await settleNoShow(db, bookingId, booking.no_show_claim_party);
        return Response.json(result.body, { status: result.status, headers: cors });
      }
      await notify(db, booking.student_id, 'Session under review', 'A no-show claim was contested. Our team will review it.', bookingId);
      await notify(db, booking.tutor_id, 'Session under review', 'A no-show claim was contested. Our team will review it.', bookingId);
      return Response.json({ status: 'under_review' }, { headers: cors });
    }

    if (!isStudent) return Response.json({ error: 'Only the student may object to completion' }, { status: 403, headers: cors });
    const completionAt = booking.completion_claimed_at;
    if (!completionAt || booking.completion_objected_at) {
      return Response.json({ error: 'No open completion claim' }, { status: 409, headers: cors });
    }
    if (Date.now() > Date.parse(completionAt) + 24 * 60 * 60 * 1000) {
      return Response.json({ error: 'The objection window has closed' }, { status: 409, headers: cors });
    }
    const { data: updated, error: updateError } = await db.from('bookings').update({
      completion_objected_at: new Date().toISOString(),
      completion_objection_note: note || null,
      dispute_status: 'flagged',
      dispute_reason: `Student objected to completion: ${note}`.slice(0, 400),
    }).eq('id', bookingId).eq('status', 'confirmed').eq('dispute_status', 'none')
      .eq('completion_claimed_at', completionAt).is('completion_objected_at', null)
      .select('id').maybeSingle();
    if (updateError) throw updateError;
    if (!updated) return Response.json({ error: 'This claim is no longer open' }, { status: 409, headers: cors });
    await notify(db, booking.tutor_id, 'Session under review', 'The student objected to your completion claim. Our team will review it.', bookingId);
    return Response.json({ status: 'under_review' }, { headers: cors });
  } catch (error) {
    console.error('contest-session-claim failed', JSON.stringify(error), error);
    return Response.json({ error: 'Something went wrong contesting this claim. Please try again.' }, { status: 400, headers: cors });
  }
});
