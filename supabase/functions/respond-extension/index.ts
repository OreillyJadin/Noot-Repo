import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireActiveUser } from '../_shared/auth.ts';
import { ensureVideoRoom } from '../_shared/daily.ts';
import { serveWithErrorReporting } from '../_shared/observability.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface Body {
  bookingId?: string;
  accept?: boolean;
}

async function notify(db: ReturnType<typeof createClient>, userId: string, title: string, body: string, bookingId: string, extensionId: string) {
  const { error } = await db.rpc('create_notification', {
    p_user: userId,
    p_type: 'booking',
    p_title: title,
    p_body: body,
    p_data: { bookingId, extensionBookingId: extensionId },
  });
  if (error) console.error('respond-extension: notification failed', error.message);
}

serveWithErrorReporting('respond-extension', async (req: Request) => {
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

    const body = await req.json().catch(() => ({})) as Body;
    if (typeof body.bookingId !== 'string' || !body.bookingId) {
      return Response.json({ error: 'bookingId is required' }, { status: 400, headers: cors });
    }
    if (typeof body.accept !== 'boolean') {
      return Response.json({ error: 'accept must be a boolean' }, { status: 400, headers: cors });
    }
    const { data: extension, error: extensionError } = await db.from('bookings')
      .select('id, extends_booking_id, student_id, tutor_id, status, accept_by, duration_minutes, stripe_payment_intent_id')
      .eq('id', body.bookingId).maybeSingle();
    if (extensionError) throw extensionError;
    if (!extension) return Response.json({ error: 'Extension request not found' }, { status: 404, headers: cors });
    if (!extension.extends_booking_id) {
      return Response.json({ error: 'Manage this from the main session' }, { status: 400, headers: cors });
    }
    if (extension.tutor_id !== user.id) {
      return Response.json({ error: 'Only the tutor can respond to this request' }, { status: 403, headers: cors });
    }
    if (extension.status !== 'pending') {
      return Response.json({ error: 'This request is no longer pending' }, { status: 409, headers: cors });
    }
    const now = new Date();
    if (!extension.accept_by || now.getTime() >= new Date(extension.accept_by).getTime()) {
      return Response.json({ error: 'This request has expired' }, { status: 409, headers: cors });
    }
    const { data: parent, error: parentError } = await db.from('bookings')
      .select('id, status, dispute_status, no_show_claimed_at, completion_claimed_at, session_type, daily_room_name, scheduled_at, duration_minutes')
      .eq('id', extension.extends_booking_id).maybeSingle();
    if (parentError) throw parentError;
    if (!parent || parent.status !== 'confirmed' || parent.dispute_status === 'flagged' || parent.no_show_claimed_at || parent.completion_claimed_at) {
      return Response.json({ error: 'This session is under review' }, { status: 409, headers: cors });
    }

    if (body.accept) {
      const { data: updated, error: updateError } = await db.from('bookings')
        .update({ status: 'confirmed', accepted_at: now.toISOString() })
        .eq('id', extension.id).eq('status', 'pending').gt('accept_by', now.toISOString())
        .select('id').maybeSingle();
      if (updateError) throw updateError;
      if (!updated) return Response.json({ error: 'This request has expired or is no longer pending' }, { status: 409, headers: cors });
      if (parent.session_type === 'video') {
        try {
          if (!parent.daily_room_name) throw new Error('Video session has no Daily room');
          await ensureVideoRoom(
            parent.daily_room_name,
            parent.scheduled_at,
            Number(parent.duration_minutes) + Number(extension.duration_minutes),
            true,
          );
        } catch (error) {
          await db.from('bookings').update({ status: 'pending', accepted_at: null })
            .eq('id', extension.id).eq('status', 'confirmed').eq('accepted_at', now.toISOString());
          throw error;
        }
      }
      await notify(db, extension.student_id, 'Extra time accepted', `Your tutor accepted ${extension.duration_minutes} extra minutes.`, parent.id, extension.id);
      return Response.json({ status: 'confirmed', bookingId: extension.id }, { headers: cors });
    }

    const cancelledAt = now.toISOString();
    const simulated = !extension.stripe_payment_intent_id || extension.stripe_payment_intent_id.startsWith('sim_pi_');
    const { data: updated, error: updateError } = await db.from('bookings').update({
      status: 'cancelled',
      cancelled_at: cancelledAt,
      cancelled_by_role: 'tutor',
      cancelled_from_status: 'pending',
      cancel_reason: 'tutor_declined',
      refund_percent: 100,
      refund_status: 'refunded',
      stripe_charge_id: null,
      stripe_transfer_id: null,
      hold_released_at: simulated ? cancelledAt : null,
    }).eq('id', extension.id).eq('status', 'pending').select('id').maybeSingle();
    if (updateError) throw updateError;
    if (!updated) return Response.json({ error: 'This request is no longer pending' }, { status: 409, headers: cors });
    if (!simulated) {
      await fetch(`${url}/functions/v1/release-booking-holds`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}`,
        },
        body: '{}',
      }).catch((error) => console.error('respond-extension: hold release request failed', String(error)));
    }
    await notify(db, extension.student_id, 'Extra time declined', 'Your tutor declined the extra-time request.', parent.id, extension.id);
    return Response.json({ status: 'cancelled', bookingId: extension.id }, { headers: cors });
  } catch (error) {
    console.error('respond-extension failed', error);
    return Response.json({ error: 'Could not respond to the extension request' }, { status: 500, headers: cors });
  }
});
