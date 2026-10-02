// Edge Function: award-referral-bonus.
// ⚠️ SECURITY-REVIEW (referral fraud). When a booking completes, credits $5 of Noot credit
// to whoever invited the student and whoever invited the tutor — once per invited person,
// ever — plus any ambassador milestone that unlocks (award_invite_rewards, 0040). Called
// from complete-session. Service-role only (see the Authorization check below) so an
// end-user JWT can't mint credit. Self-referral is blocked by a CHECK on referrals.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    // AUTHORIZATION: this mints financial (bonus) records, so it is INTERNAL-only — the
    // caller must present the service-role key (i.e. it's invoked server-side by
    // complete-session, not by an end-user JWT). A normal user/anon token is rejected.
    const authz = req.headers.get('Authorization') ?? '';
    const token = authz.startsWith('Bearer ') ? authz.slice(7) : authz;
    if (token !== serviceKey) {
      return Response.json({ error: 'forbidden' }, { status: 403, headers: cors });
    }

    const { bookingId } = await req.json().catch(() => ({}));
    if (!bookingId) return Response.json({ error: 'bookingId required' }, { status: 400, headers: cors });

    const url = Deno.env.get('SUPABASE_URL')!;
    const db = createClient(url, serviceKey);

    // award_invite_rewards (0040) does the checks and is idempotent: the booking must be
    // completed, each invited person earns their inviter one reward ever, and an
    // ambassador's milestone bonuses are paid once each.
    const { data: awarded, error } = await db.rpc('award_invite_rewards', { p_booking: bookingId });
    if (error) return Response.json({ error: error.message }, { status: 400, headers: cors });

    return Response.json({ awarded: Number(awarded ?? 0) > 0, rewards: Number(awarded ?? 0) }, { headers: cors });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 400, headers: cors });
  }
});
