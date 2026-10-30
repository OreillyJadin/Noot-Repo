import { test } from 'node:test';
import assert from 'node:assert/strict';
import { campusParts, campusInstant, campusDays, campusSlotISO, tryCampusSlotISO, campusTimeZoneLabel, formatCampusTime, formatCampusSession, formatCampusSessionWhen, formatCampusSlot } from '../src/campusTime.ts';

test('campus parts and wall-clock conversion round trip in summer and winter', () => {
  for (const month of [1, 7]) {
    const day = { year: 2026, month, day: 15 };
    const at = campusInstant(day, 930);
    assert.deepEqual(campusParts(at), { ...day, dayOfWeek: month === 1 ? 4 : 3, minutes: 930 });
    assert.equal(campusSlotISO(day, '3:30 PM CT'), at.toISOString());
  }
});

test('DST transition days have 23 and 25 hours; gaps reject and folds choose earlier', () => {
  const spring = { year: 2026, month: 3, day: 8 };
  assert.equal(campusInstant({ ...spring, day: 9 }).getTime() - campusInstant(spring).getTime(), 23 * 3600000);
  assert.throws(() => campusInstant(spring, 150), RangeError);
  const fall = { year: 2026, month: 11, day: 1 };
  assert.equal(campusInstant({ ...fall, day: 2 }).getTime() - campusInstant(fall).getTime(), 25 * 3600000);
  assert.equal(campusInstant(fall, 90).toISOString(), '2026-11-01T06:30:00.000Z');
  assert.equal(campusInstant(fall, 150).toISOString(), '2026-11-01T08:30:00.000Z');
});

test('day lists begin on campus today even at 11:30 PM Pacific', () => {
  const now = '2026-07-02T06:30:00Z';
  assert.deepEqual(campusDays(2, now), [
    { year: 2026, month: 7, day: 2, dayOfWeek: 4 },
    { year: 2026, month: 7, day: 3, dayOfWeek: 5 },
  ]);
  assert.equal(formatCampusSession('2026-07-02T20:00:00Z', now), 'Today · ' + formatCampusTime('2026-07-02T20:00:00Z'));
  assert.deepEqual(campusDays(0, now), []);
});

test('CT label compares offsets at the session instant', () => {
  for (const iso of ['2026-01-15T21:00:00Z', '2026-07-15T20:00:00Z', '2026-03-08T08:30:00Z']) {
    const at = new Date(iso);
    const p = campusParts(at);
    const offset = (at.getTime() - Date.UTC(p.year, p.month - 1, p.day, 0, p.minutes)) / 60000;
    const suffix = at.getTimezoneOffset() === offset ? '' : ' CT';
    assert.equal(campusTimeZoneLabel(at), suffix);
    assert.equal(formatCampusTime(at), formatCampusTime(at, false) + suffix);
  }
});

test('invalid dates and slot labels fail explicitly', () => {
  assert.throws(() => campusParts('invalid'), RangeError);
  assert.throws(() => campusSlotISO({ year: 2026, month: 2, day: 30 }, '3:00 PM'), RangeError);
  assert.throws(() => campusSlotISO({ year: 2026, month: 1, day: 1 }, ''), RangeError);
  assert.throws(() => campusInstant({ year: 2026, month: 1, day: 1 }, 1440), RangeError);
});

test('session prose uses a long campus weekday and time, including the CT label rule', () => {
  const at = '2026-07-03T04:00:00Z';
  assert.equal(formatCampusSessionWhen(at), `Thursday at ${formatCampusTime(at)}`);
});

test('slot previews format valid times and preserve invalid or nonexistent labels', () => {
  const day = { year: 2026, month: 3, day: 8 };
  assert.equal(tryCampusSlotISO(day, '3:00 PM'), campusSlotISO(day, '3:00 PM'));
  assert.equal(formatCampusSlot(day, '3:00 PM'), formatCampusTime(campusSlotISO(day, '3:00 PM')));
  for (const slot of ['', 'not a time', '2:30 AM', '2:30 AM CT']) {
    assert.equal(tryCampusSlotISO(day, slot), undefined);
    assert.equal(formatCampusSlot(day, slot), slot);
    assert.throws(() => campusSlotISO(day, slot), RangeError);
  }
});
