import { createHmac, timingSafeEqual } from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyWithAnySecret, webhookSecrets } from '../functions/_shared/webhook.ts';

function sign(secret: string, payload: string, timestamp = 1_800_000_000): string {
  const signature = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

function verify(secret: string, header: string, payload: string): string {
  const timestamp = header.match(/(?:^|,)t=(\d+)/)?.[1];
  const signature = header.match(/(?:^|,)v1=([a-f0-9]+)/)?.[1];
  if (!timestamp || !signature) throw new Error('invalid signature header');

  const expected = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest();
  const actual = Buffer.from(signature, 'hex');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error('signature mismatch');
  }
  return payload;
}

test('platform-signed payload verifies', async () => {
  const payload = '{"event":"platform"}';
  const header = sign('whsec_platform', payload);

  assert.equal(
    await verifyWithAnySecret(['whsec_platform', 'whsec_connect'], (secret) =>
      Promise.resolve(verify(secret, header, payload))),
    payload,
  );
});

test('Connect-signed payload verifies with the second secret', async () => {
  const payload = '{"event":"connect"}';
  const header = sign('whsec_connect', payload);
  const tried: string[] = [];

  assert.equal(
    await verifyWithAnySecret(['whsec_platform', 'whsec_connect'], (secret) => {
      tried.push(secret);
      return Promise.resolve(verify(secret, header, payload));
    }),
    payload,
  );
  assert.deepEqual(tried, ['whsec_platform', 'whsec_connect']);
});

test('a wrong secret returns null', async () => {
  const payload = '{"event":"wrong"}';
  const header = sign('whsec_expected', payload);

  assert.equal(
    await verifyWithAnySecret(['whsec_wrong'], (secret) =>
      Promise.resolve(verify(secret, header, payload))),
    null,
  );
});

test('an empty secret list returns null without calling the verifier', async () => {
  let calls = 0;

  assert.equal(
    await verifyWithAnySecret([], async () => {
      calls++;
      return 'verified';
    }),
    null,
  );
  assert.equal(calls, 0);
});

test('verification stops at the first successful secret', async () => {
  const tried: string[] = [];

  assert.equal(
    await verifyWithAnySecret(['first', 'second', 'third'], async (secret) => {
      tried.push(secret);
      if (secret === 'second') return 'verified';
      throw new Error('signature mismatch');
    }),
    'verified',
  );
  assert.deepEqual(tried, ['first', 'second']);
});

test('a verifier throwing a non-Error value is treated as a failed signature', async () => {
  assert.equal(
    await verifyWithAnySecret(['whsec_test'], async () => {
      throw 'invalid signature';
    }),
    null,
  );
});

test('configured secrets are trimmed and returned platform-first, dropping blanks', () => {
  assert.deepEqual(
    webhookSecrets({
      platform: '  whsec_platform  ',
      connect: ' whsec_connect ',
    }),
    ['whsec_platform', 'whsec_connect'],
  );
  assert.deepEqual(
    webhookSecrets({ platform: undefined, connect: null }),
    [],
  );
  assert.deepEqual(
    webhookSecrets({ platform: '', connect: '  ' }),
    [],
  );
});
