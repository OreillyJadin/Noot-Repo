// Edge Function: resolve-dispute.
// ⚠️ SECURITY: admin-only. Re-verifies the caller is an admin, then flags or resolves a
// booking dispute. bookings has no client write policy (0002), so this service-role function
// is the only path that sets the dispute fields.
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
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401, headers: cors });

    const db = createClient(url, service);
    const { data: adminRow } = await db
      .from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
    if (!adminRow) return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });

    const { bookingId, action, reason, resolution } = await req.json().catch(() => ({}));
    if (!bookingId || (action !== 'flag' && action !== 'resolve')) {
      return Response.json({ error: 'bookingId and action (flag|resolve) required' }, { status: 400, headers: cors });
    }

    const patch = action === 'flag'
      ? { dispute_status: 'flagged', dispute_reason: reason ?? null }
      : { dispute_status: 'resolved', dispute_resolution: resolution ?? null };

    const { data: updated, error } = await db
      .from('bookings').update(patch).eq('id', bookingId).select('id, dispute_status').maybeSingle();
    if (error) return Response.json({ error: error.message }, { status: 400, headers: cors });
    if (!updated) return Response.json({ error: 'booking not found' }, { status: 404, headers: cors });

    return Response.json({ ok: true, disputeStatus: updated.dispute_status }, { headers: cors });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 400, headers: cors });
  }
});
