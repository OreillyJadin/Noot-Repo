// Run: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pushStateOf } from '../lib/pushState.ts';

test('allowed, or delivered quietly, is on', () => {
  assert.equal(pushStateOf({ granted: true, canAskAgain: true }), 'on');
  assert.equal(pushStateOf({ granted: false, canAskAgain: false, provisional: true }), 'on');
});

test('never asked can still be asked', () => {
  assert.equal(pushStateOf({ granted: false, canAskAgain: true }), 'ask');
});

test('refused can only be fixed in Settings', () => {
  assert.equal(pushStateOf({ granted: false, canAskAgain: false }), 'blocked');
});

test('a build without notification support is unavailable, not blocked', () => {
  assert.equal(pushStateOf(null), 'unavailable');
});
