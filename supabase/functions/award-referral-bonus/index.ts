// Edge Function: award-referral-bonus.
// ⚠️ SECURITY-REVIEW (referral fraud). Creates the flat $5 referral bonus when a referred
// user's FIRST paid session completes. Service-role only; intended to be called from
// complete-session (NOT yet built — the Stripe/completion workstream). Idempotent and
// fraud-guarded: referral_bonuses.referral_id is UNIQUE (one bonus per referral ever), the
// booking must be 'completed', and self-referrals are already blocked by a CHECK on
// referrals (ambassador_id <> referred_user_id). Never callable in a way that lets a client
// mint bonuses — it re-derives everything from the booking + referral rows with service role.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { bookingId } = await req.json().catch(() => ({}));
    if (!bookingId) return Response.json({ error: 'bookingId required' }, { status: 400, headers: cors });

    const url = Deno.env.get('SUPABASE_URL')!;
    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: booking, error: bErr } = await db
      .from('bookings')
      .select('id, student_id, status')
      .eq('id', bookingId)
      .maybeSingle();
    if (bErr) return Response.json({ error: bErr.message }, { status: 400, headers: cors });
    if (!booking) return Response.json({ error: 'booking not found' }, { status: 404, headers: cors });
    if (booking.status !== 'completed') {
      return Response.json({ awarded: false, reason: 'booking not completed' }, { headers: cors });
    }

    // Was this student referred?
    const { data: referral } = await db
      .from('referrals')
      .select('id, ambassador_id')
      .eq('referred_user_id', booking.student_id)
      .maybeSingle();
    if (!referral) return Response.json({ awarded: false, reason: 'not referred' }, { headers: cors });

    // One bonus per referral ever (unique constraint is the hard guard; check to be graceful).
    const { data: existing } = await db
      .from('referral_bonuses')
      .select('id')
      .eq('referral_id', referral.id)
      .maybeSingle();
    if (existing) return Response.json({ awarded: false, reason: 'already awarded' }, { headers: cors });

    const { error: insErr } = await db.from('referral_bonuses').insert({
      ambassador_id: referral.ambassador_id,
      referral_id: referral.id,
      triggering_booking_id: booking.id,
      // bonus_amount defaults to 5.00; status defaults to 'pending' until the payout clears.
    });
    if (insErr) return Response.json({ error: insErr.message }, { status: 400, headers: cors });

    return Response.json({ awarded: true }, { headers: cors });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 400, headers: cors });
  }
});
