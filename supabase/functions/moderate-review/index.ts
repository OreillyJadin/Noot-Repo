// Edge Function: moderate-review.
// ⚠️ SECURITY: admin-only. Re-verifies the caller is an admin, then approves/rejects a
// pending review. Reviews have NO client write policy (0002) — this service-role function
// is the only path that flips approval_status. On approval, recomputes the rated tutor's
// denormalized rating_avg from their approved reviews.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireActiveUser } from '../_shared/auth.ts';

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
    const inactiveResponse = await requireActiveUser(db, user.id, cors);
    if (inactiveResponse) return inactiveResponse;

    const { data: adminRow } = await db
      .from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
    if (!adminRow) return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });

    const { reviewId, decision } = await req.json().catch(() => ({}));
    if (!reviewId || (decision !== 'approved' && decision !== 'rejected')) {
      return Response.json({ error: 'reviewId and decision (approved|rejected) required' }, { status: 400, headers: cors });
    }

    const { data: review, error: rErr } = await db
      .from('reviews')
      .update({ approval_status: decision, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
      .eq('id', reviewId)
      .select('subject_user_id')
      .maybeSingle();
    if (rErr) return Response.json({ error: rErr.message }, { status: 400, headers: cors });
    if (!review) return Response.json({ error: 'review not found' }, { status: 404, headers: cors });

    // Recompute the rated user's denormalized average from their APPROVED reviews.
    if (decision === 'approved') {
      const { data: approved } = await db
        .from('reviews').select('rating').eq('subject_user_id', review.subject_user_id).eq('approval_status', 'approved');
      const list = approved ?? [];
      const avg = list.length ? list.reduce((s, r) => s + Number(r.rating), 0) / list.length : null;
      await db.from('tutor_profiles').update({ rating_avg: avg }).eq('user_id', review.subject_user_id);
    }

    return Response.json({ ok: true }, { headers: cors });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 400, headers: cors });
  }
});
