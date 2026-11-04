import { test } from 'node:test';
import assert from 'node:assert/strict';
import { payoutRecap } from '../lib/payoutRecap.ts';

const idle = { loading: false, error: false };

test('actual payout takes precedence over an estimate, including zero', () => {
  for (const actualAmount of [23.1, 0]) {
    const result = payoutRecap({ ...idle, actualAmount, estimatedAmount: 33 });
    assert.equal(result.amount, actualAmount);
    assert.equal(result.label, 'Net payout');
    assert.match(result.message, /Stripe account/);
    assert.doesNotMatch(result.message, /2 business days/);
  }
});

test('estimate is explicitly labeled and never promises a transfer', () => {
  const result = payoutRecap({ ...idle, estimatedAmount: 33 });
  assert.equal(result.amount, 33);
  assert.equal(result.label, 'Estimated net payout');
  assert.match(result.message, /This is an estimate/);
  assert.doesNotMatch(result.message, /released|business days/);
});

test('missing amounts do not invent a zero-dollar payout', () => {
  const result = payoutRecap(idle);
  assert.equal(result.amount, undefined);
  assert.match(result.message, /not available/);
});

test('payout failure reports automatic retry rather than promising payment timing', () => {
  const result = payoutRecap({ ...idle, actualAmount: 33, payoutFailedAt: '2026-11-04T00:00:00Z' });
  assert.equal(result.message, "Payout delayed. We're retrying automatically.");
  assert.doesNotMatch(result.message, /released|business days/);
});

test('loading keeps the available amount but does not claim payout status', () => {
  const result = payoutRecap({ ...idle, actualAmount: 0, loading: true });
  assert.equal(result.amount, 0);
  assert.equal(result.message, 'Checking payout details…');
});

test('read errors keep actual or estimated amounts honestly labeled', () => {
  for (const input of [{ actualAmount: 33 }, { estimatedAmount: 33 }, {}]) {
    const result = payoutRecap({ ...idle, ...input, error: true });
    assert.match(result.message, /Could not refresh.*status is unavailable/);
    assert.equal(result.label, 'estimatedAmount' in input ? 'Estimated net payout' : 'Net payout');
  }
});
