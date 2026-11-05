// Run: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkErrorMessage } from '../src/auth/index.ts';

test('a link opened in another browser or app explains what to do instead', () => {
  const raw =
    'PKCE code verifier not found in storage. This can happen if the auth flow was initiated in a different browser or device, or if the storage was cleared.';
  const msg = linkErrorMessage(raw);
  assert.match(msg, /same browser or app/);
  assert.match(msg, /type the code/);
  assert.doesNotMatch(msg, /PKCE|storage/);
});

test('other link errors pass through unchanged', () => {
  assert.equal(linkErrorMessage('Email link is invalid or has expired'), 'Email link is invalid or has expired');
});
