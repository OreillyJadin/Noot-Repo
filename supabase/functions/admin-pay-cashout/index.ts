// Edge Function: admin-pay-cashout.
// ⚠️ SECURITY: admin-only. Pays ONE pending ambassador cash-out (credit_cashouts, 0040/0088)
// with a Stripe transfer from the platform balance to the ambassador's Connect account, then
// marks the row paid with the transfer id. Nothing here can pay twice:
//   • Claim first: a single conditional UPDATE sets paying_at on the row only while it is
//     pending and unclaimed (or the claim is >10 min stale). A second tap, a retry or
//     another admin gets no row back and a 409 — no Stripe call at all.
//   • One idempotency key per cash-out: `cashout_transfer_<id>_<pay_attempts>`. If the
//     transfer succeeds but the DB write after it fails, the claim stays put and the next
//     attempt replays the SAME key, so Stripe hands back the same transfer instead of a new
//     one. pay_attempts only moves when Stripe definitively refused (4xx — e.g. the platform
//     balance was short), which created nothing; Stripe otherwise replays that refusal under
//     the old key for 24h. An ambiguous failure (network, 5xx, or Stripe answered but our
//     DB write failed) is recorded as pay_unknown_at: the row stays pending and Reject refuses
//     it (admin_reject_cashout). The next Pay first lists transfers in the cash-out's
//     transfer_group (works even if the payout account has since died): found → paid; none
//     after 15 min → that key is retired and a fresh attempt proceeds; sooner → same key again.
//   • Marked paid only after Stripe returned the transfer; on failure the row stays pending
//     with last_error set so the admin sees why.
// The credit itself was already taken off the ambassador's balance when they requested
// the cash-out (request_credit_cashout), so paying touches no ledger rows.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireActiveUser, requireAdmin } from '../_shared/auth.ts';
import { logAdminAction } from '../_shared/audit.ts';
import { getPayoutStatus, isDeadAccountError, resolvePayoutProfile } from '../_shared/connect.ts';
import { serveWithErrorReporting } from '../_shared/observability.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLAIM_STALE_MS = 10 * 60 * 1000;
// How long after an unanswered Stripe attempt an empty transfer listing counts as proof that
// nothing was created (Stripe finishes a request in seconds; this is generous).
const UNKNOWN_SETTLE_MS = 15 * 60 * 1000;

type StripeErr = { type?: string; code?: string; message?: string; statusCode?: number };

/** Stripe said no and created nothing (4xx) — safe to use a fresh idempotency key next time. */
function stripeRefused(err: unknown): boolean {
  const e = err as StripeErr;
  const sc = e?.statusCode ?? 0;
  return sc >= 400 && sc < 500 && sc !== 409;
}

function stripeMessage(err: unknown): string {
  const e = err as StripeErr;
  if (e?.code === 'balance_insufficient') return 'noot’s Stripe balance is too low to cover this transfer. Top it up and try again.';
  const text = typeof e?.message === 'string' && e.message ? e.message : 'Stripe did not accept the transfer.';
  return text.replace(/\s+/g, ' ').slice(0, 240);
}

