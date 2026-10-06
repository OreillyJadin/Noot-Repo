// Edge Function: connect-onboarding-link.
// The caller (user.id) is a TUTOR. Creates (or reuses) their Stripe Connect Express
// account and returns a hosted onboarding link so they can enter payout details. The
// account id is persisted on tutor_profiles.stripe_connect_account_id. When no Stripe key
// is configured (dev), returns { url: null, simulated: true } so nothing crashes.
//
// TWO WAYS TO ONBOARD (ERR-018). With no body, or any mode but 'session', it returns the
// hosted link above — what every build up to 9 asks for. With { mode: 'session' } it
// returns { clientSecret } for an Account Session instead, which lets the app show Stripe's
// onboarding form inside itself (the SDK's ConnectAccountOnboarding). Same account, same
// creation path and the same defences below; only the last step differs. The session is
// scoped to onboarding and nothing else, and to the caller's own account.
//
// DUPLICATE ACCOUNTS (fixed 2026-09-19). The original read the stored account id, saw
// null, and created a new account — a check-then-act race. Tapping the "Payout account"
// row while the function cold-starts fired several concurrent invocations, each of which
// read null before any of them wrote, so each created its own Stripe account and the last
// write won. In production this orphaned 5 accounts for one tutor inside 2 seconds and 2
// for another inside 1 second. Orphans matter: they clutter a real business account and
// each one is a payout destination that exists but is attached to nobody.
//
// Three defences, in order:
//   1. an idempotency key derived from the user id, so Stripe itself collapses concurrent
//      creates into a single account;
//   2. a CONDITIONAL persist (`... where stripe_connect_account_id is null`) so a losing
//      racer detects it lost instead of overwriting the winner, and deletes the account it
//      just made;
//   3. the persist result is actually checked. The original discarded the upsert error, so
//      a failed write looked like success and guaranteed a duplicate on the next tap.
//
// Also recovers from a stored id that is unusable under the current keys. Connect ids do
// not cross Stripe accounts, so every id from before the sandbox -> live cutover is dead
// (APP_REVIEW_TICKETS.md T10); rather than failing forever, treat it as "no account".
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Stripe error codes meaning "that account id is not usable under these keys". */
const DEAD_ACCOUNT_CODES = new Set(['resource_missing', 'account_invalid', 'permission_error']);

