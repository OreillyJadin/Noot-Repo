// Edge Function: connect-status.
// Returns the caller's (TUTOR's) Stripe Connect readiness so the payout-setup UI can show
// "connected / payouts enabled / setup incomplete". Reads Accounts v2 capability status and
// write-through-caches transfer/payout readiness. No account → not connected.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireActiveUser } from '../_shared/auth.ts';
import { getPayoutStatus, isDeadAccountError, type PayoutStatus } from '../_shared/connect.ts';
import { serveWithErrorReporting } from '../_shared/observability.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serveWithErrorReporting('connect-status', async (req: Request) => {
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

    const { data: prof } = await db
      .from('tutor_profiles')
      .select('stripe_connect_account_id, stripe_charges_enabled, stripe_payouts_enabled')
      .eq('user_id', user.id)
      .maybeSingle();

    const accountId = (prof?.stripe_connect_account_id as string | null | undefined) ?? null;
    if (!accountId) {
      return Response.json({ connected: false, chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false }, { headers: cors });
    }

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) {
      return Response.json({
        connected: true,
        chargesEnabled: !!prof?.stripe_charges_enabled,
        payoutsEnabled: !!prof?.stripe_payouts_enabled,
        detailsSubmitted: false,
        simulated: true,
      }, { headers: cors });
    }

    let status: PayoutStatus;
    try {
      status = await getPayoutStatus(stripeKey, accountId);
    } catch (err) {
      if (!isDeadAccountError(err)) throw err;
      console.warn(`connect-status: stored account ${accountId} is unusable`);
      status = {
        transfersActive: false,
        payoutsActive: false,
        detailsSubmitted: false,
        closed: true,
        source: 'v2' as const,
      };
    }

    const usable = !status.closed;

    await db
      .from('tutor_profiles')
      .update({
        // Cache transfersActive as the booking gate, plus payoutsActive and detailsSubmitted.
        stripe_charges_enabled: usable && status.transfersActive,
        stripe_payouts_enabled: usable && status.payoutsActive,
        stripe_onboarded_at: usable && status.detailsSubmitted ? new Date().toISOString() : null,
      })
      .eq('user_id', user.id);

    return Response.json({
      connected: true,
      chargesEnabled: usable && status.transfersActive,
      payoutsEnabled: usable && status.payoutsActive,
      detailsSubmitted: usable && status.detailsSubmitted,
    }, { headers: cors });
  } catch (err) {
    console.error('connect-status failed', String(err));
    return Response.json(
      { error: 'Could not check payout status. Please try again.' },
      { status: 400, headers: cors },
    );
  }
});
