// Run: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decidePostAuthRoute, lookupWithRetry, type RoutedUser } from '../lib/postAuthRoute.ts';

const setUp: RoutedUser = { firstName: 'Tony', activeRole: 'student', termsAcceptedAt: '2026-09-17T00:45:00Z' };
const found = (me: RoutedUser | null) => ({ ok: true as const, me });
const noSleep = async () => {};

test('a failed lookup never sends anyone into onboarding (ERR-001)', () => {
  assert.deepEqual(decidePostAuthRoute({ ok: false }, 'session'), { kind: 'unavailable' });
  assert.deepEqual(decidePostAuthRoute({ ok: false }, 'signup_link'), { kind: 'unavailable' });
});

test('a replayed sign-up link takes a set-up account home, not to "Create your password" (ERR-001)', () => {
  assert.deepEqual(decidePostAuthRoute(found(setUp), 'signup_link'), {
    kind: 'home', role: 'student', route: '/home',
  });
});

test('a sign-up link for an account with no password yet starts onboarding', () => {
  assert.deepEqual(decidePostAuthRoute(found({ ...setUp, termsAcceptedAt: null }), 'signup_link'), {
    kind: 'onboarding',
  });
});

test('no users row yet is a new account on either path', () => {
  assert.deepEqual(decidePostAuthRoute(found(null), 'session'), { kind: 'onboarding' });
  assert.deepEqual(decidePostAuthRoute(found(null), 'signup_link'), { kind: 'onboarding' });
});

test('a returning session lands on the home for its saved mode', () => {
  assert.deepEqual(decidePostAuthRoute(found({ ...setUp, activeRole: 'tutor' }), 'session'), {
    kind: 'home', role: 'tutor', route: '/tutor_home',
  });
  assert.deepEqual(decidePostAuthRoute(found({ ...setUp, activeRole: 'ambassador' }), 'session'), {
    kind: 'home', role: 'ambassador', route: '/ambassador_home',
  });
  // Admin is a permission, not a mode.
  assert.deepEqual(decidePostAuthRoute(found({ ...setUp, activeRole: 'admin' }), 'session'), {
    kind: 'home', role: 'student', route: '/home',
  });
});

test('an account from before terms were recorded still goes home on a normal launch', () => {
  assert.deepEqual(decidePostAuthRoute(found({ ...setUp, termsAcceptedAt: null }), 'session'), {
    kind: 'home', role: 'student', route: '/home',
  });
});

test('a session with a blank name starts onboarding', () => {
  assert.deepEqual(decidePostAuthRoute(found({ ...setUp, firstName: '  ' }), 'session'), { kind: 'onboarding' });
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
