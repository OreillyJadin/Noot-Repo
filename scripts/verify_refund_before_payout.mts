// Runs without credentials by default; STRIPE_SECRET_KEY adds real Stripe test-mode coverage.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { payTutor, refundAdjustedPayout } from '../supabase/functions/_shared/payouts.ts';
import { reversalShares } from '../supabase/functions/_shared/reversals.ts';
for (const [total, captured, refunded, requested, original, expected] of [
  [2000, 2000, 1000, 1800, 1800, 900],
  [2000, 2000, 2000, 1800, 1800, 0],
  [2000, 1000, 0, 900, 1800, 900],
  [2000, 1000, 500, 900, 1800, 450],
  [100, 100, 0, 1800, 1800, 1800],
  [100, 100, 50, 1800, 1800, 900],
]) assert.equal(refundAdjustedPayout(requested!, original!, { amount: total!, amount_captured: captured!, amount_refunded: refunded! }, refunded!), expected);
assert.deepEqual(reversalShares([
  { id: 'before', amount: 1000, created: 1, status: 'succeeded' },
  { id: 'after', amount: 500, created: 2, status: 'succeeded' },
], 2000, 900, 1000), [{ refundId: 'after', cents: 450 }]);
for (const file of ['_shared/completeBooking.ts', 'cancel-booking/index.ts', 'report-no-show/index.ts']) {
  const source = readFileSync(new URL(`../supabase/functions/${file}`, import.meta.url), 'utf8');
  assert.match(source, /payTutor\(\{/);
  assert.match(source, /originalPayoutCents: Math.round\(Number\(booking.tutor_payout_amount\) \* 100\)/);
}
for (const name of ['complete-session', 'auto-complete-sessions']) {
  assert.match(readFileSync(new URL(`../supabase/functions/${name}/index.ts`, import.meta.url), 'utf8'), /completeBooking/);
}
console.log('PASS payout caps, credit-funded remainder, partial capture, reversal baseline, and all payout call paths');
const key = process.env.STRIPE_SECRET_KEY;
if (key) {
  assert(key.startsWith('sk_test_'));
  async function request(path: string, body?: Record<string, string>, idempotencyKey?: string) {
    const response = await fetch(`https://api.stripe.com/v1/${path}`, {
      method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${key}`,
        ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
      ...(body ? { body: new URLSearchParams(body) } : {}),
    });
    const result = await response.json();
    assert(response.ok, result.error?.message);
    return result;
  }
  const accounts = await request('accounts?limit=100');
  const destination = accounts.data.find((a: any) => a.capabilities?.transfers === 'active')?.id;
  assert(destination, 'active test Connect recipient required');
  const pi = await request('payment_intents', { amount: '2000', currency: 'usd', payment_method: 'pm_card_visa',
    confirm: 'true', 'automatic_payment_methods[enabled]': 'true', 'automatic_payment_methods[allow_redirects]': 'never' });
  const chargeId = pi.latest_charge;
  const group = randomUUID();
  let transferId: string | null = null;
  try {
    await request('refunds', { charge: chargeId, amount: '1000' });
    const stripe = {
      disputes: { async *list() { yield* (await request(`disputes?charge=${chargeId}`)).data; } },
      charges: { retrieve: (id: string) => request(`charges/${id}`) },
      refunds: { async *list() { yield* (await request(`refunds?charge=${chargeId}&expand[]=data.balance_transaction`)).data; } },
      transfers: {
        async *list() { yield* (await request(`transfers?transfer_group=${group}`)).data; },
        create: (params: any, options: any) => {
          const body: Record<string, string> = {};
          for (const [k, v] of Object.entries(params)) {
            if (k === 'metadata') for (const [mk, mv] of Object.entries(v as Record<string, string>)) body[`metadata[${mk}]`] = mv;
            else body[k] = String(v);
          }
          return request('transfers', body, options.idempotencyKey);
        },
      },
    } as unknown as Parameters<typeof payTutor>[0]['stripe'];
    const args = { stripe, bookingId: group, destination, payoutCents: 1800, originalPayoutCents: 1800,
      charge: { id: chargeId, amount: 2000, amount_captured: 2000, amount_refunded: 0 },
      metadata: { booking_id: group }, idempotencyKey: `verify_${group}` };
    const first = await payTutor(args);
    transferId = first.transferId;
    assert(first.complete, String(first.error));
    assert.deepEqual(await payTutor(args), first);
    const transfers = (await request(`transfers?transfer_group=${group}`)).data;
    assert.equal(transfers.length, 1);
    assert.equal(transfers[0].amount, 900);
    assert.equal(transfers[0].source_transaction, chargeId);
    assert.equal(transfers[0].metadata.refund_baseline_cents, '1000');
    console.log('PASS real Stripe refund before transfer: stale charge refreshed, 900 cents paid once, no platform top-up');
  } finally {
    if (transferId) await request(`transfers/${transferId}/reversals`, { amount: '900' });
    const charge = await request(`charges/${chargeId}`);
    if (charge.amount_refunded < 2000) await request('refunds', { charge: chargeId, amount: String(2000 - charge.amount_refunded) });
  }
}
