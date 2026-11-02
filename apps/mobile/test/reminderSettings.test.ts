import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DAY_OF_TIMES, masterReminderSettings } from '../lib/reminderSettings.ts';

test('day-of choices cover 6 AM through noon in half-hour steps', () => {
  assert.equal(DAY_OF_TIMES.length, 13);
  assert.deepEqual(DAY_OF_TIMES[0], { value: '06:00', label: '6:00 AM' });
  assert.deepEqual(DAY_OF_TIMES.at(-1), { value: '12:00', label: '12:00 PM' });
  assert.ok(DAY_OF_TIMES.some((option) => option.value === '07:00'));
  assert.ok(DAY_OF_TIMES.some((option) => option.value === '09:30'));
});

test('master off uses existing empty state and restores choices during the screen visit', () => {
  const saved = { minutesBefore: [1440, 30], morningOf: false, dayOfTime: '09:30' };
  const off = masterReminderSettings(saved, false, null);
  assert.deepEqual(off, { minutesBefore: [], morningOf: false, dayOfTime: '09:30' });
  assert.deepEqual(masterReminderSettings(off, true, saved), saved);
  assert.deepEqual(saved.minutesBefore, [1440, 30]);
  assert.deepEqual(masterReminderSettings(off, true, null), { minutesBefore: [60], morningOf: true, dayOfTime: '09:30' });
});

test('reminder card keeps legacy day offsets visible only while selected and reports errors', () => {
  const source = readFileSync(new URL('../app/notifications.tsx', import.meta.url), 'utf8');
  assert.match(source, /minutes !== 1440 \|\| reminderSettings.minutesBefore.includes\(1440\)/);
  assert.match(source, /accessibilityRole="checkbox"/);
  assert.match(source, /setReminderSettings\(previous\)/);
  assert.match(source, /Up to 4 reminders/);
});
