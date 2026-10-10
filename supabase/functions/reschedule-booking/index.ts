// Edge Function: reschedule-booking (ARCHITECTURE.md §5).
// Two-party reschedule flow for a confirmed booking. One party proposes a new time;
// the counterparty accepts (applies it) or declines (clears the proposal).
// Deno runtime. No money moves here, but the new time still governs money later: the
// cancellation refund tier is computed from it, and the held PaymentIntent must be
// captured before its ~7-day authorization lapses. So the same window and clash rules as
// booking apply (APP_REVIEW_TICKETS.md T19).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireActiveUser } from '../_shared/auth.ts';
import { BOOKING_HORIZON_DAYS, BookingError, interviewClash } from '../_shared/booking.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Action = 'propose' | 'accept' | 'decline';

interface Body {
  bookingId?: string;
  action?: Action;
  newScheduledAt?: string;
}

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

    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!); // service role: bypasses RLS
    const inactiveResponse = await requireActiveUser(db, user.id, cors);
    if (inactiveResponse) return inactiveResponse;

    const body: Body = await req.json().catch(() => ({}));
    const { bookingId, action, newScheduledAt } = body;

    if (!bookingId) return Response.json({ error: 'Missing bookingId' }, { status: 400, headers: cors });
    if (action !== 'propose' && action !== 'accept' && action !== 'decline') {
      return Response.json({ error: 'Invalid action' }, { status: 400, headers: cors });
    }

    // Load the booking and verify the caller is a party to it.
    const { data: booking, error: loadErr } = await db
      .from('bookings')
      .select(
        'id, student_id, tutor_id, status, scheduled_at, duration_minutes, reschedule_proposed_at, reschedule_proposed_by',
      )
      .eq('id', bookingId)
      .single();
    if (loadErr || !booking) {
      return Response.json({ error: 'Booking not found' }, { status: 404, headers: cors });
    }
    if (booking.student_id !== user.id && booking.tutor_id !== user.id) {
      return Response.json({ error: 'Not a party to this booking' }, { status: 403, headers: cors });
    }

    // Only confirmed bookings can be rescheduled.
    if (booking.status !== 'confirmed') {
      return Response.json(
        { error: `Cannot reschedule a booking with status '${booking.status}'` },
        { status: 409, headers: cors },
      );
    }

    if (action === 'propose') {
      if (!newScheduledAt) {
        return Response.json({ error: 'Missing newScheduledAt' }, { status: 400, headers: cors });
      }
      const when = new Date(newScheduledAt);
      if (isNaN(when.getTime())) {
        return Response.json({ error: 'Invalid newScheduledAt' }, { status: 400, headers: cors });
      }

      // The proposed time is subject to the same rules as an original booking. Without
      // these a party could move a session into the past and then "late cancel" it for a
      // 0% refund, or push it months out so the hold lapsed and the tutor went unpaid.
      const now = Date.now();
      if (when.getTime() <= now) {
        return Response.json({ error: 'Pick a time in the future.' }, { status: 400, headers: cors });
      }
      if (when.getTime() > now + BOOKING_HORIZON_DAYS * 24 * 60 * 60 * 1000) {
        return Response.json(
          { error: `Sessions can only be moved up to ${BOOKING_HORIZON_DAYS} days ahead.` },
          { status: 400, headers: cors },
        );
      }

      // Don't propose a slot the tutor already has taken.
      const durationMinutes = Number(booking.duration_minutes ?? 0);
      const startMs = when.getTime();
      const endMs = startMs + durationMinutes * 60 * 1000;
      const { data: clashes, error: clashErr } = await db
        .from('bookings')
        .select('id, scheduled_at, duration_minutes')
        .eq('tutor_id', booking.tutor_id)
        .neq('id', bookingId)
        .in('status', ['pending', 'confirmed'])
        .gte('scheduled_at', new Date(startMs - 8 * 60 * 60 * 1000).toISOString())
        .lte('scheduled_at', new Date(endMs).toISOString());
      if (clashErr) throw clashErr;
      for (const b of clashes ?? []) {
        const bStart = new Date(b.scheduled_at as string).getTime();
        const bEnd = bStart + Number(b.duration_minutes ?? 0) * 60 * 1000;
        if (bStart < endMs && startMs < bEnd) {
          return Response.json(
            { error: 'That time is already booked. Please pick another.' },
            { status: 409, headers: cors },
          );
        }
      }

      // Nor one the noot team has taken for this tutor's interview (ERR-032) — in the same
      // words, so the two can't be told apart.
      if (await interviewClash(db, booking.tutor_id as string, startMs, endMs)) {
        return Response.json(
          { error: 'That time is already booked. Please pick another.' },
          { status: 409, headers: cors },
        );
      }

      // TODO: enforce the 3-reschedule auto-refund rule.
      const { error } = await db
        .from('bookings')
        .update({
          reschedule_proposed_at: when.toISOString(),
          reschedule_proposed_by: user.id,
          // status stays 'confirmed' while a proposal is pending.
        })
        .eq('id', bookingId);
      if (error) throw error;
      return Response.json({ ok: true }, { headers: cors });
    }

    // accept / decline both require a pending proposal.
    if (!booking.reschedule_proposed_at || !booking.reschedule_proposed_by) {
      return Response.json({ error: 'No pending reschedule proposal' }, { status: 409, headers: cors });
    }

    // ...and must come from the OTHER party. This is a two-party flow; accepting your own
    // proposal made it a one-sided rewrite of the session time, which is how the past-date
    // and far-future attacks above were reachable at all.
    if (booking.reschedule_proposed_by === user.id) {
      return Response.json(
        { error: 'Only the other person can respond to your proposal.' },
        { status: 403, headers: cors },
      );
    }

    if (action === 'accept') {
      const newTime = new Date(booking.reschedule_proposed_at);
      // A proposal can sit unanswered until its time has passed — re-check on the way in.
      if (newTime.getTime() <= Date.now()) {
        return Response.json(
          { error: 'That proposed time has already passed. Ask for a new time.' },
          { status: 409, headers: cors },
        );
      }
      // New cancellation deadline is 24h before the new session time.
      const deadline = new Date(newTime.getTime() - 24 * 60 * 60 * 1000);
      const { error } = await db
        .from('bookings')
        .update({
          scheduled_at: newTime.toISOString(),
          cancellation_deadline: deadline.toISOString(),
          reschedule_proposed_at: null,
          reschedule_proposed_by: null,
        })
        .eq('id', bookingId);
      if (error) throw error;
      // TODO(stripe): no money movement — schedule change only.
      return Response.json({ ok: true }, { headers: cors });
    }

    // action === 'decline'
    const { error } = await db
      .from('bookings')
      .update({
        reschedule_proposed_at: null,
        reschedule_proposed_by: null,
      })
      .eq('id', bookingId);
    if (error) throw error;
    return Response.json({ ok: true }, { headers: cors });
  } catch (e) {
    if (e instanceof BookingError) {
      return Response.json({ error: e.message }, { status: e.status, headers: cors });
    }
    console.error('reschedule-booking failed', JSON.stringify(e), e);
    return Response.json(
      { error: 'Something went wrong rescheduling that session. Please try again.' },
      { status: 400, headers: cors },
    );
  }
});
