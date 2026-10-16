import assert from 'node:assert/strict';
import test from 'node:test';
import { scrubBreadcrumb, scrubEvent, scrubText } from '../lib/sentryScrub';

test('scrubs emails and credentials from event and exception messages', () => {
  const event = scrubEvent({
    message: 'failed for student@crimson.ua.edu',
    exception: { values: [{ value: 'student@crimson.ua.edu could not sign in' }] },
  });

  assert.equal(event.message, 'failed for [email]');
  assert.equal(event.exception?.values?.[0].value, '[email] could not sign in');
  assert.equal(scrubText('eyJhbGciOi.secret.sig Bearer abc123'), '[token] Bearer [token]');
  assert.equal(scrubText('pi_123_secret_456'), '[token]');
});

test('keeps only the user id and removes request secrets and URL parameters', () => {
  const event = scrubEvent({
    user: {
      id: 'user-123',
      email: 'student@crimson.ua.edu',
      username: 'student',
      ip_address: '127.0.0.1',
    },
    request: {
      headers: { Authorization: 'Bearer secret' },
      cookies: 'session=secret',
      data: { password: 'secret' },
      query_string: 'token=secret',
      url: 'https://noot.example/auth?token=secret#fragment',
    },
  });

  assert.deepEqual(event.user, { id: 'user-123' });
  assert.equal(event.request?.headers, undefined);
  assert.equal(event.request?.cookies, undefined);
  assert.equal(event.request?.data, undefined);
  assert.equal(event.request?.query_string, undefined);
  assert.equal(event.request?.url, 'https://noot.example/auth');
});

test('strips breadcrumb URLs and redacts sensitive magic-link parameters', () => {
  const breadcrumb = scrubBreadcrumb({
    data: { url: 'noot://auth?token_hash=abc&type=magiclink' },
  });

  assert.equal(breadcrumb.data?.url, 'noot://auth');
  assert.equal(
    scrubText('noot://auth?token_hash=abc&type=magiclink'),
    'noot://auth?token_hash=[redacted]&type=magiclink',
  );
});

test('drops sensitive extra and device fields while retaining nonsensitive context', () => {
  const event = scrubEvent({
    extra: { email: 'student@crimson.ua.edu', detail: 'hello student@crimson.ua.edu' },
    contexts: {
      device: { name: 'Jadin phone', family: 'phone-model' },
      os: { name: 'iOS' },
    },
  });

  assert.equal('email' in (event.extra ?? {}), false);
  assert.equal(event.extra?.detail, 'hello [email]');
  assert.equal(event.contexts?.device?.name, undefined);
  assert.equal(event.contexts?.device?.family, 'phone-model');
  assert.equal(event.contexts?.os?.name, 'iOS');
});
