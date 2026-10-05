// Run: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decidePostAuthRoute, lookupWithRetry, type AccountState } from '../lib/postAuthRoute.ts';

const setUp: AccountState = { hasPassword: true, acceptedTerms: true, activeRole: 'student' };
const found = (account: AccountState | null) => ({ ok: true as const, account });
const noSleep = async () => {};

test('a failed lookup never sends anyone into onboarding (ERR-001)', () => {
  assert.deepEqual(decidePostAuthRoute({ ok: false }), { kind: 'unavailable' });
});

test('an account with a password goes home, not to "Create your password" (ERR-001)', () => {
  assert.deepEqual(decidePostAuthRoute(found(setUp)), { kind: 'home', role: 'student', route: '/home' });
});

test('an account with no password yet starts onboarding', () => {
  assert.deepEqual(decidePostAuthRoute(found({ ...setUp, hasPassword: false })), { kind: 'onboarding' });
  // Whatever mode is saved: without a password they have not finished signing up.
  assert.deepEqual(decidePostAuthRoute(found({ hasPassword: false, acceptedTerms: false, activeRole: 'tutor' })), { kind: 'onboarding' });
});

test('no users row yet is a new account', () => {
  assert.deepEqual(decidePostAuthRoute(found(null)), { kind: 'onboarding' });
});

test('home follows the saved mode', () => {
  assert.deepEqual(decidePostAuthRoute(found({ ...setUp, activeRole: 'tutor' })), {
    kind: 'home', role: 'tutor', route: '/tutor_home',
  });
  assert.deepEqual(decidePostAuthRoute(found({ ...setUp, activeRole: 'ambassador' })), {
    kind: 'home', role: 'ambassador', route: '/ambassador_home',
  });
  // Admin is a permission, not a mode.
  assert.deepEqual(decidePostAuthRoute(found({ ...setUp, activeRole: 'admin' })), {
    kind: 'home', role: 'student', route: '/home',
  });
});

test('lookupWithRetry returns the first success without retrying', async () => {
  let calls = 0;
  const res = await lookupWithRetry(async () => { calls++; return 'me'; }, [1, 1], noSleep);
  assert.deepEqual(res, { ok: true, value: 'me' });
  assert.equal(calls, 1);
});

test('lookupWithRetry recovers from a failure that clears up', async () => {
  let calls = 0;
  const waits: number[] = [];
  const res = await lookupWithRetry(
    async () => { if (++calls < 3) throw new Error('Network request failed'); return 'me'; },
    [400, 1200],
    async (ms) => { waits.push(ms); },
  );
  assert.deepEqual(res, { ok: true, value: 'me' });
  assert.deepEqual(waits, [400, 1200]);
  assert.equal(calls, 3);
});

test('lookupWithRetry gives up after its retries and reports the failure', async () => {
  let calls = 0;
  const res = await lookupWithRetry(async () => { calls++; throw new Error('offline'); }, [1, 1], noSleep);
  assert.deepEqual(res, { ok: false });
  assert.equal(calls, 3);
});

test('a null read (no row) is a success, not a failure to retry', async () => {
  let calls = 0;
  const res = await lookupWithRetry(async () => { calls++; return null; }, [1, 1], noSleep);
  assert.deepEqual(res, { ok: true, value: null });
  assert.equal(calls, 1);
});

test('an account with a password that never accepted the Terms accepts them before any home', () => {
  assert.deepEqual(decidePostAuthRoute(found({ ...setUp, acceptedTerms: false })), { kind: 'terms' });
  // Whatever mode is saved — a tutor or ambassador is held at the same door.
  assert.deepEqual(decidePostAuthRoute(found({ ...setUp, acceptedTerms: false, activeRole: 'tutor' })), { kind: 'terms' });
  assert.deepEqual(decidePostAuthRoute(found({ ...setUp, acceptedTerms: false, activeRole: 'ambassador' })), { kind: 'terms' });
});

test('without a password the Terms are accepted in onboarding, with the password', () => {
  assert.deepEqual(decidePostAuthRoute(found({ hasPassword: false, acceptedTerms: false, activeRole: 'student' })), { kind: 'onboarding' });
});