const errCode = (err: unknown) =>
  (err as { code?: string; rawType?: string })?.code ??
  (err as { type?: string })?.type ??
  '';

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

    // The body is optional: older builds send none.
    const body = await req.json().catch(() => ({}));
    const wantsSession = (body as { mode?: unknown } | null)?.mode === 'session';

    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) {
      return Response.json({ url: null, clientSecret: null, simulated: true }, { headers: cors });
    }

    const { default: Stripe } = await import('https://esm.sh/stripe@16?target=deno');
    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });

    const readStored = async () => {
      const { data, error } = await db
        .from('tutor_profiles')
        .select('stripe_connect_account_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) {
        console.error('connect-onboarding-link: profile read failed', JSON.stringify(error));
        throw new Error('profile read failed');
      }
      return (data?.stripe_connect_account_id as string | null | undefined) ?? null;
    };

    let accountId = await readStored();

    // A stored id from another Stripe account (or a deleted one) can never be onboarded.
    // Clear it so the create path below can give them a fresh account.
    if (accountId) {
      try {
        const existing = await stripe.accounts.retrieve(accountId);
        if ((existing as { deleted?: boolean }).deleted) accountId = null;
      } catch (err) {
        if (!DEAD_ACCOUNT_CODES.has(errCode(err))) throw err;
        console.warn(`connect-onboarding-link: stored account ${accountId} unusable, recreating`);
        accountId = null;
      }
      if (!accountId) {
        await db.from('tutor_profiles')
          .update({ stripe_connect_account_id: null, stripe_charges_enabled: false, stripe_payouts_enabled: false })
          .eq('user_id', user.id);
      }
    }

    if (!accountId) {
      // Defence 1: same user + same key => Stripe returns the SAME account rather than a
      // new one. Keys are retained ~24h, which covers the burst of concurrent taps that
      // caused the orphans. `idempotency_key_in_use` means a sibling request is mid-flight
      // with this exact key, so the winner is about to persist — fall through and re-read.
      let created: { id: string } | null = null;
      try {
        created = await stripe.accounts.create(
          {
            type: 'express',
            country: 'US',
            email: user.email ?? undefined,
            business_type: 'individual',
            capabilities: { transfers: { requested: true } },
            metadata: { user_id: user.id },
          },
          { idempotencyKey: `connect_acct_${user.id}` },
        );
      } catch (err) {
        if (errCode(err) !== 'idempotency_key_in_use') throw err;
        await new Promise((r) => setTimeout(r, 1500));
        accountId = await readStored();
        if (!accountId) {
          return Response.json(
            { error: 'Payout setup is already starting. Please try again in a moment.' },
            { status: 409, headers: cors },
          );
        }
      }

      if (created) {
        // Defence 2 + 3: only claim the row if it is still empty, and check the result.
        // `.select()` returns the rows actually updated, so an empty array means a
        // concurrent call already claimed it.
        const { data: claimed, error: claimErr } = await db
          .from('tutor_profiles')
          .update({ stripe_connect_account_id: created.id })
          .eq('user_id', user.id)
          .is('stripe_connect_account_id', null)
          .select('user_id');

        if (claimErr) {
          console.error('connect-onboarding-link: persist failed', JSON.stringify(claimErr));
          // Don't leave an account nobody can reach. Best-effort cleanup, then fail loudly
          // rather than returning a link to an account we never recorded.
          await stripe.accounts.del(created.id).catch(() => {});
          return Response.json(
            { error: 'Could not save your payout account. Please try again.' },
            { status: 500, headers: cors },
          );
        }

        if ((claimed ?? []).length > 0) {
          accountId = created.id;
        } else {
          // We lost the race (or there is no tutor_profiles row yet).
          const winner = await readStored();
          if (winner) {
            await stripe.accounts.del(created.id).catch(() => {});
            accountId = winner;
          } else {
            // No row to update — this tutor has no profile yet. Insert one.
            const { error: insErr } = await db
              .from('tutor_profiles')
              .upsert({ user_id: user.id, stripe_connect_account_id: created.id }, { onConflict: 'user_id' });
            if (insErr) {
              console.error('connect-onboarding-link: profile insert failed', JSON.stringify(insErr));
              await stripe.accounts.del(created.id).catch(() => {});
              return Response.json(
                { error: 'Could not save your payout account. Please try again.' },
                { status: 500, headers: cors },
              );
            }
            accountId = created.id;
          }
        }
      }
    }

    if (wantsSession) {
      // Onboarding only — no payouts, payments or account-management component is enabled,
      // so the secret cannot be used to move money or read balances. It is short-lived and
      // tied to this one account, which the lines above resolved from the caller's own row.
      const session = await stripe.accountSessions.create({
        account: accountId!,
        components: { account_onboarding: { enabled: true } },
      });
      return Response.json(
        { clientSecret: session.client_secret, accountId, simulated: false },
        { headers: cors },
      );
    }

    // Stripe's live mode only accepts https here (the sandbox also took the app's noot://
    // scheme, which is why this broke at the live cutover — ERR-002). So Stripe returns to
    // the connect-return function, which redirects into the app. CONNECT_RETURN_BASE_URL
    // overrides the base where SUPABASE_URL isn't the public address (the local stack).
    const returnBase = `${(Deno.env.get('CONNECT_RETURN_BASE_URL') ?? url).replace(/\/+$/, '')}/functions/v1/connect-return`;
    const link = await stripe.accountLinks.create({
      account: accountId!,
      refresh_url: `${returnBase}?to=refresh`,
      return_url: `${returnBase}?to=return`,
      type: 'account_onboarding',
    });

    return Response.json({ url: link.url, accountId, simulated: false }, { headers: cors });
  } catch (err) {
    // Stripe's own error strings can embed a partially-redacted API key, so never return
    // one verbatim. Log the detail; give the caller something safe.
    console.error('connect-onboarding-link failed', String(err));
    return Response.json(
      { error: 'Could not start payout setup. Please try again.' },
      { status: 400, headers: cors },
    );
  }
});
