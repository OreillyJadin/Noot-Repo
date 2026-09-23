// Run: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exchangeOnce, markPasswordResetDone, passwordResetDone } from '../lib/authLinkOnce.ts';

test('two mounts for the same link share one exchange', async () => {
  let calls = 0;
  const exchange = async () => { calls++; return { ok: true }; };
  const link = { code: 'abc-123', flow: 'recovery' };
  const [a, b] = await Promise.all([exchangeOnce(link, exchange), exchangeOnce({ ...link }, exchange)]);
  assert.equal(calls, 1);
  assert.deepEqual(a, b);
  // A copy arriving much later still gets the first result without exchanging again.
  assert.deepEqual(await exchangeOnce(link, exchange), { ok: true });
  assert.equal(calls, 1);
});

test('a failed exchange is shared too (a repeat does not retry a spent code)', async () => {
  let calls = 0;
  const exchange = async () => { calls++; return { ok: false, error: 'expired' }; };
  await exchangeOnce({ code: 'spent' }, exchange);
  const again = await exchangeOnce({ code: 'spent' }, exchange);
  assert.equal(calls, 1);
  assert.equal(again.ok, false);
});

test('different links, token_hash links and keyless links', async () => {
  let calls = 0;
  const exchange = async () => { calls++; return { ok: true }; };
  await exchangeOnce({ code: 'first' }, exchange);
  await exchangeOnce({ code: 'second' }, exchange);
  await exchangeOnce({ token_hash: 'th', type: 'recovery' }, exchange);
  await exchangeOnce({ token_hash: 'th', type: 'recovery' }, exchange);
  await exchangeOnce({ flow: 'recovery' }, exchange);
  await exchangeOnce({ flow: 'recovery' }, exchange);
  assert.equal(calls, 5); // first, second, th once, keyless twice
});

test('reset-done flag', () => {
  assert.equal(passwordResetDone(), false);
  markPasswordResetDone();
  assert.equal(passwordResetDone(), true);
});
