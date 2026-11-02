import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deleteVideoRoom, ensureVideoRoom, newRoomName, videoJoinUrl, videoWindow } from '../functions/_shared/daily.ts';

test('Daily rooms and tokens are private, scoped, bounded and omit recording/transcription', async () => {
  const originalDeno = (globalThis as any).Deno;
  const originalFetch = globalThis.fetch;
  let key = '';
  const requests: { path: string; method: string; body: any }[] = [];
  (globalThis as any).Deno = { env: { get: () => key } };
  globalThis.fetch = async (input, options) => {
    const path = String(input);
    requests.push({ path, method: options!.method!, body: options?.body ? JSON.parse(String(options.body)) : undefined });
    return Response.json(path.endsWith('/meeting-tokens') ? { token: 'participant-token' } : { url: 'https://noot.daily.co/noot-abcd1234' });
  };
  const at = '2026-11-15T18:00:00Z';
  const bounds = videoWindow(at, 60);
  try {
    assert.equal(await ensureVideoRoom('noot-abcd1234', at, 60, false), 'https://noot-sim.daily.co/noot-abcd1234');
    assert.match(await videoJoinUrl('https://noot-sim.daily.co/noot-abcd1234', 'noot-abcd1234', 'user', 'Sam', bounds.exp), /\?t=sim$/);
    assert.equal(requests.length, 0);
    key = 'test-only';
    await ensureVideoRoom('noot-abcd1234', at, 60, false);
    assert.deepEqual(requests[0].body, { name: 'noot-abcd1234', privacy: 'private', properties: {
      ...bounds, eject_at_room_exp: true, max_participants: 2, enable_prejoin_ui: true, enable_chat: true, enable_screenshare: true,
    } });
    await ensureVideoRoom('noot-abcd1234', at, 60, true);
    assert.deepEqual(requests[1].body, { properties: bounds });
    const url = await videoJoinUrl('https://noot.daily.co/noot-abcd1234', 'noot-abcd1234', 'user', 'Sam', bounds.exp);
    assert.match(url, /\?t=participant-token$/);
    assert.deepEqual(requests[2].body.properties, { room_name: 'noot-abcd1234', user_name: 'Sam', user_id: 'user', exp: bounds.exp, eject_at_token_exp: true, is_owner: false });
    globalThis.fetch = async () => new Response(null, { status: 404 });
    await deleteVideoRoom('noot-abcd1234');
    globalThis.fetch = async () => new Response(null, { status: 503 });
    await assert.rejects(deleteVideoRoom('noot-abcd1234'), /503/);
    await assert.rejects(ensureVideoRoom('noot-abcd1234', at, 60, false), /503/);
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as any).Deno = originalDeno;
  }
  for (let i = 0; i < 10; i++) assert.match(newRoomName(), /^noot-[a-z0-9]{8}$/);
  assert.equal(bounds.nbf, Date.parse(at) / 1000 - 3600);
  assert.equal(bounds.exp, Date.parse(at) / 1000 + 5400);
});
