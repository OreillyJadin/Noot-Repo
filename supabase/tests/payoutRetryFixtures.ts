import assert from 'node:assert/strict';
import type { completeBooking } from '../functions/_shared/completeBooking.ts';

type Params = Record<string, any>;

export function payoutStripe(cardCents = 2000, captured = false) {
  const charge = { id: 'ch_test_session', amount: cardCents, amount_captured: captured ? cardCents : 0, amount_refunded: 0 };
  const transfers: Params[] = [];
  const keys = new Map<string, Params>();
  const attempts: { key: string; params: Params }[] = [];
  const control = { failFunding: '', loseResponse: false, captureCalls: 0, dispute: false };
  const stripe = {
    paymentIntents: {
      retrieve: async () => ({ status: charge.amount_captured ? 'succeeded' : 'requires_capture', latest_charge: charge }),
      capture: async (_id: string, _params: unknown, options: { idempotencyKey: string }) => {
        assert(options.idempotencyKey.startsWith('capture_'));
        control.captureCalls++;
        charge.amount_captured = cardCents;
        return { status: 'succeeded', latest_charge: charge };
      },
    },
    charges: { retrieve: async () => charge },
    disputes: { async *list() { if (control.dispute) yield { id: 'dp_test', status: 'needs_response' }; } },
    refunds: { async *list() {} },
    transfers: {
      async *list() { yield* [...transfers]; },
      create: async (params: Params, options: { idempotencyKey: string }) => {
        attempts.push({ key: options.idempotencyKey, params });
        if (keys.has(options.idempotencyKey)) return keys.get(options.idempotencyKey)!;
        if (control.failFunding === params.metadata.funding) throw new Error('Stubbed transfer failure');
        const transfer = { id: `tr_test_${transfers.length + 1}`, source_transaction: null, reversed: false, ...params };
        transfers.push(transfer);
        keys.set(options.idempotencyKey, transfer);
        if (control.loseResponse) {
          control.loseResponse = false;
          throw new Error('Stubbed lost transfer response');
        }
        return transfer;
      },
    },
  } as unknown as NonNullable<Parameters<typeof completeBooking>[3]>;
  return { stripe, charge, transfers, attempts, control, expireKeys: () => keys.clear() };
}

export function payoutBooking() {
  return {
    id: 'booking_test', tutor_id: 'tutor_test', status: 'confirmed',
    scheduled_at: new Date(Date.now() - 3 * 3600_000).toISOString(), duration_minutes: 60,
    stripe_payment_intent_id: 'pi_test_session', tutor_payout_amount: 18, price: 20,
    stripe_transfer_id: null as string | null, payout_failed_at: null as string | null,
    stripe_charge_id: null as string | null,
  };
}

export function payoutDb() {
  const booking = payoutBooking();
  const control = { failWrite: false };
  const db = {
    from(table: string) {
      const filters: [string, unknown][] = [];
      let patch: Params | null = null;
      const query = {
        update(values: Params) { patch = values; return query; },
        eq(column: string, value: unknown) { filters.push([column, value]); return query; },
        in(column: string, values: unknown[]) { filters.push([column, values]); return query; },
        select() { return patch ? query.execute() : query; },
        maybeSingle: async () => ({
          data: filters.some(([column]) => column === 'extends_booking_id')
            ? null
            : { stripe_connect_account_id: 'acct_test' },
          error: null,
        }),
        execute: async () => {
          assert.equal(table, 'bookings');
          if (control.failWrite) { control.failWrite = false; return { data: null, error: new Error('Stubbed database failure') }; }
          if (!filters.every(([key, value]) => Array.isArray(value)
            ? value.includes((booking as Params)[key])
            : (booking as Params)[key] === value)) return { data: [], error: null };
          Object.assign(booking, patch);
          return { data: [{ id: booking.id }], error: null };
        },
        then(resolve: (result: unknown) => unknown, reject: (error: unknown) => unknown) { return query.execute().then(resolve, reject); },
      };
      return query;
    },
  } as unknown as Parameters<typeof completeBooking>[0];
  return { db, booking, control };
}

export function payoutTestRuntime() {
  const deno = Object.getOwnPropertyDescriptor(globalThis, 'Deno');
  const originalFetch = globalThis.fetch;
  Object.defineProperty(globalThis, 'Deno', { configurable: true, value: { env: {
    get: (key: string) => key === 'STRIPE_SECRET_KEY' ? 'sk_test_stub' : 'local_stub',
  } } });
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === 'api.stripe.com') {
      assert(url.pathname.startsWith('/v2/core/accounts/acct_test'));
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer sk_test_stub');
      return Response.json({ configuration: { recipient: { capabilities: { stripe_balance: {
        stripe_transfers: { status: 'active' }, payouts: { status: 'active' },
      } } } } });
    }
    if (url.pathname.endsWith('/award-referral-bonus')) return Response.json({ ok: true });
    assert.equal(url.origin, 'http://127.0.0.1:54321', 'Only local Supabase traffic is permitted');
    return originalFetch(input, init);
  };
  return () => {
    globalThis.fetch = originalFetch;
    if (deno) Object.defineProperty(globalThis, 'Deno', deno);
    else Reflect.deleteProperty(globalThis, 'Deno');
  };
}
