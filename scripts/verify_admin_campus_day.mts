import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addCampusDays, campusDayKey, campusInstant, campusParts, formatCampusDate } from '../packages/core/src/index.ts';
import { campusCalendarToday, dayKey, groupByDay } from '../apps/mobile/lib/monthGrid.ts';

const cases = [
  ['2026-07-02T04:30:00Z', 'Wednesday, July 1', '2026-07-02T05:00:00.000Z'],
  ['2026-07-02T05:30:00Z', 'Thursday, July 2', '2026-07-03T05:00:00.000Z'],
  ['2026-01-02T05:30:00Z', 'Thursday, January 1', '2026-01-02T06:00:00.000Z'],
  ['2026-01-02T06:30:00Z', 'Friday, January 2', '2026-01-03T06:00:00.000Z'],
  ['2026-03-08T06:30:00Z', 'Sunday, March 8', '2026-03-09T05:00:00.000Z'],
  ['2026-03-08T08:30:00Z', 'Sunday, March 8', '2026-03-09T05:00:00.000Z'],
  ['2026-11-01T06:30:00Z', 'Sunday, November 1', '2026-11-02T06:00:00.000Z'],
  ['2026-11-01T07:30:00Z', 'Sunday, November 1', '2026-11-02T06:00:00.000Z'],
] as const;

const originalTZ = process.env.TZ;
let differentDeviceDays = 0;
try {
  for (const tz of ['UTC', 'America/Los_Angeles', 'America/Chicago', 'Asia/Tokyo', 'Pacific/Kiritimati']) {
    process.env.TZ = tz;
    for (const [instant, expectedDate, expectedEnd] of cases) {
      const now = new Date(instant);
      const date = formatCampusDate(now, { weekday: 'long', month: 'long', day: 'numeric' });
      assert.equal(date, expectedDate, `${tz}: campus header date`);
      const tomorrow = campusInstant(addCampusDays(campusParts(now), 1));
      assert.equal(tomorrow.toISOString(), expectedEnd, `${tz}: upcoming events end at Chicago midnight`);
      assert.equal(dayKey(campusCalendarToday(now)), campusDayKey(now), `${tz}: calendar today matches dashboard day`);
      const event = { startsAt: instant };
      assert.deepEqual(groupByDay([event])[dayKey(campusCalendarToday(now))], [event]);
      if (now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) !== date) differentDeviceDays++;
    }
  }
} finally {
  if (originalTZ === undefined) delete process.env.TZ;
  else process.env.TZ = originalTZ;
}
assert.ok(differentDeviceDays > 0, 'Fixtures must include devices on a different day from campus');

const read = (path: string) => readFileSync(new URL(`../apps/mobile/${path}`, import.meta.url), 'utf8');
const home = read('app/admin_home.tsx');
assert.match(home, /const tomorrow = campusInstant\(addCampusDays\(campusParts\(now\), 1\)\)/);
assert.match(home, /setToday\(now\)/);
assert.match(home, /\.calendar\(now\.toISOString\(\), tomorrow\.toISOString\(\)\)/);
assert.match(home, /const dateSubtitle = `\$\{formatCampusDate\(today, \{ weekday: 'long', month: 'long', day: 'numeric' \}\)\} · CT`/);
assert.match(home, /<AdminLargeHeader\s+title="Admin"\s+subtitle=\{dateSubtitle\}/);
assert.match(home, /<AdminRow title="Nothing else scheduled" subtitle=\{dateSubtitle\} muted/);
assert.doesNotMatch(home, /\.toLocale(?:DateString|String)\(|\.getDate\(|\.setHours\(/);
assert.doesNotMatch(home, /from\s+['"]@supabase\//);

const calendar = read('app/admin_calendar.tsx');
assert.match(calendar, /useState\(\(\) => campusCalendarToday\(\)\)/);
assert.match(calendar, /setToday\(campusCalendarToday\(\)\)/);
assert.match(calendar, /const now = campusCalendarToday\(\)/);
const interviews = read('lib/interviewSlots.ts');
assert.match(interviews, /formatCampusDate\(at\)/);
assert.match(interviews, /formatCampusTime\(at\)/);
assert.match(read('lib/adminUi.tsx'), /formatCampusTime\(event\.startsAt\)/);

console.log(`PASS: admin campus-day dates, ranges and calendar grouping across ${cases.length * 5} timezone/DST cases (${differentDeviceDays} different device days); shared header/empty-state source guards`);
