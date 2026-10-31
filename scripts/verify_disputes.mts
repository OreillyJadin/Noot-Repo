// Local seeded Supabase required; STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET add real dispute lifecycle tests.
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { DEV_PASSWORD } from './_devPassword.mjs';
import { payTutor } from '../supabase/functions/_shared/payouts.ts';
const url = 'http://127.0.0.1:54321';
const service = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const publishedAnon = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const db = createClient(url, service, { auth: { persistSession: false } });
const key = process.env.STRIPE_SECRET_KEY;
const secret = process.env.STRIPE_WEBHOOK_SECRET;
async function request(path: string, body?: Record<string, string>, idempotencyKey?: string): Promise<any> {
  assert(key?.startsWith('sk_test_'), 'test mode only');
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
async function deliver(type: string, dispute: any) {
  assert(secret, 'local webhook signing secret required');
  const body = JSON.stringify({ id: `evt_verify_${randomUUID()}`, object: 'event', type, data: { object: dispute } });
  const t = Math.floor(Date.now() / 1000);
  const digest = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  const response = await fetch(`${url}/functions/v1/payments-webhook`, { method: 'POST', headers: {
    Authorization: `Bearer ${service}`, 'Content-Type': 'application/json', 'stripe-signature': `t=${t},v1=${digest}` }, body });
  assert.equal(response.status, 200, await response.text());
}
const { data: users, error: userError } = await db.from('users').select('id,email')
  .in('email', ['student@crimson.ua.edu', 'sara@crimson.ua.edu']);
assert.ifError(userError);
const bookings: string[] = [];
async function booking(pi: string | null = null, charge: string | null = null) {
  const id = randomUUID();
  const { error } = await db.from('bookings').insert({ id,
    student_id: users!.find(u => u.email === 'student@crimson.ua.edu')!.id,
    tutor_id: users!.find(u => u.email === 'sara@crimson.ua.edu')!.id, subject: 'MGT 300',
    scheduled_at: new Date().toISOString(), duration_minutes: 60, cancellation_deadline: new Date().toISOString(),
    price: 20, platform_fee: 2, tutor_payout_amount: 18, session_type: 'in_person', status: 'completed',
    stripe_payment_intent_id: pi, stripe_charge_id: charge });
  assert.ifError(error);
  bookings.push(id);
  return id;
}
try {
  const id = await booking();
  const sample = { stripe_dispute_id: `dp_verify_${randomUUID()}`, booking_id: id,
    stripe_charge_id: 'ch_verify', status: 'needs_response', amount_cents: 2000, payout_hold: true, admin_followup: 'verify' };
  assert.ifError((await db.from('booking_payment_disputes').insert(sample)).error);
  const student = createClient(url, publishedAnon, { auth: { persistSession: false } });
  assert.ifError((await student.auth.signInWithPassword({ email: 'student@crimson.ua.edu', password: DEV_PASSWORD })).error);
  const read = await student.from('booking_payment_disputes').select('*');
  assert.ifError(read.error);
  assert.deepEqual(read.data, []);
  assert((await student.from('booking_payment_disputes').insert({ ...sample, stripe_dispute_id: 'dp_student' })).error);
  assert((await student.from('booking_payment_disputes').update({ payout_hold: false }).eq('stripe_dispute_id', sample.stripe_dispute_id)).error);
  console.log('PASS dispute queue: student cannot read/write/unhold payouts');
  if (key) {
    const accounts = await request('accounts?limit=100');
    const destination = accounts.data.find((a: any) => a.capabilities?.transfers === 'active')?.id;
    assert(destination);
    for (const outcome of ['lost', 'won']) {
      const pi = await request('payment_intents', { amount: '2000', currency: 'usd', payment_method: 'pm_card_createDispute',
        confirm: 'true', 'automatic_payment_methods[enabled]': 'true', 'automatic_payment_methods[allow_redirects]': 'never' });
      const id = await booking(pi.id, pi.latest_charge);
      let dispute: any;
      const deadline = Date.now() + 180000;
      while (Date.now() < deadline) {
        dispute = (await request(`disputes?charge=${pi.latest_charge}`)).data[0];
        if (dispute) break;
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      assert(dispute, 'Stripe must create a real test dispute');
      const stripe = {
        disputes: { async *list() { yield* (await request(`disputes?charge=${pi.latest_charge}`)).data; } },
        transfers: { create: async (params: any, options: any) => {
          const body: Record<string, string> = {};
          for (const [k, v] of Object.entries(params)) {
            if (k === 'metadata') for (const [mk, mv] of Object.entries(v as Record<string, string>)) body[`metadata[${mk}]`] = mv;
            else body[k] = String(v);
          }
          return request('transfers', body, options.idempotencyKey);
        } },
      } as unknown as Parameters<typeof payTutor>[0]['stripe'];
      const args = { stripe, bookingId: id, destination, payoutCents: 1800,
        charge: { id: pi.latest_charge, amount: 2000, amount_captured: 2000, amount_refunded: 0 },
        idempotencyKey: `verify_${id}`, metadata: { booking_id: id } };
      assert.equal((await payTutor(args)).complete, false, 'hold must work even before created webhook');
      await deliver('charge.dispute.created', dispute);
      const held = await db.from('booking_payment_disputes').select('*').eq('booking_id', id).single();
      assert.ifError(held.error);
      assert.equal(held.data.payout_hold, true);
      let transferId: string | undefined;
      if (outcome === 'lost') {
        const transfer = await request('transfers', { amount: '1800', currency: 'usd', destination,
          source_transaction: pi.latest_charge, transfer_group: id });
        transferId = transfer.id;
        assert.ifError((await db.from('bookings').update({ stripe_transfer_id: transferId }).eq('id', id)).error);
        await request(`transfers/${transferId}/reversals`, { amount: '400' });
      }
      await request(`disputes/${dispute.id}`, { 'evidence[uncategorized_text]': outcome === 'won' ? 'winning_evidence' : 'losing_evidence', submit: 'true' });
      let closed = await request(`disputes/${dispute.id}`);
      const closeDeadline = Date.now() + 180000;
      while (closed.status !== outcome && Date.now() < closeDeadline) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        closed = await request(`disputes/${dispute.id}`);
      }
      assert.equal(closed.status, outcome);
      for (const type of ['charge.dispute.closed', 'charge.dispute.closed', 'charge.dispute.created']) await deliver(type, dispute);
      const state = await db.from('booking_payment_disputes').select('*').eq('booking_id', id).single();
      assert.ifError(state.error);
      assert.equal(state.data.status, outcome);
      assert.equal(state.data.payout_hold, outcome === 'lost');
      if (outcome === 'lost') {
        const transfer = await request(`transfers/${transferId}`);
        assert.equal(transfer.amount_reversed, 1800, 'manual + lost-dispute reversals cannot exceed transfer');
        const rows = await db.from('tutor_transfer_reversals').select('*').eq('booking_id', id);
        assert.equal(rows.data!.length, 1);
        assert.equal(rows.data![0].amount_cents, 1400);
        assert.equal(rows.data![0].status, 'reversed');
        assert.equal((await payTutor(args)).complete, false);
      } else {
        const payout = await payTutor(args);
        assert(payout.complete, String(payout.error));
        await request(`transfers/${payout.transferId}/reversals`, { amount: '1800' });
        await request('refunds', { charge: pi.latest_charge });
      }
      console.log(`PASS real Stripe ${outcome}: hold, canonical close, duplicate/out-of-order delivery, ${outcome === 'lost' ? 'capped clawback' : 'released payout'}`);
    }
  }
} finally {
  for (const id of bookings) assert.ifError((await db.from('bookings').delete().eq('id', id)).error);
}
