// Edge Function: resolve-dispute.
// ⚠️ SECURITY: admin-only. Re-verifies the caller is an admin, then flags or resolves a
// booking dispute. bookings has no client write policy (0002), so this service-role function
// is the only path that sets the dispute fields.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireActiveUser, requireAdmin } from '../_shared/auth.ts';
import { logAdminAction } from '../_shared/audit.ts';
import { completeBooking } from '../_shared/completeBooking.ts';
import { serveWithErrorReporting } from '../_shared/observability.ts';
import { settleNoShow } from '../_shared/settleNoShow.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serveWithErrorReporting('resolve-dispute', async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401, headers: cors });

    const db = createClient(url, service);
    const inactiveResponse = await requireActiveUser(db, user.id, cors);
    if (inactiveResponse) return inactiveResponse;

    const notAdmin = await requireAdmin(userClient, cors);
    if (notAdmin) return notAdmin;

    const { bookingId, action, reason, resolution, outcome } = await req.json().catch(() => ({}));
    if (!bookingId || (action !== 'flag' && action !== 'resolve')) {
      return Response.json({ error: 'bookingId and action (flag|resolve) required' }, { status: 400, headers: cors });
    }
    if (outcome !== undefined && (
      action !== 'resolve'
      || !['tutor_no_show', 'student_no_show', 'completed'].includes(outcome)
    )) {
      return Response.json({ error: 'Invalid dispute outcome' }, { status: 400, headers: cors });
    }
    const { data: targetBooking, error: targetError } = await db.from('bookings')
      .select('extends_booking_id').eq('id', bookingId).maybeSingle();
    if (targetError) throw targetError;
    if (targetBooking?.extends_booking_id) {
      return Response.json({ error: 'Manage this from the main session' }, { status: 400, headers: cors });
    }

    let settlementBody: Record<string, unknown> | null = null;
    if (action === 'resolve' && outcome) {
      const { data: booking, error: bookingError } = await db.from('bookings')
        .select('id, tutor_id, status, dispute_status, scheduled_at, duration_minutes, stripe_payment_intent_id, stripe_transfer_id, payout_failed_at, tutor_payout_amount, price, created_at, extends_booking_id')
        .eq('id', bookingId).maybeSingle();
      if (bookingError) throw bookingError;
      if (!booking) return Response.json({ error: 'booking not found' }, { status: 404, headers: cors });
      if (booking.dispute_status !== 'flagged') {
        return Response.json({ error: 'Only flagged sessions can be settled with an outcome' }, { status: 409, headers: cors });
      }
      if (booking.extends_booking_id) {
        return Response.json({ error: 'Manage this from the main session' }, { status: 400, headers: cors });
      }
      const result = outcome === 'completed'
        ? await completeBooking(db, url, booking)
        : await settleNoShow(db, bookingId, outcome === 'tutor_no_show' ? 'tutor' : 'student');
      if (result.status !== 200) return Response.json(result.body, { status: result.status, headers: cors });
      settlementBody = result.body;
    }

    const patch = action === 'flag'
      ? { dispute_status: 'flagged', dispute_reason: reason ?? null }
      : {
        dispute_status: 'resolved',
        dispute_resolution: outcome ?? resolution ?? null,
      };

    let updateQuery = db.from('bookings').update(patch).eq('id', bookingId);
    if (action === 'resolve' && outcome) updateQuery = updateQuery.eq('dispute_status', 'flagged');
    const { data: updated, error } = await updateQuery.select('id, dispute_status, student_id, tutor_id').maybeSingle();
    if (error) return Response.json({ error: error.message }, { status: 400, headers: cors });
    if (!updated) return Response.json({ error: 'booking not found' }, { status: 404, headers: cors });

    await logAdminAction(db, {
      actorId: user.id,
      action: action === 'flag' ? 'dispute.flag' : 'dispute.resolve',
      targetType: 'booking',
      targetId: bookingId,
      details: {
        dispute_status: updated.dispute_status,
        ...(action === 'flag' ? { reason: reason ?? null } : { resolution: resolution ?? null }),
        ...(outcome ? { outcome } : {}),
        student_id: updated.student_id,
        tutor_id: updated.tutor_id,
      },
    });

    return Response.json({
      ok: true,
      disputeStatus: updated.dispute_status,
      ...(outcome ? { outcome, ...(settlementBody ?? {}) } : {}),
    }, { headers: cors });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 400, headers: cors });
  }
});
