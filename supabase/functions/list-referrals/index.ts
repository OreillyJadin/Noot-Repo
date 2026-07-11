// Edge Function: list-referrals.
// Returns the signed-in ambassador's referrals with each referred user's display name and
// the bonus pipeline status, plus running totals. Exists (like resolve-participants)
// because users_select RLS won't let an ambassador read a referred STUDENT's row directly,
// and because deriving "first paid session" needs cross-user reads. Resolves ONLY the
// caller's own referrals with the service role, so the privacy boundary is preserved.
//
// Pipeline status per referral:
//   'signed_up'    — referral exists, no bonus yet
//   'bonus_pending'— first paid session done, bonus awarded but not yet paid out
//   'bonus_paid'   — bonus paid to the ambassador
//
// Deno runtime. Self-contained, mirrors resolve-participants.
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
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401, headers: cors });

    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // The caller's referrals.
    const { data: referrals, error: rErr } = await db
      .from('referrals')
      .select('id, referred_user_id, referred_role, created_at')
      .eq('ambassador_id', user.id)
      .order('created_at', { ascending: false });
    if (rErr) return Response.json({ error: rErr.message }, { status: 400, headers: cors });

    const rows = referrals ?? [];
    const referredIds = rows.map((r) => r.referred_user_id);
    const referralIds = rows.map((r) => r.id);

    // Referred users' names.
    const names: Record<string, string> = {};
    if (referredIds.length) {
      const { data: users } = await db.from('users').select('id, first_name, last_name').in('id', referredIds);
      for (const u of users ?? []) {
        names[u.id] = `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || 'Student';
      }
    }

    // Bonuses keyed by referral_id.
    const bonusByReferral: Record<string, { status: string; amount: number }> = {};
    if (referralIds.length) {
      const { data: bonuses } = await db
        .from('referral_bonuses')
        .select('referral_id, status, bonus_amount')
        .in('referral_id', referralIds);
      for (const b of bonuses ?? []) {
        bonusByReferral[b.referral_id] = { status: b.status, amount: Number(b.bonus_amount) };
      }
    }

    let totalEarned = 0;
    const out = rows.map((r) => {
      const bonus = bonusByReferral[r.id];
      const status = !bonus ? 'signed_up' : bonus.status === 'paid' ? 'bonus_paid' : 'bonus_pending';
      if (bonus?.status === 'paid') totalEarned += bonus.amount;
      return {
        referralId: r.id,
        name: names[r.referred_user_id] ?? 'Student',
        referredRole: r.referred_role,
        status,
        bonusAmount: bonus?.amount ?? 0,
        createdAt: r.created_at,
      };
    });

    return Response.json(
      {
        referrals: out,
        totals: {
          referrals: out.length,
          bonusesEarned: out.filter((r) => r.status === 'bonus_paid').length,
          totalEarned,
        },
      },
      { headers: cors },
    );
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 400, headers: cors });
  }
});
