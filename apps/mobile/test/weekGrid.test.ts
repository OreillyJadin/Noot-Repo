// Run: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyGrid, totalHours, windowsFromGrid, gridFromWindows, type Day } from '../lib/weekGrid.ts';

const paint = (cells: [day: Day, hour: number][]) => {
  const g = emptyGrid();
  for (const [d, h] of cells) g[d].add(h);
  return g;
};

test('a single hour is its own one-hour window', () => {
  // ERR-013: step 5 could only offer 3-hour blocks. Monday is day_of_week 1.
  assert.deepEqual(windowsFromGrid(paint([['Mon', 15]])), [{ dayOfWeek: 1, startTime: '15:00', endTime: '16:00' }]);
});

test('consecutive hours on one day merge into one window', () => {
  assert.deepEqual(windowsFromGrid(paint([['Mon', 9], ['Mon', 11], ['Mon', 10]])), [
    { dayOfWeek: 1, startTime: '09:00', endTime: '12:00' },
  ]);
});

test('a gap splits the day into two windows', () => {
  assert.deepEqual(windowsFromGrid(paint([['Tue', 8], ['Tue', 9], ['Tue', 14]])), [
    { dayOfWeek: 2, startTime: '08:00', endTime: '10:00' },
    { dayOfWeek: 2, startTime: '14:00', endTime: '15:00' },
  ]);
});

test('Sunday is day_of_week 0 and the last hour ends at 10pm', () => {
  assert.deepEqual(windowsFromGrid(paint([['Sun', 21]])), [{ dayOfWeek: 0, startTime: '21:00', endTime: '22:00' }]);
});

test('what is saved reads back as the same grid', () => {
  const g = paint([['Mon', 8], ['Mon', 9], ['Wed', 17], ['Sun', 21], ['Fri', 14]]);
  assert.deepEqual(gridFromWindows(windowsFromGrid(g)), g);
});

test('an old 3-hour block reads back as its three hours', () => {
  const g = gridFromWindows([{ dayOfWeek: 1, startTime: '11:00:00', endTime: '14:00:00' }]);
  assert.deepEqual(g, paint([['Mon', 11], ['Mon', 12], ['Mon', 13]]));
});

test('a window that only partly covers an hour does not light it', () => {
  const g = gridFromWindows([{ dayOfWeek: 1, startTime: '09:30', endTime: '11:00' }]);
  assert.deepEqual(g, paint([['Mon', 10]]));
});

test('totalHours counts every open hour in the week', () => {
  assert.equal(totalHours(emptyGrid()), 0);
  assert.equal(totalHours(paint([['Mon', 8], ['Mon', 9], ['Sat', 20]])), 3);
});

test('empty in, empty out', () => {
  assert.deepEqual(windowsFromGrid(emptyGrid()), []);
  assert.deepEqual(gridFromWindows([]), emptyGrid());
});
