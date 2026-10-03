// Run: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { versionLabel } from '../lib/appVersion.ts';

test('the label is v0.<build number>', () => {
  assert.equal(versionLabel('8'), 'v0.8');
  assert.equal(versionLabel(' 12 '), 'v0.12');
});

test('an unknown build still reads as a version', () => {
  assert.equal(versionLabel(undefined), 'v0.dev');
  assert.equal(versionLabel(null), 'v0.dev');
  assert.equal(versionLabel(''), 'v0.dev');
  assert.equal(versionLabel('   '), 'v0.dev');
});
