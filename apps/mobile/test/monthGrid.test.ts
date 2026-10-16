import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, groupByDay, monthMatrix, monthRange } from '../lib/monthGrid.ts';

test('October 2026 starts on Thursday and uses five Sunday-start weeks', () => {
  const matrix = monthMatrix(2026, 9);
  assert.equal(matrix.length, 5);
  assert.equal(dayKey(matrix[0]![0]!), '2026-09-27');
  assert.equal(dayKey(matrix[0]![4]!), '2026-10-01');
});

test('February 2026 is exactly four weeks when it starts on Sunday', () => {
  const matrix = monthMatrix(2026, 1);
  assert.equal(matrix.length, 4);
  assert.equal(dayKey(matrix[0]![0]!), '2026-02-01');
  assert.equal(dayKey(matrix[3]![6]!), '2026-02-28');
});

test('November 2026 DST transition keeps every visible local day unique and consecutive', () => {
  const matrix = monthMatrix(2026, 10);
  const keys = matrix.flat().map(dayKey);
  const expected = Array.from({ length: keys.length }, (_, index) => dayKey(new Date(2026, 10, 1 + index)));
  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual(keys, expected);
});

test('groupByDay sorts items within each local day by start time', () => {
  const groups = groupByDay([
    { id: 'late', startsAt: '2026-10-12T15:00:00-05:00' },
    { id: 'other-day', startsAt: '2026-10-13T09:00:00-05:00' },
    { id: 'early', startsAt: '2026-10-12T08:00:00-05:00' },
  ]);
  assert.deepEqual(groups['2026-10-12']?.map((item) => item.id), ['early', 'late']);
  assert.deepEqual(groups['2026-10-13']?.map((item) => item.id), ['other-day']);
});

test('monthRange covers the entire visible matrix in local time', () => {
  const matrix = monthMatrix(2026, 9);
  const { fromIso, toIso } = monthRange(2026, 9);
  assert.equal(fromIso, matrix[0]![0]!.toISOString());
  assert.equal(toIso, new Date(2026, 10, 1).toISOString());
});
