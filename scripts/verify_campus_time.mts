import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { campusDays, campusInstant, campusParts, campusSlotISO, formatCampusTime, formatCampusSession } from '../packages/core/src/index.ts';
import { slotsFromWindows } from '../apps/mobile/lib/availability.ts';

const independent = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
});
const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
let checked = 0;
for (const now of ['2026-03-07T18:00:00Z', '2026-10-31T18:00:00Z', '2026-07-02T06:30:00Z']) {
  const windows = weekdays.map((_, dayOfWeek) => ({ dayOfWeek, startTime: '01:00', endTime: '17:00' }));
  const slots = slotsFromWindows(windows, 60, new Date(now));
  const days = campusDays(14, now);
  for (const [index, labels] of Object.entries(slots)) {
    const day = days[Number(index)]!;
    for (const label of labels) {
      const iso = campusSlotISO(day, label);
      const parts = Object.fromEntries(independent.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
      const end = Object.fromEntries(independent.formatToParts(new Date(Date.parse(iso) + 3600000)).map((p) => [p.type, p.value]));
      const minutes = Number(parts.hour) * 60 + Number(parts.minute);
      const endMinutes = Number(end.hour) * 60 + Number(end.minute);
      assert.equal(parts.weekday, weekdays[day.dayOfWeek]);
      assert.equal(end.weekday, parts.weekday);
      assert.ok(minutes >= 60 && minutes + 60 <= 1020 && endMinutes <= 1020);
      const serverTime = new Date(iso).toLocaleTimeString('en-US', {
        timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit',
      });
      assert.equal(formatCampusTime(iso, false), serverTime);
      assert.equal(label, formatCampusTime(iso));
      assert.ok(formatCampusSession(iso, now).endsWith(label));
      checked++;
    }
  }
}
assert.deepEqual(campusParts(campusInstant({ year: 2026, month: 7, day: 2 }, 900)).minutes, 900);
console.log(`PASS: ${checked} generated slots match server campus weekday/windows and acceptance-message clock time`);

const paths = [
  'lib/data.ts', 'lib/availability.ts', 'lib/formatSessionTime.ts', 'lib/interviewBlock.ts', 'lib/interviewSlots.ts',
  'app/b3.tsx', 'app/b4.tsx', 'app/xtr.tsx', 'app/chat_tutor.tsx', 'app/tutor_calendar.tsx',
  'app/home.tsx', 'app/tutor_home.tsx', 'app/tutor_sessions.tsx', 'app/history.tsx', 'app/admin_bookings.tsx', 'lib/adminUi.tsx',
];
for (const path of paths) {
  const source = readFileSync(new URL('../apps/mobile/' + path, import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\.getHours\(|\.getDate\(|\.setHours\(|\.toLocale\w*\((?:undefined|\[\])/);
  assert.match(source, /(?:campus|Campus|formatSessionTime)/);
}
const adminUser = readFileSync(new URL('../apps/mobile/app/admin_user.tsx', import.meta.url), 'utf8');
assert.match(adminUser, /formatCampusSession\(booking\.scheduledAt\)/);
const grid = readFileSync(new URL('../apps/mobile/lib/monthGrid.ts', import.meta.url), 'utf8');
assert.match(grid, /campusDayKey\(item\.startsAt\)/);
const calendar = readFileSync(new URL('../apps/mobile/app/admin_calendar.tsx', import.meta.url), 'utf8');
assert.match(calendar, /campusCalendarToday/);
const server = readFileSync(new URL('../supabase/functions/respond-booking-request/index.ts', import.meta.url), 'utf8');
assert.match(server, /timeZone: 'America\/Chicago'/);
assert.match(server, /\) \+ ' CT'/);
console.log(`PASS: ${paths.length + 4} session-time source guards (non-session timestamps intentionally excluded)`);
