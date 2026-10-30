import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, groupByDay, monthMatrix, monthRange, splitClock } from '../lib/monthGrid.ts';

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

test('groupByDay sorts items within each campus day by start time', () => {
  const groups = groupByDay([
    { id: 'late', startsAt: '2026-10-12T15:00:00-05:00' },
    { id: 'other-day', startsAt: '2026-10-13T09:00:00-05:00' },
    { id: 'early', startsAt: '2026-10-12T08:00:00-05:00' },
  ]);
  assert.deepEqual(groups['2026-10-12']?.map((item) => item.id), ['early', 'late']);
  assert.deepEqual(groups['2026-10-13']?.map((item) => item.id), ['other-day']);
});

test('monthRange covers the entire visible matrix in campus time', () => {
  const { fromIso, toIso } = monthRange(2026, 9);
  assert.equal(fromIso, '2026-09-27T05:00:00.000Z');
  assert.equal(toIso, '2026-11-01T05:00:00.000Z');
});

test('splitClock separates a standard meridiem', () => {
  assert.deepEqual(splitClock('4:22 PM'), { clock: '4:22', meridiem: 'PM' });
});

test('splitClock handles a narrow no-break space before the meridiem', () => {
  assert.deepEqual(splitClock('4:22\u202fPM'), { clock: '4:22', meridiem: 'PM' });
});

test('splitClock normalizes a dotted meridiem', () => {
  assert.deepEqual(splitClock('11:05 a.m.'), { clock: '11:05', meridiem: 'AM' });
});

test('splitClock leaves 24-hour labels intact', () => {
  assert.deepEqual(splitClock('16:22'), { clock: '16:22', meridiem: null });
});

test('event grouping uses campus dates across device-local midnight', () => {
  const groups = groupByDay([{ startsAt: '2026-07-02T05:30:00Z' }]);
  assert.equal(groups['2026-07-02']?.length, 1);
  assert.deepEqual(splitClock('3:00 PM CT'), { clock: '3:00', meridiem: 'PM CT' });
});
