// Run: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { campusDays, campusInstant } from '../../../packages/core/src/campusTime.ts';
import { sessionDayAndTime } from '../lib/formatSessionTime.ts';

const fallback = { day: 'Wed Oct 21', time: '7:00 AM' };

test('uses the scheduled time for a booking tomorrow', () => {
  const tomorrow = campusInstant(campusDays(2)[1]!, 15 * 60);

  const result = sessionDayAndTime(tomorrow.toISOString(), fallback);

  assert.equal(result.day, 'Tomorrow');
  assert.match(result.time, /3:00/);
});

test('returns the fallback unchanged when no scheduled time is set', () => {
  assert.strictEqual(sessionDayAndTime(undefined, fallback), fallback);
});

test('separates the day label from the time for a date five days out', () => {
  const future = campusInstant(campusDays(6)[5]!, 15 * 60);

  const result = sessionDayAndTime(future.toISOString(), fallback);

  assert.doesNotMatch(result.day, /·/);
  assert.match(result.time, /\d:\d\d/);
});
