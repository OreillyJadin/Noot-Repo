// Run: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interviewLabel, nextInterviewSlots, type WeeklyWindow } from '../lib/interviewSlots.ts';

// Saturday 3 Oct 2026, 10:00 local.
const now = new Date(2026, 9, 3, 10, 0);
const tue: WeeklyWindow = { dayOfWeek: 2, startTime: '15:00', endTime: '17:00' };
const thu: WeeklyWindow = { dayOfWeek: 4, startTime: '09:30', endTime: '11:00' };
const labels = (slots: Date[]) => slots.map(interviewLabel);

test('offers the start of each availability window, soonest first', () => {
  assert.deepEqual(labels(nextInterviewSlots([thu, tue], now, 4)), [
    'Tue, Oct 6 · 3:00 PM',
    'Thu, Oct 8 · 9:30 AM',
    'Tue, Oct 13 · 3:00 PM',
    'Thu, Oct 15 · 9:30 AM',
  ]);
});

test('no availability means nothing to offer', () => {
  assert.deepEqual(nextInterviewSlots([], now), []);
});

test('a window later today is too soon (under 12 hours of notice)', () => {
  const satEvening: WeeklyWindow = { dayOfWeek: 6, startTime: '18:00', endTime: '20:00' };
  // …and Oct 17 is the 15th day, outside the two-week window.
  assert.deepEqual(labels(nextInterviewSlots([satEvening], now, 2)), ['Sat, Oct 10 · 6:00 PM']);
});

test('a window tomorrow with enough notice is offered', () => {
  const sunNoon: WeeklyWindow = { dayOfWeek: 0, startTime: '12:00', endTime: '13:00' };
  assert.equal(labels(nextInterviewSlots([sunNoon], now, 1))[0], 'Sun, Oct 4 · 12:00 PM');
});

test('never looks further than two weeks ahead, and respects the count', () => {
  const slots = nextInterviewSlots([tue, thu], now, 50);
  assert.equal(slots.length, 4);
  assert.equal(nextInterviewSlots([tue, thu], now, 3).length, 3);
});

test('two windows starting at the same time are offered once', () => {
  assert.equal(nextInterviewSlots([tue, { ...tue, endTime: '18:00' }], now, 10).length, 2);
});

test('a window with no usable start time is skipped, not offered at midnight', () => {
  assert.deepEqual(nextInterviewSlots([{ dayOfWeek: 2, startTime: '', endTime: '17:00' }], now), []);
  assert.equal(labels(nextInterviewSlots([{ dayOfWeek: 2, startTime: '15:00:00', endTime: '17:00:00' }], now, 1))[0], 'Tue, Oct 6 · 3:00 PM');
});

test('days are counted across a month end', () => {
  const lateOct = new Date(2026, 9, 28, 10, 0); // Wed 28 Oct
  assert.deepEqual(labels(nextInterviewSlots([tue], lateOct, 2)), ['Tue, Nov 3 · 3:00 PM', 'Tue, Nov 10 · 3:00 PM']);
});

test('midnight and noon read as 12', () => {
  assert.equal(interviewLabel(new Date(2026, 9, 6, 0, 5)), 'Tue, Oct 6 · 12:05 AM');
  assert.equal(interviewLabel(new Date(2026, 9, 6, 12, 0)), 'Tue, Oct 6 · 12:00 PM');
});
