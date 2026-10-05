// Run: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interviewBlockedSlots, interviewRange, slotMinutes } from '../lib/interviewBlock.ts';

const SLOTS = ['9:00 AM', '10:30 AM', '12:00 PM', '1:30 PM', '3:00 PM', '4:30 PM', '6:00 PM', '7:30 PM'];
const at = (h: number, m = 0) => new Date(2026, 9, 6, h, m);

test('slot labels read as minutes since midnight', () => {
  assert.equal(slotMinutes('9:00 AM'), 540);
  assert.equal(slotMinutes('12:00 PM'), 720);
  assert.equal(slotMinutes('12:30 AM'), 30);
  assert.equal(slotMinutes('7:30 PM'), 1170);
  assert.equal(slotMinutes('soon'), null);
});

test('an interview on a row\'s time blocks that row', () => {
  assert.deepEqual(interviewBlockedSlots(at(15), SLOTS), ['3:00 PM']);
});

test('an interview between two rows blocks the row it starts during', () => {
  // 2:00–3:00 PM sits inside the 1:30 PM row and ends as the 3:00 PM row begins.
  assert.deepEqual(interviewBlockedSlots(at(14), SLOTS), ['1:30 PM']);
});

test('an interview that runs into the next row blocks both', () => {
  // 10:00–11:00 AM starts during the 9:00 AM row and covers 10:30 AM.
  assert.deepEqual(interviewBlockedSlots(at(10), SLOTS), ['9:00 AM', '10:30 AM']);
});

test('an interview before the first row blocks nothing it does not reach', () => {
  assert.deepEqual(interviewBlockedSlots(at(7), SLOTS), []);
  // 8:30–9:30 AM reaches the 9:00 AM row.
  assert.deepEqual(interviewBlockedSlots(at(8, 30), SLOTS), ['9:00 AM']);
});

test('a late interview blocks the last row', () => {
  assert.deepEqual(interviewBlockedSlots(at(21), SLOTS), ['7:30 PM']);
});

test('the hour is written out', () => {
  assert.equal(interviewRange(at(15)), '3:00 PM – 4:00 PM');
  assert.equal(interviewRange(at(11, 30)), '11:30 AM – 12:30 PM');
});
