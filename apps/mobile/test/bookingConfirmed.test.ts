import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Notification } from '@noot/core';
import { selectUnseenBookingConfirmations } from '../lib/bookingConfirmed.ts';

const now = Date.parse('2026-10-16T12:00:00.000Z');

function notification(
  id: string,
  createdAt: string,
  overrides: Partial<Notification> = {},
): Notification {
  return {
    id,
    type: 'booking',
    title: 'Session confirmed',
    body: '',
    data: { bookingId: `booking-${id}` },
    readAt: null,
    createdAt,
    ...overrides,
  };
}

test('selects only unseen booking confirmations with booking ids', () => {
  const selected = selectUnseenBookingConfirmations([
    notification('match', new Date(now - 60_000).toISOString()),
    notification('seen', new Date(now - 30_000).toISOString()),
    notification('wrong-type', new Date(now - 20_000).toISOString(), { type: 'message' }),
    notification('wrong-title', new Date(now - 10_000).toISOString(), { title: 'Session reminder' }),
    notification('no-booking', new Date(now - 5_000).toISOString(), { data: {} }),
  ], new Set(['seen']), now);

  assert.deepEqual(selected.map((item) => item.id), ['match']);
});

test('keeps notifications in the seven-day window and excludes future or older rows', () => {
  const selected = selectUnseenBookingConfirmations([
    notification('boundary', new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()),
    notification('old', new Date(now - 7 * 24 * 60 * 60 * 1000 - 1).toISOString()),
    notification('future', new Date(now + 1).toISOString()),
  ], new Set(), now);

  assert.deepEqual(selected.map((item) => item.id), ['boundary']);
});

test('returns all qualifying notifications newest first', () => {
  const selected = selectUnseenBookingConfirmations([
    notification('older', new Date(now - 60_000).toISOString()),
    notification('newest', new Date(now - 1_000).toISOString()),
    notification('middle', new Date(now - 10_000).toISOString()),
  ], new Set(), now);

  assert.deepEqual(selected.map((item) => item.id), ['newest', 'middle', 'older']);
});
