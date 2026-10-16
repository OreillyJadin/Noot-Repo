// Run: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countdownParts } from '../lib/countdown.ts';

const MIN = 60000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

test('1d 2h 3m (+30s) ahead breaks into whole days/hours/minutes', () => {
  const now = 1_000_000;
  const target = now + DAY + 2 * HOUR + 3 * MIN + 30_000;
  assert.deepEqual(countdownParts(target, now), { d: 1, h: 2, m: 3, started: false });
});

test('59s ahead floors to all-zero pills but has not started', () => {
  const now = 1_000_000;
  assert.deepEqual(countdownParts(now + 59_000, now), { d: 0, h: 0, m: 0, started: false });
});

test('target === now counts as started with zeros', () => {
  const now = 1_000_000;
  assert.deepEqual(countdownParts(now, now), { d: 0, h: 0, m: 0, started: true });
});

test('a target 5 minutes in the past is started with zeros', () => {
  const now = 1_000_000;
  assert.deepEqual(countdownParts(now - 5 * MIN, now), { d: 0, h: 0, m: 0, started: true });
});
