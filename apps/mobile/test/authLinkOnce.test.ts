// Run: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuthLinks, type KeyValueStore } from '../lib/authLinkOnce.ts';

/** In-memory stand-in for AsyncStorage. Sharing one between two ledgers = an app restart. */
function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => { data.set(k, v); },
  };
}
const ok = async () => ({ ok: true });

test('two mounts for the same link share one exchange', async () => {
  const links = createAuthLinks(memoryStore());
  let calls = 0;
  const exchange = async () => { calls++; return { ok: true }; };
  const link = { code: 'abc', flow: 'recovery' };
  await Promise.all([links.exchangeOnce(link, exchange), links.exchangeOnce({ ...link }, exchange)]);
  assert.equal(calls, 1);
});

test('a used link is remembered across a restart', async () => {
  const store = memoryStore();
  const link = { code: 'reset-1', flow: 'recovery' };
  const before = createAuthLinks(store);
  assert.equal(await before.state(link), 'new');
  await before.exchangeOnce(link, ok);
  const afterRestart = createAuthLinks(store);
  assert.equal(await afterRestart.state(link), 'used');
});

test('THE BUG: reset finished, app force-closed, relaunched with the same link → reset_done', async () => {
  const store = memoryStore();
  const link = { code: 'reset-2', flow: 'recovery' };
  const first = createAuthLinks(store);
  await first.exchangeOnce(link, ok);
  first.setRecoveryLink(link);
  await first.markPasswordResetDone();
  const relaunched = createAuthLinks(store);
  assert.equal(await relaunched.state(link), 'reset_done');
});

test('a finished reset is never downgraded back to "used"', async () => {
  const store = memoryStore();
  const link = { code: 'reset-3' };
  const a = createAuthLinks(store);
  await a.exchangeOnce(link, ok);
  a.setRecoveryLink(link);
  await a.markPasswordResetDone();
  const b = createAuthLinks(store);
  await b.exchangeOnce(link, ok); // a stale re-exchange "succeeding" via the existing session
  assert.equal(await b.state(link), 'reset_done');
});

test('a failed exchange is not recorded as used', async () => {
  const store = memoryStore();
  const links = createAuthLinks(store);
  await links.exchangeOnce({ code: 'expired' }, async () => ({ ok: false, error: 'expired' }));
  assert.equal(await createAuthLinks(store).state({ code: 'expired' }), 'new');
});

test('only the most recent 20 links are kept', async () => {
  const store = memoryStore();
  const links = createAuthLinks(store);
  for (let i = 0; i < 25; i++) {
    await links.exchangeOnce({ code: `c${i}` }, ok);
    await new Promise((r) => setTimeout(r, 1));
  }
  const kept = Object.keys(JSON.parse(store.data.get('noot.authLinks')!));
  assert.equal(kept.length, 20);
  assert.ok(kept.includes('c24') && !kept.includes('c0'));
});

test('corrupt storage reads as empty instead of throwing', async () => {
  const store = memoryStore();
  store.data.set('noot.authLinks', '{not json');
  assert.equal(await createAuthLinks(store).state({ code: 'x' }), 'new');
});
