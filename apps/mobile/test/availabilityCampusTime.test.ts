import { test } from 'node:test';
import assert from 'node:assert/strict';
import { campusInstant, campusParts, campusSlotISO } from '../../../packages/core/src/campusTime.ts';
import { slotsFromWindows, bookedSlots } from '../lib/availability.ts';
import { DAYS, MONTHS } from '../lib/data.ts';

test('passed slots use campus clock and empty availability stays empty', () => {
  const now = new Date('2026-07-02T20:30:00Z');
  const slots = slotsFromWindows([{ dayOfWeek: 4, startTime: '14:00', endTime: '18:00' }], 60, now);
  assert.deepEqual(slots[0]?.map((s) => s.replace(/ CT$/, '')), ['4:00 PM', '5:00 PM']);
  assert.deepEqual(slotsFromWindows([], 60, now), {});
});

test('spring-forward gap is omitted and every slot ends inside its campus window', () => {
  const now = new Date('2026-03-08T06:00:00Z');
  const slots = slotsFromWindows([{ dayOfWeek: 0, startTime: '01:00', endTime: '04:00' }], 60, now);
  assert.deepEqual(slots[0]?.map((s) => s.replace(/ CT$/, '')), ['1:00 AM', '3:00 AM']);
  for (const slot of slots[0]!) {
    const at = Date.parse(campusSlotISO({ year: 2026, month: 3, day: 8 }, slot));
    assert.ok(campusParts(at + 3600000).minutes <= 240);
  }
});

test('busy ranges block the campus slot, not the device-local slot', () => {
  const d = DAYS[1]!;
  const at = campusInstant({ year: d.year, month: MONTHS.indexOf(d.month) + 1, day: d.dom }, 900);
  assert.deepEqual([...bookedSlots({ 1: ['3:00 PM', '4:00 PM', 'bad'] }, [
    { startsAt: at.toISOString(), endsAt: new Date(at.getTime() + 3600000).toISOString() },
  ])[1]!], ['3:00 PM']);
  assert.deepEqual(bookedSlots({ 1: ['3:00 PM'] }, []), {});
});
