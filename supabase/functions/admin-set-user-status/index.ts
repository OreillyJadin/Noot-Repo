// Edge Function: admin-set-user-status.
// ⚠️ SECURITY: admin-only. Re-verifies the caller is an admin server-side, then sets
// users.status AND applies the real login/session enforcement via the GoTrue admin API
// (ban → blocks token issuance/refresh; active → unban). The 0010 trigger makes users.status
// writable only by the service role, so this function is the authoritative path.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireActiveUser, requireAdmin } from '../_shared/auth.ts';
import { logAdminAction } from '../_shared/audit.ts';
import { serveWithErrorReporting } from '../_shared/observability.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serveWithErrorReporting('admin-set-user-status', async (req: Request) => {
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

    const { userId, status } = await req.json().catch(() => ({}));
    if (!userId || !['active', 'suspended', 'banned'].includes(status)) {
      return Response.json({ error: 'userId and status (active|suspended|banned) required' }, { status: 400, headers: cors });
    }
    if (userId === user.id) {
      return Response.json({ error: 'admins cannot change their own status here' }, { status: 400, headers: cors });
    }

    const { data: target, error: targetErr } = await db.from('users')
      .select('deleted_at')
      .eq('id', userId)
      .maybeSingle();
    if (targetErr) return Response.json({ error: targetErr.message }, { status: 400, headers: cors });
    if (!target) return Response.json({ error: 'User not found' }, { status: 404, headers: cors });

    const { error: uErr } = await db.from('users').update({ status }).eq('id', userId);
    if (uErr) return Response.json({ error: uErr.message }, { status: 400, headers: cors });

    const { error: blockErr } = await db.rpc('sync_blocked_signup_email', { p_user: userId });
    if (blockErr) return Response.json({ error: blockErr.message }, { status: 400, headers: cors });

    if (target.deleted_at === null) {
      // Real enforcement: ban blocks the account from getting/refreshing tokens.
      const { error: banErr } = await db.auth.admin.updateUserById(userId, {
        ban_duration: status === 'active' ? 'none' : '876000h',
      });
      if (banErr) return Response.json({ error: banErr.message }, { status: 400, headers: cors });
    }

    await logAdminAction(db, {
      actorId: user.id,
      action: status === 'active' ? 'user.reactivate' : status === 'suspended' ? 'user.suspend' : 'user.ban',
      targetType: 'user',
      targetId: userId,
      details: { status },
    });

    return Response.json({ ok: true, status }, { headers: cors });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 400, headers: cors });
  }
});
