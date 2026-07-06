// Edge Function: reschedule-booking (ARCHITECTURE.md §5).
// Two-party reschedule flow for a confirmed booking. One party proposes a new time;
// the counterparty accepts (applies it) or declines (clears the proposal).
// Deno runtime. Self-contained (no _shared import). Money movement is out of scope.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
        'id, student_id, tutor_id, status, scheduled_at, reschedule_proposed_at, reschedule_proposed_by',
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

    if (action === 'accept') {
      const newTime = new Date(booking.reschedule_proposed_at);
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
    return Response.json({ error: String(e) }, { status: 400, headers: cors });
  }
});
