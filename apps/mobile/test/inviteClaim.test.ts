// Run: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePending, parsePending, pendingAction, isFinalRefusal, PENDING_INVITE_TTL_MS } from '../lib/inviteClaim.ts';

const NOW = 1_800_000_000_000;
const saved = makePending(' NOOT-ABC123 ', ' Ada@Crimson.UA.edu ', NOW);

test('a saved code round-trips through storage', () => {
  assert.deepEqual(parsePending(JSON.stringify(saved)), { code: 'NOOT-ABC123', email: 'ada@crimson.ua.edu', savedAt: NOW });
});

test('missing or corrupt storage is no pending code', () => {
  assert.equal(parsePending(null), null);
  assert.equal(parsePending('NOOT-ABC123'), null); // the old bare-string format
  assert.equal(parsePending('{"code":""}'), null);
});

test('claimed by the account it was typed for (case-insensitive)', () => {
  assert.equal(pendingAction(saved, 'ADA@crimson.ua.edu', NOW + 1000), 'claim');
});

test('kept when a different account signs in on this phone', () => {
  assert.equal(pendingAction(saved, 'someone.else@crimson.ua.edu', NOW + 1000), 'keep');
});

test('forgotten once the sign-up was clearly abandoned', () => {
  assert.equal(pendingAction(saved, 'ada@crimson.ua.edu', NOW + PENDING_INVITE_TTL_MS + 1), 'forget');
});

test("only claim_invite's own refusals drop the code", () => {
  assert.equal(isFinalRefusal({ code: 'P0001', message: "You've already used an invite code." }), true);
  assert.equal(isFinalRefusal({ code: '', message: 'TypeError: Network request failed' }), false);
  assert.equal(isFinalRefusal({ code: 'PGRST301', message: 'JWT expired' }), false);
  assert.equal(isFinalRefusal({ code: '42501', message: 'not authenticated' }), false);
  assert.equal(isFinalRefusal({ code: '57014', message: 'statement timeout' }), false);
  assert.equal(isFinalRefusal(new Error('boom')), false);
});
