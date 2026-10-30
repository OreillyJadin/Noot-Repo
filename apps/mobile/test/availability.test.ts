import { campusInstant, formatCampusTime } from '../../../packages/core/src/campusTime.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAYS, MONTHS } from '../lib/data.ts';
import { bookedSlots, slotsFromWindows } from '../lib/availability.ts';
import type { BusyTime, TutorAvailability } from '@noot/core';

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

const at = (dayIndex: number, hour: number, minute = 0) => {
  const date = DAYS[dayIndex]!;
  return campusInstant({ year: date.year, month: MONTHS.indexOf(date.month) + 1, day: date.dom }, hour * 60 + minute).toISOString();
};
const label = (hour: number) => formatCampusTime(at(day.i, hour));
const busyRange = (dayIndex: number, startHour: number, startMinute: number, endHour: number, endMinute: number): BusyTime => ({
  startsAt: at(dayIndex, startHour, startMinute),
  endsAt: at(dayIndex, endHour, endMinute),
});
const noonSlots = (lengthMin: number) => slotsFromWindows([window('12:00', '15:00')], lengthMin);

test('60-minute sessions can start as late as 6 PM in a 2–7 PM window', () => {
  assert.equal(slotsForLength(60).at(-1), label(18));
});

test('120-minute sessions can start as late as 5 PM in a 2–7 PM window', () => {
  assert.equal(slotsForLength(120).at(-1), label(17));
});

test('90-minute sessions can start as late as 5 PM in a 2–7 PM window', () => {
  assert.equal(slotsForLength(90).at(-1), label(17));
});

test('a session can span adjacent availability windows', () => {
  assert.ok(slotsForLength(120, [window('14:00', '16:00'), window('16:00', '19:00')]).includes(label(15)));
});

test('a 12–1 booking blocks only the noon slot for a 60-minute session', () => {
  const slots = noonSlots(60);
  const booked = bookedSlots(slots, [busyRange(day.i, 12, 0, 13, 0)], 60);
  assert.deepEqual([...booked[day.i]!], [label(12)]);
  assert.deepEqual(slots[day.i]!.filter((slot) => !booked[day.i]?.has(slot)), [label(13), label(14)]);
});

test('a 12–1 booking does not block a 1 PM start for a 120-minute session', () => {
  const slots = noonSlots(120);
  const booked = bookedSlots(slots, [busyRange(day.i, 12, 0, 13, 0)], 120);
  assert.deepEqual([...booked[day.i]!], [label(12)]);
  assert.equal(booked[day.i]!.has(label(13)), false);
});

test('overlapping bookings block both 120-minute slots', () => {
  const slots = noonSlots(120);
  const booked = bookedSlots(slots, [
    busyRange(day.i, 12, 0, 13, 0),
    busyRange(day.i, 13, 30, 14, 0),
  ], 120);
  assert.deepEqual([...booked[day.i]!], [label(12), label(13)]);
});

test('busy ranges on another day do not mark slots booked', () => {
  const booked = bookedSlots(noonSlots(60), [busyRange(DAYS[2]!.i, 12, 0, 13, 0)], 60);
  assert.deepEqual(booked, {});
});
