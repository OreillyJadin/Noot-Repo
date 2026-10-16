// Run: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickStudentNext } from '../lib/nextSession.ts';

const b = (status: string, id = status) => ({ id, status });

test('a confirmed session beats an earlier pending request', () => {
  const pending = b('pending', 'p');
  const confirmed = b('confirmed', 'c');
  assert.equal(pickStudentNext([pending, confirmed]), confirmed);
});

test('with no confirmed session the first pending request wins', () => {
  const a = b('pending', 'a');
  const bb = b('pending', 'b');
  assert.equal(pickStudentNext([a, bb]), a);
});

test('empty list → null', () => {
  assert.equal(pickStudentNext([]), null);
});

test('non-pending/non-confirmed statuses alone → null', () => {
  assert.equal(pickStudentNext([b('declined')]), null);
});
