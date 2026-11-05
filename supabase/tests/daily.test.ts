import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRoomAccess, deleteVideoRoom, ensureVideoRoom, newRoomName, ROOM_ACCESS, tokenProperties, videoJoinUrl, videoWindow } from '../functions/_shared/daily.ts';

test('Daily rooms and tokens are private, scoped, bounded and omit recording/transcription', async () => {
  const originalDeno = (globalThis as any).Deno;
  const originalFetch = globalThis.fetch;
  let key = '';
  let createConflict = false;
  const requests: { path: string; method: string; body: any }[] = [];
  (globalThis as any).Deno = { env: { get: () => key } };
  globalThis.fetch = async (input, options) => {
    const path = String(input);
    const method = options!.method!;
    requests.push({ path, method, body: options?.body ? JSON.parse(String(options.body)) : undefined });
    if (createConflict && path.endsWith('/rooms') && method === 'POST') return new Response(null, { status: 409 });
    if (method === 'GET') return Response.json({ url: 'https://noot.daily.co/noot-abcd1234', privacy: 'private' });
    return Response.json(path.endsWith('/meeting-tokens') ? { token: 'participant-token' } : { url: 'https://noot.daily.co/noot-abcd1234' });
  };
  const at = '2026-11-15T18:00:00Z';
  const bounds = videoWindow(at, 60);
  try {
    assert.equal(await ensureVideoRoom('noot-abcd1234', at, 60, false), 'https://noot-sim.daily.co/noot-abcd1234');
    assert.match(await videoJoinUrl('https://noot-sim.daily.co/noot-abcd1234', 'noot-abcd1234', 'user', 'Sam', bounds.exp), /\?t=sim$/);
    await applyRoomAccess('noot-abcd1234');
    assert.equal(requests.length, 0);
    key = 'test-only';
    await ensureVideoRoom('noot-abcd1234', at, 60, false);
    assert.deepEqual(requests[0].body, { name: 'noot-abcd1234', privacy: 'private', properties: {
      ...bounds, ...ROOM_ACCESS, eject_at_room_exp: true, enable_prejoin_ui: true, enable_chat: true, enable_screenshare: true,
    } });
    await ensureVideoRoom('noot-abcd1234', at, 60, true);
    assert.deepEqual(requests[1].body, { properties: { ...bounds, ...ROOM_ACCESS } });
    const url = await videoJoinUrl('https://noot.daily.co/noot-abcd1234', 'noot-abcd1234', 'user', 'Sam', bounds.exp);
    assert.match(url, /\?t=participant-token$/);
    assert.deepEqual(requests[2].body.properties, { room_name: 'noot-abcd1234', user_name: 'Sam', user_id: 'user', exp: bounds.exp, eject_at_token_exp: true, is_owner: false });
    const computerUserId = '550e8400-e29b-41d4-a716-446655440000';
    const computerProperties = tokenProperties('noot-abcd1234', computerUserId, 'Sam', bounds.exp, 'computer');
    assert.equal(computerProperties.user_id, 'c-550e8400e29b41d4a716446655440000');
    assert.equal(computerProperties.user_id.length, 34);
    assert.equal(computerProperties.user_name, 'Sam (computer)');
    assert.equal(computerProperties.start_audio_off, true);
    assert.equal(computerProperties.start_video_off, true);
    const computerUrl = await videoJoinUrl(
      'https://noot.daily.co/noot-abcd1234',
      'noot-abcd1234',
      computerUserId,
      'Sam',
      bounds.exp,
      'computer',
    );
    assert.match(computerUrl, /\?t=participant-token$/);
    assert.deepEqual(requests[3].body.properties, computerProperties);
    await applyRoomAccess('noot-abcd1234');
    assert.deepEqual(requests[4].body, { properties: ROOM_ACCESS });
    await assert.rejects(applyRoomAccess('not-a-room'), /Invalid video room name/);
    const fallbackStart = requests.length;
    createConflict = true;
    await ensureVideoRoom('noot-abcd1234', at, 60, false);
    createConflict = false;
    assert.equal(requests[fallbackStart].method, 'POST');
    assert.equal(requests[fallbackStart + 1].method, 'GET');
    assert.deepEqual(requests[fallbackStart + 2].body, { properties: { ...bounds, ...ROOM_ACCESS } });
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
