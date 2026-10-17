import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeAvailabilityWindows } from '../src/availability.ts';

const window = (dayOfWeek: number, startTime: string, endTime: string) => ({
  dayOfWeek,
  startTime,
  endTime,
});

test('merges overlapping windows', () => {
  assert.deepEqual(
    mergeAvailabilityWindows([window(1, '14:00', '16:00'), window(1, '15:00', '19:00')]),
    [window(1, '14:00', '19:00')],
  );
});

test('merges adjacent windows', () => {
  assert.deepEqual(
    mergeAvailabilityWindows([window(1, '14:00', '16:00'), window(1, '16:00', '18:00')]),
    [window(1, '14:00', '18:00')],
  );
});

test('keeps disjoint windows separate', () => {
  assert.deepEqual(
    mergeAvailabilityWindows([window(1, '14:00', '15:00'), window(1, '16:00', '18:00')]),
    [window(1, '14:00', '15:00'), window(1, '16:00', '18:00')],
  );
});

test('does not merge windows on different days', () => {
  assert.deepEqual(
    mergeAvailabilityWindows([window(2, '15:00', '18:00'), window(1, '14:00', '16:00')]),
    [window(1, '14:00', '16:00'), window(2, '15:00', '18:00')],
  );
});

test('absorbs contained windows', () => {
  assert.deepEqual(
    mergeAvailabilityWindows([window(1, '14:00', '19:00'), window(1, '15:00', '16:00')]),
    [window(1, '14:00', '19:00')],
  );
});

test('sorts unsorted input and merges its touching windows', () => {
  assert.deepEqual(
    mergeAvailabilityWindows([
      window(2, '15:00', '19:00'),
      window(1, '16:00', '18:00'),
      window(1, '14:00', '16:00'),
    ]),
    [window(1, '14:00', '18:00'), window(2, '15:00', '19:00')],
  );
});

test('accepts HH:MM:SS values and returns HH:MM', () => {
  assert.deepEqual(
    mergeAvailabilityWindows([window(1, '14:00:00', '16:00:00'), window(1, '16:00:00', '18:00:00')]),
    [window(1, '14:00', '18:00')],
  );
});
