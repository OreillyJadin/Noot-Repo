// Requires local stack + functions serve with STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
const key = process.env.STRIPE_SECRET_KEY ?? '';
assert(key.startsWith('sk_test_'), 'test Stripe key required');
const secret = process.env.STRIPE_WEBHOOK_SECRET!;
assert(secret, 'local webhook signing secret required');
const url = 'http://127.0.0.1:54321';
const service = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const db = createClient(url, service);
async function stripe(path: string, body?: Record<string, string>) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${key}`,
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    ...(body ? { body: new URLSearchParams(body) } : {}),
  });
  const result = await response.json();
  assert(response.ok, result.error?.message);
  return result;
}
async function deliver(type: string, object: unknown) {
  const body = JSON.stringify({ id: `evt_verify_${randomUUID()}`, object: 'event', type, data: { object } });
  const t = Math.floor(Date.now() / 1000);
  const digest = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  const response = await fetch(`${url}/functions/v1/payments-webhook`, {
    method: 'POST', headers: { Authorization: `Bearer ${service}`, 'stripe-signature': `t=${t},v1=${digest}`, 'Content-Type': 'application/json' }, body,
  });
  assert.equal(response.status, 200, await response.text());
}
const bookingId = randomUUID();
let chargeId: string | undefined;
let refundFailed = false;
try {
  const { data: users, error } = await db.from('users').select('id,email').in('email', ['student@crimson.ua.edu', 'sara@crimson.ua.edu']);
  assert.ifError(error);
  const pi = await stripe('payment_intents', { amount: '2000', currency: 'usd', payment_method: 'pm_card_refundFail',
    confirm: 'true', 'automatic_payment_methods[enabled]': 'true', 'automatic_payment_methods[allow_redirects]': 'never' });
  chargeId = pi.latest_charge;
  const { error: insertError } = await db.from('bookings').insert({ id: bookingId,
    student_id: users!.find(u => u.email === 'student@crimson.ua.edu')!.id,
    tutor_id: users!.find(u => u.email === 'sara@crimson.ua.edu')!.id,
    subject: 'MGT 300', scheduled_at: new Date(Date.now() - 3600000).toISOString(), duration_minutes: 60,
    price: 20, platform_fee: 2, tutor_payout_amount: 18, session_type: 'in_person', status: 'completed',
    cancellation_deadline: new Date(Date.now() - 86400000).toISOString(),
    stripe_charge_id: chargeId, stripe_payment_intent_id: pi.id,
    refund_percent: 50, refunded_cents: 1000, refund_status: 'refunded' });
  assert.ifError(insertError);
  const refund = await stripe('refunds', { charge: chargeId!, amount: '1000' });
  let current = refund;
  const deadline = Date.now() + 360000;
  while (current.status !== 'failed' && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    current = await stripe(`refunds/${refund.id}`);
  }
  assert.equal(current.status, 'failed', 'Stripe asynchronous refund must actually fail');
  refundFailed = true;
  const accounts = await stripe('accounts?limit=100');
  const destination = accounts.data.find((a: any) => a.capabilities?.transfers === 'active')?.id;
  assert(destination, 'active test recipient required');
  const transfer = await stripe('transfers', { amount: '1800', currency: 'usd', destination,
    source_transaction: chargeId!, transfer_group: bookingId });
  await stripe(`transfers/${transfer.id}/reversals`, { amount: '900', 'metadata[refund_id]': refund.id });
  const { error: transferError } = await db.from('bookings').update({ stripe_transfer_id: transfer.id }).eq('id', bookingId);
  assert.ifError(transferError);
  for (const type of ['refund.failed', 'refund.updated', 'charge.refund.updated', 'charge.refunded', 'refund.failed']) {
    await deliver(type, type === 'charge.refunded' ? { id: chargeId, amount_refunded: 1000 } : refund);
    const { data: row } = await db.from('bookings').select('refund_percent,refunded_cents,refund_status').eq('id', bookingId).single();
    assert.deepEqual(row, { refund_percent: 0, refunded_cents: 0, refund_status: 'not_refunded' });
  }
  const { data: rows } = await db.from('tutor_transfer_reversals').select('*').eq('booking_id', bookingId);
  assert.equal(rows!.length, 1);
  assert.equal(rows![0].amount_cents, 900);
  assert.match(rows![0].last_error, /restoration_required/);
  assert.equal(rows![0].status, 'restoration_required');
  await stripe(`transfers/${transfer.id}/reversals`, { amount: '900' });
  console.log('PASS real asynchronous failed refund; 5 duplicate/out-of-order event types; exact rollback; one restoration follow-up');
} finally {
  await db.from('bookings').delete().eq('id', bookingId);
  if (chargeId && !refundFailed) {
    const charge = await stripe(`charges/${chargeId}`);
    if (charge.amount_refunded < charge.amount_captured) await stripe('refunds', { charge: chargeId, amount: String(charge.amount_captured - charge.amount_refunded) });
  }
}