serveWithErrorReporting('admin-pay-cashout', async (req: Request) => {
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

    const body = await req.json().catch(() => null) as { cashoutId?: unknown } | null;
    const cashoutId = typeof body?.cashoutId === 'string' ? body.cashoutId : '';
    if (!UUID.test(cashoutId)) {
      return Response.json({ error: 'cashoutId is required' }, { status: 400, headers: cors });
    }

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) {
      return Response.json({ error: 'Stripe is not configured on this server.' }, { status: 503, headers: cors });
    }

    // 1. Claim the row. Only a pending, unclaimed (or stale-claimed) cash-out comes back.
    const staleBefore = new Date(Date.now() - CLAIM_STALE_MS).toISOString();
    const { data: claimed, error: claimErr } = await db
      .from('credit_cashouts')
      .update({ paying_at: new Date().toISOString() })
      .eq('id', cashoutId)
      .eq('status', 'pending')
      .or(`paying_at.is.null,paying_at.lt.${staleBefore}`)
      .select('id, user_id, amount_cents, pay_attempts, pay_unknown_at');
    if (claimErr) throw new Error(`claim failed: ${JSON.stringify(claimErr)}`);
    const cashout = (claimed ?? [])[0] as
      | { id: string; user_id: string | null; amount_cents: number; pay_attempts: number; pay_unknown_at: string | null }
      | undefined;

    if (!cashout) {
      const { data: existing } = await db
        .from('credit_cashouts')
        .select('status')
        .eq('id', cashoutId)
        .maybeSingle();
      if (!existing) return Response.json({ error: 'Cash-out not found.' }, { status: 404, headers: cors });
      const why = existing.status === 'paid'
        ? 'This cash-out has already been paid.'
        : existing.status === 'rejected'
          ? 'This cash-out was rejected; the credit went back to the ambassador.'
          : 'Someone is paying this cash-out right now. Give it a moment, then refresh.';
      return Response.json({ error: why, status: existing.status }, { status: 409, headers: cors });
    }

    // Release the claim, leave the row pending, and tell the admin plainly why.
    const fail = async (message: string, httpStatus: number, bumpAttempt = false) => {
      const patch: Record<string, unknown> = { paying_at: null, last_error: message.slice(0, 300) };
      // A definitive refusal under this key means no transfer exists for it: the outcome is known.
      if (bumpAttempt) Object.assign(patch, { pay_attempts: cashout.pay_attempts + 1, pay_unknown_at: null });
      await db.from('credit_cashouts').update(patch).eq('id', cashoutId).eq('status', 'pending');
      return Response.json({ error: message }, { status: httpStatus, headers: cors });
    };

    // Stripe may have moved the money; keep the row pending and unrejectable until we know.
    // The original unknown timestamp is kept so the settle window below can elapse.
    const unresolved = async (message: string, httpStatus: number) => {
      await db.from('credit_cashouts')
        .update({ paying_at: null, pay_unknown_at: cashout.pay_unknown_at ?? new Date().toISOString(), last_error: message })
        .eq('id', cashoutId).eq('status', 'pending');
      return Response.json({ error: message, unresolved: true }, { status: httpStatus, headers: cors });
    };

    const { default: Stripe } = await import('https://esm.sh/stripe@16?target=deno');
    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
    const group = `cashout_${cashoutId}`;
    const findExisting = async () => (await stripe.transfers.list({ transfer_group: group, limit: 1 })).data[0]?.id ?? null;
    let transferId: string | null = null;

    // 2. An earlier attempt Stripe never answered? Ask Stripe what happened before anything
    //    else — this has to work even if the payout account has since died, and it's how a
    //    cached 5xx (transfer created, error stored under the key) gets recorded as paid.
    if (cashout.pay_unknown_at) {
      try {
        transferId = await findExisting();
      } catch (err) {
        console.error('admin-pay-cashout: reconcile failed', cashoutId, String(err));
        return unresolved('Stripe didn’t answer. Try again in a few minutes — it won’t be sent twice.', 502);
      }
      if (!transferId && Date.now() - Date.parse(cashout.pay_unknown_at) >= UNKNOWN_SETTLE_MS) {
        // Long enough: nothing was created under that key. Retire it so a cached error
        // can't be replayed forever, and carry on as a fresh attempt (which may still fail
        // cleanly and release the row to Reject).
        cashout.pay_attempts += 1;
        cashout.pay_unknown_at = null;
        const { error } = await db.from('credit_cashouts')
          .update({ pay_unknown_at: null, pay_attempts: cashout.pay_attempts })
          .eq('id', cashoutId).eq('status', 'pending');
        if (error) throw new Error(`settle failed: ${JSON.stringify(error)}`);
      }
      // Otherwise (too soon to be sure) fall through and replay the same key.
    }

    if (!transferId) {
      if (!cashout.user_id) {
        return fail('This ambassador’s account was deleted. Reject the cash-out instead.', 409);
      }

      // 3. Where the money goes: the tutor's Connect account, or the ambassador-only one.
      const profile = await resolvePayoutProfile(db, cashout.user_id);
      if (!profile.accountId) {
        return fail('The ambassador hasn’t set up a payout account yet.', 409);
      }
      let ready = false;
      try {
        const status = await getPayoutStatus(stripeKey, profile.accountId);
        ready = !status.closed && status.transfersActive;
      } catch (err) {
        if (!isDeadAccountError(err)) throw err;
      }
      if (!ready) {
        return fail('The ambassador’s payout account isn’t ready to receive transfers yet. Ask them to finish payout setup.', 409);
      }

      // 4. The transfer. Same key for the same attempt, so a replay returns the same transfer.
      try {
        const transfer = await stripe.transfers.create(
          {
            amount: cashout.amount_cents,
            currency: 'usd',
            destination: profile.accountId,
            transfer_group: group,
            description: 'noot ambassador credit cash-out',
            metadata: { cashout_id: cashoutId, user_id: cashout.user_id },
          },
          { idempotencyKey: `cashout_transfer_${cashoutId}_${cashout.pay_attempts}` },
        );
        transferId = transfer.id;
      } catch (err) {
        console.error('admin-pay-cashout: transfer failed', cashoutId, String(err));
        if (stripeRefused(err)) return fail(stripeMessage(err), 502, true);
        // Ambiguous (network / 5xx): Stripe may or may not have created the transfer. A quick
        // look recovers the common case; an empty listing this soon proves nothing, so the
        // row is then marked unknown (Reject refuses it) until a later Pay settles it.
        try {
          transferId = await findExisting();
        } catch (listErr) {
          console.error('admin-pay-cashout: reconcile failed', cashoutId, String(listErr));
        }
        if (!transferId) return unresolved('Stripe didn’t answer. Tap Pay again in a few minutes — it won’t be sent twice.', 502);
      }
    }

    // 5. Record it. Only now does the row say paid.
    const { data: paidRows, error: paidErr } = await db
      .from('credit_cashouts')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        paid_by: user.id,
        stripe_transfer_id: transferId,
        paying_at: null,
        pay_unknown_at: null,
        last_error: null,
      })
      .eq('id', cashoutId)
      .eq('status', 'pending')
      .select('id');
    if (paidErr || (paidRows ?? []).length === 0) {
      // The money moved but we could not write it down. Record the unknown (Reject stays
      // blocked) and let a retry replay the same idempotency key and record it.
      console.error('admin-pay-cashout: transfer sent but not recorded', cashoutId, transferId, JSON.stringify(paidErr));
      return unresolved('The transfer was sent but could not be recorded. Tap Pay again — it won’t be sent twice.', 500);
    }

    await logAdminAction(db, {
      actorId: user.id,
      action: 'cashout.pay',
      targetType: 'credit_cashout',
      targetId: cashoutId,
      details: { user_id: cashout.user_id, amount_cents: cashout.amount_cents, transfer_id: transferId },
    });

    const dollars = (cashout.amount_cents / 100).toFixed(2);
    await db.rpc('create_notification', {
      p_user: cashout.user_id,
      p_type: 'system',
      p_title: 'Your cash-out is on its way',
      p_body: `$${dollars} is heading to your payout account.`,
      p_data: { screen: 'invite', cashoutId },
    }).then(({ error }) => { if (error) console.error('admin-pay-cashout: notification failed', JSON.stringify(error)); });

    return Response.json({ ok: true, transferId }, { headers: cors });
  } catch (err) {
    console.error('admin-pay-cashout failed', String(err));
    return Response.json({ error: 'Could not pay this cash-out. Please try again.' }, { status: 400, headers: cors });
  }
});
