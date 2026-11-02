import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isDeferredCheckout, needsPaymentUpdate, canUpdatePayment } from '../lib/paymentTiming.ts';
import { BOOKABLE_DAYS, BOOKING_HORIZON_DAYS } from '../lib/data.ts';

const now = Date.parse('2026-11-02T12:00:00Z');
const at = (hours: number) => new Date(now + hours * 3600000).toISOString();
const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('booking and both reschedule roles use a fourteen-day picker', () => {
  assert.equal(BOOKING_HORIZON_DAYS, 14);
  assert.equal(BOOKABLE_DAYS.length, 14);
  assert.match(source('../app/b3.tsx'), /BOOKABLE_DAYS/);
  assert.match(source('../app/xtr.tsx'), /BOOKABLE_DAYS/);
});

test('checkout defers only beyond six days, matching the server boundary', () => {
  assert.equal(isDeferredCheckout(at(144), now), false);
  assert.equal(isDeferredCheckout(at(144 + 1 / 3600), now), true);
  assert.equal(isDeferredCheckout(at(240), now), true);
  assert.equal(isDeferredCheckout(null, now), false);
  assert.equal(isDeferredCheckout(undefined, now), false);
  assert.equal(isDeferredCheckout('bad timestamp', now), false);
});

test('payment banner is only for active failed unpaid sessions', () => {
  const failed = { status: 'confirmed' as const, holdFailedAt: at(-1), stripePaymentIntentId: null };
  assert.equal(needsPaymentUpdate(failed), true);
  assert.equal(needsPaymentUpdate({ ...failed, status: 'pending' }), true);
  assert.equal(needsPaymentUpdate({ ...failed, stripePaymentIntentId: 'pi_fixed' }), false);
  assert.equal(needsPaymentUpdate({ ...failed, holdFailedAt: null }), false);
  for (const status of ['cancelled', 'completed', 'no_show'] as const) {
    assert.equal(needsPaymentUpdate({ ...failed, status }), false);
  }
  assert.equal(needsPaymentUpdate({ status: 'confirmed', stripePaymentIntentId: null }), false);
});

test('payment repair closes at twelve hours, including invalid dates', () => {
  assert.equal(canUpdatePayment(at(13), now), true);
  assert.equal(canUpdatePayment(at(12), now), false);
  assert.equal(canUpdatePayment(at(1), now), false);
  assert.equal(canUpdatePayment('invalid', now), false);
});

test('checkout selects SetupIntent PaymentSheet mode and confirms the same setup', () => {
  const b4 = source('../app/b4.tsx');
  assert.match(b4, /setupIntentClientSecret: pi.setupIntentClientSecret/);
  assert.match(b4, /setupIntentId: pi.setupIntentId/);
  assert.match(b4, /currencyCode: 'USD'/);
  assert.match(b4, /You won't be charged now/);
  assert.match(b4, /confirm it 2 days before the session/);
  assert.doesNotMatch(b4, />[^<]*(?:authorization|Payment held)/);
  const banner = source('../lib/PaymentUpdateBanner.tsx');
  assert.match(banner, /createPaymentUpdate/);
  assert.match(banner, /presentPaymentSheet/);
  assert.match(banner, /attachPaymentUpdate/);
  assert.match(banner, /code === 'Canceled'/);
  assert.match(banner, /Could not update payment/);
  assert.match(source('../app/sessions.tsx'), /PaymentUpdateBanner booking=\{b\}/);
});

test('core maps all deferred payment state and exposes repair actions', () => {
  const api = source('../../../packages/core/src/api/index.ts');
  for (const [model, column] of [
    ['stripeSetupIntentId', 'stripe_setup_intent_id'], ['stripePaymentMethodId', 'stripe_payment_method_id'],
    ['holdDueAt', 'hold_due_at'], ['holdPlacedAt', 'hold_placed_at'],
    ['holdFailedAt', 'hold_failed_at'], ['holdFailureCode', 'hold_failure_code'],
  ]) assert.ok(api.includes(`${model}: row.${column} ?? null`));
  assert.match(api, /invokeFn\('booking-hold', \{ bookingId, action: 'create' \}\)/);
  assert.match(api, /invokeFn\('booking-hold', \{ bookingId, paymentIntentId, action: 'attach' \}\)/);
});
