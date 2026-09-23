// Run: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_GRID, windowsFromGrid, gridFromWindows } from '../lib/weekGrid.ts';

const paint = (cells: [row: number, col: number][]) => {
  const g = EMPTY_GRID.map((r) => [...r]);
  for (const [r, c] of cells) g[r]![c] = 1;
  return g;
};

test('adjacent blocks on one day merge into one window', () => {
  // Monday 8a + 11a → 08:00–14:00; Monday is day_of_week 1.
  assert.deepEqual(windowsFromGrid(paint([[0, 0], [1, 0]])), [
    { dayOfWeek: 1, startTime: '08:00', endTime: '14:00' },
  ]);
});

test('Sunday is column 6 and day_of_week 0', () => {
  assert.deepEqual(windowsFromGrid(paint([[4, 6]])), [{ dayOfWeek: 0, startTime: '20:00', endTime: '23:00' }]);
});

test('what step 5 saves reads back as the same grid', () => {
  const g = paint([[0, 0], [1, 0], [3, 2], [4, 6], [2, 4]]);
  assert.deepEqual(gridFromWindows(windowsFromGrid(g)), g);
});

test('a window that only partly covers a block does not light it', () => {
  // 09:00–12:00 on Monday overlaps the 8a block (8–11) and the 11a block (11–14) but covers neither.
  const g = gridFromWindows([{ dayOfWeek: 1, startTime: '09:00', endTime: '12:00' }]);
  assert.deepEqual(g, EMPTY_GRID);
});

test('empty in, empty out', () => {
  assert.deepEqual(windowsFromGrid(EMPTY_GRID), []);
  assert.deepEqual(gridFromWindows([]), EMPTY_GRID);
});
