// Edge Function: connect-status.
// Returns the caller's (TUTOR's) Stripe Connect readiness so the payout-setup UI can show
// "connected / payouts enabled / setup incomplete". Retrieves the account from Stripe and
// write-through-caches charges/payouts flags on tutor_profiles. No account → not connected.
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

    const { default: Stripe } = await import('https://esm.sh/stripe@16?target=deno');
    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
    const acct = await stripe.accounts.retrieve(accountId);

    await db
      .from('tutor_profiles')
      .update({
        stripe_charges_enabled: acct.charges_enabled,
        stripe_payouts_enabled: acct.payouts_enabled,
        stripe_onboarded_at: acct.details_submitted ? new Date().toISOString() : null,
      })
      .eq('user_id', user.id);

    return Response.json({
      connected: true,
      chargesEnabled: acct.charges_enabled,
      payoutsEnabled: acct.payouts_enabled,
      detailsSubmitted: acct.details_submitted,
    }, { headers: cors });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 400, headers: cors });
  }
});
