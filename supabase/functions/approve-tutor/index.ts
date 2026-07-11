// Edge Function: approve-tutor.
// ⚠️ SECURITY: the ONLY writer of tutor_profiles.approval_status (the 0009 trigger blocks
// every non-service-role write). Re-verifies the caller is an admin SERVER-SIDE — the app's
// client-side admin gate is UI-only and never trusted here. Sets approval_status +
// reviewed_by (the admin) + reviewed_at. Mirrors the submit-rating auth pattern.
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
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401, headers: cors });

    const db = createClient(url, service);

    // Re-verify admin server-side (do NOT trust the client).
    const { data: adminRow } = await db
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();
    if (!adminRow) return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });

    const { tutorUserId, decision } = await req.json().catch(() => ({}));
    if (!tutorUserId || (decision !== 'approved' && decision !== 'rejected')) {
      return Response.json({ error: 'tutorUserId and decision (approved|rejected) required' }, { status: 400, headers: cors });
    }

    const { data: updated, error } = await db
      .from('tutor_profiles')
      .update({ approval_status: decision, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
      .eq('user_id', tutorUserId)
      .select('user_id, approval_status')
      .maybeSingle();
    if (error) return Response.json({ error: error.message }, { status: 400, headers: cors });
    if (!updated) return Response.json({ error: 'tutor profile not found' }, { status: 404, headers: cors });

    return Response.json({ ok: true, approvalStatus: updated.approval_status }, { headers: cors });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 400, headers: cors });
  }
});
