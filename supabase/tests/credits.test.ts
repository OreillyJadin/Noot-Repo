// Run: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creditToApply, parseCreditCents, MIN_CHARGE_CENTS } from '../functions/_shared/credits.ts';

test('a $5 credit comes off a $28 session in full', () => {
  assert.equal(creditToApply(500, 2800), 500);
});

test('no balance, no credit', () => {
  assert.equal(creditToApply(0, 2800), 0);
});

test('a big balance leaves the minimum charge on the card', () => {
  assert.equal(creditToApply(100000, 2800), 2800 - MIN_CHARGE_CENTS);
});

test('a session at or under the minimum charge takes no credit', () => {
  assert.equal(creditToApply(500, MIN_CHARGE_CENTS), 0);
  assert.equal(creditToApply(500, 50), 0);
});

test('PaymentIntent metadata: absent means no credit', () => {
  assert.equal(parseCreditCents(undefined, 2800), 0);
  assert.equal(parseCreditCents('', 2800), 0);
});

test('PaymentIntent metadata: a valid credit is accepted', () => {
  assert.equal(parseCreditCents('500', 2800), 500);
});

test('PaymentIntent metadata: anything a booking could not have is rejected', () => {
  assert.equal(parseCreditCents('-500', 2800), null);
  assert.equal(parseCreditCents('5.5', 2800), null);
  assert.equal(parseCreditCents('abc', 2800), null);
  assert.equal(parseCreditCents('2800', 2800), null); // would take the charge under the minimum
});
