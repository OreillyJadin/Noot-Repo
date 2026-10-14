// Edge Function: connect-onboarding-link.
// The caller (user.id) is a TUTOR. Creates (or reuses) their Stripe Connect Express
// account and returns a way to onboard it — a hosted link, or a session for the in-app
// form (see TWO WAYS TO ONBOARD) — so they can enter payout details. The account id is
// persisted on tutor_profiles.stripe_connect_account_id. When no Stripe key
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
//      racer detects it lost instead of overwriting the winner;
//   3. the persist result is actually checked. The original discarded the upsert error, so
//      a failed write looked like success and guaranteed a duplicate on the next tap.
//
// Accounts are created with Stripe Accounts v2; Account Sessions, account links, and
// deletion stay on the v1 SDK endpoints. A lost racer must not delete the winner when both
// requests receive the same idempotent account.
// A stored id unusable under the current Stripe keys (another account or sandbox→live, APP_REVIEW_TICKETS.md T10)
// or already closed is treated as no account and recreated.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireActiveUser } from '../_shared/auth.ts';
import {
  createRecipientAccount,
  getPayoutStatus,
  isDeadAccountError,
  StripeApiError,
  type V2Account,
} from '../_shared/connect.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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

    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const inactiveResponse = await requireActiveUser(db, user.id, cors);
    if (inactiveResponse) return inactiveResponse;

    // The body is optional: older builds send none.
    const body = await req.json().catch(() => ({}));
    const wantsSession = (body as { mode?: unknown } | null)?.mode === 'session';

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
    let deadId: string | null = null;

    // A stored id from another Stripe account (or a deleted one) can never be onboarded.
    // Clear it so the create path below can give them a fresh account.
    if (accountId) {
      try {
        const status = await getPayoutStatus(stripeKey, accountId);
        if (status.closed) {
          deadId = accountId;
          accountId = null;
        }
      } catch (err) {
        if (!isDeadAccountError(err)) throw err;
        console.warn(`connect-onboarding-link: stored account ${accountId} unusable, recreating`);
        deadId = accountId;
        accountId = null;
      }
      if (!accountId) {
        await db.from('tutor_profiles')
          .update({ stripe_connect_account_id: null, stripe_charges_enabled: false, stripe_payouts_enabled: false })
          .eq('user_id', user.id)
          .eq('stripe_connect_account_id', deadId);
      }
    }

    if (!accountId) {
      if (!user.email) {
        return Response.json(
          { error: 'Add an email to your account before setting up payouts.' },
          { status: 400, headers: cors },
        );
      }

      // Defence 1: the same user + key collapses concurrent v2 creates to one account.
      // A closed replay or idempotency_error gets one fresh-key retry; defences 2+3 cover that rare race.
      const idemKey = deadId
        ? `connect_acct_v2_${user.id}_after_${deadId}`
        : `connect_acct_v2_${user.id}`;
      let created: V2Account | null = null;
      let retriedWithFreshKey = false;
      try {
        created = await createRecipientAccount(stripeKey, { userId: user.id, email: user.email }, idemKey);
      } catch (err) {
        if (err instanceof StripeApiError && err.code === 'idempotency_error') {
          console.warn('connect-onboarding-link: idempotency parameters changed or account was deleted; retrying once');
          retriedWithFreshKey = true;
          created = await createRecipientAccount(stripeKey, {
            userId: user.id,
            email: user.email,
          }, `${idemKey}_${Date.now()}`);
        } else {
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
      }

      if (created?.closed) {
        if (retriedWithFreshKey) {
          console.error(`connect-onboarding-link: fresh-key retry returned closed account ${created.id}`);
          return Response.json(
            { error: 'Could not start payout setup. Please try again.' },
            { status: 500, headers: cors },
          );
        }
        console.warn(`connect-onboarding-link: idempotent account ${created.id} is closed, retrying`);
        created = await createRecipientAccount(stripeKey, {
          userId: user.id,
          email: user.email,
        }, `${idemKey}_${Date.now()}`);
        if (created.closed) {
          console.error(`connect-onboarding-link: retry returned closed account ${created.id}`);
          return Response.json(
            { error: 'Could not start payout setup. Please try again.' },
            { status: 500, headers: cors },
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
            // Same-key concurrent creates return the same id; never delete that winner.
            if (winner !== created.id) await stripe.accounts.del(created.id).catch(() => {});
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
