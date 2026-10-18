// Run: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accountStateFrom, decidePostAuthRoute, lookupWithRetry, type AccountState } from '../lib/postAuthRoute.ts';
import { GUIDELINES_VERSION } from '../lib/guidelines.ts';

const setUp: AccountState = {
  hasPassword: true,
  acceptedTerms: true,
  acceptedGuidelines: true,
  activeRole: 'student',
};
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
  assert.deepEqual(decidePostAuthRoute(found({
    hasPassword: false,
    acceptedTerms: false,
    acceptedGuidelines: true,
    activeRole: 'tutor',
  })), { kind: 'onboarding' });
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
  assert.deepEqual(decidePostAuthRoute(found({
    hasPassword: false,
    acceptedTerms: false,
    acceptedGuidelines: false,
    activeRole: 'student',
  })), { kind: 'onboarding' });
});

test('every mode without accepted guidelines reads them before any home', () => {
  for (const activeRole of ['student', 'tutor', 'ambassador', 'admin']) {
    assert.deepEqual(decidePostAuthRoute(found({ ...setUp, acceptedGuidelines: false, activeRole })), { kind: 'guidelines' }, activeRole);
  }
});

test('one acceptance covers every mode: switching modes never asks again', () => {
  for (const activeRole of ['student', 'tutor', 'ambassador']) {
    assert.equal(decidePostAuthRoute(found({ ...setUp, activeRole })).kind, 'home', activeRole);
  }
});

const row = {
  passwordSetAt: '2026-10-01T00:00:00Z',
  termsAcceptedAt: '2026-10-01T00:00:00Z',
  guidelinesAcceptedAt: '2026-10-01T00:00:00Z',
  guidelinesVersion: GUIDELINES_VERSION,
  activeRole: 'tutor' as const,
};

test('the current guidelines version counts as accepted, in any mode', () => {
  assert.equal(accountStateFrom(row).acceptedGuidelines, true);
  assert.equal(accountStateFrom({ ...row, activeRole: 'ambassador' }).acceptedGuidelines, true);
});

test('an older guidelines version asks again once (GUIDELINES_VERSION bump)', () => {
  const stale = accountStateFrom({ ...row, guidelinesVersion: '2026-10-13' });
  assert.equal(stale.acceptedGuidelines, false);
  assert.deepEqual(decidePostAuthRoute(found(stale)), { kind: 'guidelines' });
});

test('a newer version (recorded by a newer build) still counts', () => {
  assert.equal(accountStateFrom({ ...row, guidelinesVersion: '2999-01-01' }).acceptedGuidelines, true);
});

test('no acceptance, or a timestamp with no version, is not accepted', () => {
  assert.equal(accountStateFrom({ ...row, guidelinesAcceptedAt: null }).acceptedGuidelines, false);
  assert.equal(accountStateFrom({ ...row, guidelinesVersion: null }).acceptedGuidelines, false);
});

test('a version that is not a date is not accepted', () => {
  assert.equal(accountStateFrom({ ...row, guidelinesVersion: 'zzz' }).acceptedGuidelines, false);
});

test('a password typed this launch counts even with nothing stamped', () => {
  assert.equal(accountStateFrom({ ...row, passwordSetAt: null }).hasPassword, false);
  assert.equal(accountStateFrom({ ...row, passwordSetAt: null }, true).hasPassword, true);
});

test('the Terms gate comes before the Community Guidelines gate', () => {
  assert.deepEqual(decidePostAuthRoute(found({
    ...setUp,
    acceptedTerms: false,
    acceptedGuidelines: false,
  })), { kind: 'terms' });
});
