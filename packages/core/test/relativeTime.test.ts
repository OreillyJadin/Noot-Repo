import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatRelativeTime } from '../src/relativeTime.ts';

const NOW = Date.parse('2026-11-05T12:00:00.000Z');

test('formatRelativeTime shows Never for a missing timestamp', () => {
  assert.equal(formatRelativeTime(null, NOW), 'Never');
});

test('formatRelativeTime uses relative units', () => {
  assert.equal(formatRelativeTime(new Date(NOW - 2 * 60 * 1000).toISOString(), NOW), '2 minutes ago');
  assert.equal(formatRelativeTime(new Date(NOW - 3 * 60 * 60 * 1000).toISOString(), NOW), '3 hours ago');
});

test('formatRelativeTime reports recent activity as now', () => {
  assert.equal(formatRelativeTime(new Date(NOW - 30_000).toISOString(), NOW), 'now');
});
