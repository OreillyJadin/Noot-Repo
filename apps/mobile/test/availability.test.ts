import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAYS } from '../lib/data.ts';
import { slotsFromWindows } from '../lib/availability.ts';
import type { TutorAvailability } from '@noot/core';

const day = DAYS[1]!;
const window = (startTime: string, endTime: string): TutorAvailability => ({
  id: 'availability-window',
  tutorId: 'tutor',
  dayOfWeek: day.dowNum,
  startTime,
  endTime,
  createdAt: '',
});

const slotsForLength = (lengthMin: number, windows = [window('14:00', '19:00')]) =>
  slotsFromWindows(windows, lengthMin)[day.i] ?? [];

test('60-minute sessions can start as late as 6 PM in a 2–7 PM window', () => {
  assert.equal(slotsForLength(60).at(-1), '6:00 PM');
});

test('120-minute sessions can start as late as 5 PM in a 2–7 PM window', () => {
  assert.equal(slotsForLength(120).at(-1), '5:00 PM');
});

test('90-minute sessions can start as late as 5 PM in a 2–7 PM window', () => {
  assert.equal(slotsForLength(90).at(-1), '5:00 PM');
});

test('a session can span adjacent availability windows', () => {
  assert.ok(slotsForLength(120, [window('14:00', '16:00'), window('16:00', '19:00')]).includes('3:00 PM'));
});
