import assert from 'node:assert/strict';
import test from 'node:test';
import { withErrorReporting } from '../functions/_shared/observability.ts';

const dsn = 'https://abc@o1.ingest.sentry.io/123';

function recorder() {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const pending: Promise<unknown>[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response(null, { status: 200 });
  };
  return { calls, pending, fetch, waitUntil: (promise: Promise<unknown>) => pending.push(promise) };
}

test('reports a scrubbed exception through the Sentry envelope API', async () => {
  const delivery = recorder();
  const wrapped = withErrorReporting(
    'confirm-booking',
    () => {
      throw new Error('boom for student@crimson.ua.edu');
    },
    { dsn, fetch: delivery.fetch, waitUntil: delivery.waitUntil },
  );
  const response = await wrapped(
    new Request('https://x.supabase.co/confirm-booking?token=abc', {
      method: 'POST',
      headers: { Authorization: 'Bearer eyJhbGciOi.secret.sig' },
      body: '{"email":"student@crimson.ua.edu"}',
    }),
  );

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'Internal error' });
  assert.equal(delivery.calls.length, 1);
  assert.equal(delivery.calls[0].url, 'https://o1.ingest.sentry.io/api/123/envelope/');
  const headers = new Headers(delivery.calls[0].init?.headers);
  assert.match(headers.get('X-Sentry-Auth') ?? '', /sentry_key=abc/);

  const envelope = String(delivery.calls[0].init?.body);
  const lines = envelope.trimEnd().split('\n');
  assert.equal(lines.length, 3);
  const event = JSON.parse(lines[2]);
  assert.equal(event.tags.function, 'confirm-booking');
  assert.equal(event.transaction, 'POST /confirm-booking');
  assert.match(event.exception.values[0].value, /\[email\]/);
  assert.ok(event.exception.values[0].stacktrace.frames.length > 0);
  for (const secret of ['student@crimson.ua.edu', 'eyJhbGciOi', 'token=abc', 'Authorization']) {
    assert.equal(envelope.includes(secret), false);
  }
  assert.equal('request' in event, false);
  assert.equal('user' in event, false);
  await Promise.all(delivery.pending);
});

test('reports 5xx responses and returns the original response unchanged', async () => {
  const delivery = recorder();
  const wrapped = withErrorReporting(
    'confirm-booking',
    () => new Response('down', { status: 503 }),
    { dsn, fetch: delivery.fetch, waitUntil: delivery.waitUntil },
  );
  const response = await wrapped(new Request('https://x.supabase.co/confirm-booking'));

  assert.equal(response.status, 503);
  assert.equal(await response.text(), 'down');
  assert.equal(delivery.calls.length, 1);
  const event = JSON.parse(String(delivery.calls[0].init?.body).trimEnd().split('\n')[2]);
  assert.equal(event.tags.status, '503');
  assert.equal(event.message, 'confirm-booking responded 503');
  await Promise.all(delivery.pending);
});

for (const status of [200, 401]) {
  test(`does not report ${status} responses`, async () => {
    const delivery = recorder();
    const wrapped = withErrorReporting(
      'confirm-booking',
      () => new Response('ok', { status }),
      { dsn, fetch: delivery.fetch, waitUntil: delivery.waitUntil },
    );

    assert.equal((await wrapped(new Request('https://x.supabase.co/confirm-booking'))).status, status);
    assert.equal(delivery.calls.length, 0);
  });
}

test('does not report thrown errors when the DSN is unset', async () => {
  const delivery = recorder();
  const wrapped = withErrorReporting(
    'confirm-booking',
    () => {
      throw new Error('boom');
    },
    { dsn: null, fetch: delivery.fetch, waitUntil: delivery.waitUntil },
  );

  assert.equal((await wrapped(new Request('https://x.supabase.co/confirm-booking'))).status, 500);
  assert.equal(delivery.calls.length, 0);
});

test('a rejected Sentry request does not affect the response', async () => {
  const pending: Promise<unknown>[] = [];
  const wrapped = withErrorReporting(
    'confirm-booking',
    () => new Response('down', { status: 503 }),
    {
      dsn,
      fetch: async () => {
        throw new Error('network unavailable');
      },
      waitUntil: (promise) => pending.push(promise),
    },
  );

  const response = await wrapped(new Request('https://x.supabase.co/confirm-booking'));
  assert.equal(response.status, 503);
  await Promise.all(pending);
});

test('a pending Sentry request does not delay the response', async () => {
  const pending: Promise<unknown>[] = [];
  const wrapped = withErrorReporting(
    'confirm-booking',
    () => new Response('down', { status: 503 }),
    {
      dsn,
      fetch: () => new Promise<Response>(() => {}),
      waitUntil: (promise) => pending.push(promise),
    },
  );

  const result = await Promise.race([
    wrapped(new Request('https://x.supabase.co/confirm-booking')),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('response timed out')), 100)),
  ]);
  assert.equal(result.status, 503);
  assert.equal(pending.length, 1);
});

test('does not access Deno or throw when there is no DSN in node', async () => {
  const runtime = globalThis as typeof globalThis & { Deno?: unknown };
  const originalDeno = runtime.Deno;
  delete runtime.Deno;
  try {
    const response = await withErrorReporting('confirm-booking', () => {
      throw new Error('boom');
    })(new Request('https://x.supabase.co/confirm-booking'));
    assert.equal(response.status, 500);
  } finally {
    if (originalDeno !== undefined) runtime.Deno = originalDeno;
  }
});
