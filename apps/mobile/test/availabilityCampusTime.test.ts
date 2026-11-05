import { test } from 'node:test';
import assert from 'node:assert/strict';
import { campusInstant, campusParts, campusSlotISO } from '../../../packages/core/src/campusTime.ts';
import { slotsFromWindows, bookedSlots } from '../lib/availability.ts';
import { DAYS, MONTHS } from '../lib/data.ts';

test('booking lead time uses campus clock and empty availability stays empty', () => {
  const now = new Date('2026-07-02T19:00:00Z');
  const slots = slotsFromWindows([{ dayOfWeek: 4, startTime: '14:00', endTime: '18:00' }], 60, now, 120);
  assert.deepEqual(slots[0]?.map((s) => s.replace(/ CT$/, '')), ['5:00 PM']);
  assert.deepEqual(slotsFromWindows([], 60, now), {});
});

test('slots inside the two-hour lead time are omitted even just after midnight', () => {
  const now = new Date('2026-07-02T03:30:00Z');
  const slots = slotsFromWindows([{ dayOfWeek: 4, startTime: '00:00', endTime: '03:00' }], 60, now, 120);
  assert.deepEqual(slots[1]?.map((s) => s.replace(/ CT$/, '')), ['1:00 AM', '2:00 AM']);
});

test('spring-forward gap is omitted and every slot ends inside its campus window', () => {
  const now = new Date('2026-03-08T05:00:00Z');
  const slots = slotsFromWindows([{ dayOfWeek: 0, startTime: '01:00', endTime: '04:00' }], 60, now, 120);
  assert.deepEqual(slots[1]?.map((s) => s.replace(/ CT$/, '')), ['3:00 AM']);
  for (const slot of slots[1]!) {
    const at = Date.parse(campusSlotISO({ year: 2026, month: 3, day: 8 }, slot));
    assert.ok(campusParts(at + 3600000).minutes <= 240);
  }
});

test('zero lead time keeps a slot 30 minutes from now', () => {
  const now = new Date('2026-07-02T19:00:00Z');
  const slots = slotsFromWindows([{ dayOfWeek: 4, startTime: '14:30', endTime: '15:00' }], 30, now, 0);
  assert.deepEqual(slots[0]?.map((s) => s.replace(/ CT$/, '')), ['2:30 PM']);
});

test('busy ranges block the campus slot, not the device-local slot', () => {
  const d = DAYS[1]!;
  const at = campusInstant({ year: d.year, month: MONTHS.indexOf(d.month) + 1, day: d.dom }, 900);
  assert.deepEqual([...bookedSlots({ 1: ['3:00 PM', '4:00 PM', 'bad'] }, [
    { startsAt: at.toISOString(), endsAt: new Date(at.getTime() + 3600000).toISOString() },
  ])[1]!], ['3:00 PM']);
  assert.deepEqual(bookedSlots({ 1: ['3:00 PM'] }, []), {});
});
