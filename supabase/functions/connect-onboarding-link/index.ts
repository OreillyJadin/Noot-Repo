// Edge Function: connect-onboarding-link.
// The caller (user.id) is a TUTOR. Creates (or reuses) their Stripe Connect Express
// account and returns a hosted onboarding link so they can enter payout details. The
// account id is persisted on tutor_profiles.stripe_connect_account_id. When no Stripe key
// is configured (dev), returns { url: null, simulated: true } so nothing crashes.
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
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401, headers: cors });

    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) return Response.json({ url: null, simulated: true }, { headers: cors });

    const { default: Stripe } = await import('https://esm.sh/stripe@16?target=deno');
    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });

    const { data: prof } = await db
      .from('tutor_profiles')
      .select('stripe_connect_account_id')
      .eq('user_id', user.id)
      .maybeSingle();

    let accountId = (prof?.stripe_connect_account_id as string | null | undefined) ?? null;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        email: user.email ?? undefined,
        business_type: 'individual',
        capabilities: { transfers: { requested: true } },
        metadata: { user_id: user.id },
      });
      accountId = account.id;
      await db
        .from('tutor_profiles')
        .upsert({ user_id: user.id, stripe_connect_account_id: accountId }, { onConflict: 'user_id' });
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: 'noot://connect-refresh',
      return_url: 'noot://connect-return',
      type: 'account_onboarding',
    });

    return Response.json({ url: link.url, accountId, simulated: false }, { headers: cors });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 400, headers: cors });
  }
});
