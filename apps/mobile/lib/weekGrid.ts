// The weekly availability grid — which hours of which days a tutor is open — and its
// conversion to and from the weekly windows the DB stores (tutor_availability). Shared by
// onboarding step 5 and Edit Availability through <AvailabilityEditor>, so both offer the
// same hour-by-hour choice (ERR-013: step 5 used to be five 3-hour blocks while Edit
// Availability was hourly). Pure, so it's tested (apps/mobile/test/weekGrid.test.ts).
export type Day = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
export type WeekGrid = Record<Day, Set<number>>;
export type AvailabilityWindow = { dayOfWeek: number; startTime: string; endTime: string };

export const AV_DAYS: Day[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAYS: Day[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

// dayOfWeek per the API contract: 0 = Sunday … 6 = Saturday.
const DAY_OF_WEEK: Record<Day, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// Selectable hours, as the hour a session would START. 8 = 8–9am … 22 = 10–11pm. The last
// hour is there because step 5's old "8p" block saved 20:00–23:00: without it, editing such
// a week would quietly drop its 10–11pm hour.
const FIRST_HOUR = 8;
const LAST_HOUR = 22;
export const HOURS: number[] = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) => FIRST_HOUR + i);

/** 9 → "09:00" */
function hhmm(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}

/** "HH:MM" → minutes since midnight (tolerates a trailing ":SS"). */
function hm(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function emptyGrid(): WeekGrid {
  const m = {} as WeekGrid;
  AV_DAYS.forEach((d) => { m[d] = new Set<number>(); });
  return m;
}

/** Hours open across the whole week. */
export function totalHours(grid: WeekGrid): number {
  return AV_DAYS.reduce((n, d) => n + grid[d].size, 0);
}

/**
 * Saved windows → the hour grid. An hour is on only when a window covers all of it, so a
 * window written at any granularity (including the old 3- and 4-hour blocks) round-trips
 * into the right hours.
 */
export function gridFromWindows(windows: AvailabilityWindow[]): WeekGrid {
  const grid = emptyGrid();
  for (const day of AV_DAYS) {
    for (const h of HOURS) {
      const start = h * 60;
      const covered = windows.some(
        (w) => w.dayOfWeek === DAY_OF_WEEK[day] && hm(w.startTime) <= start && hm(w.endTime) >= start + 60,
      );
      if (covered) grid[day].add(h);
    }
  }
  return grid;
}

/** Hour grid → weekly windows, merging runs of consecutive hours into one window. */
export function windowsFromGrid(grid: WeekGrid): AvailabilityWindow[] {
  const out: AvailabilityWindow[] = [];
  for (const day of AV_DAYS) {
    const hours = [...grid[day]].sort((a, b) => a - b);
    let runStart: number | null = null;
    let prev: number | null = null;
    const flush = () => {
      if (runStart != null && prev != null) {
        out.push({ dayOfWeek: DAY_OF_WEEK[day], startTime: hhmm(runStart), endTime: hhmm(prev + 1) });
      }
      runStart = null;
      prev = null;
    };
    for (const h of hours) {
      if (runStart == null) { runStart = h; prev = h; continue; }
      if (h === (prev as number) + 1) { prev = h; continue; }
      flush();
      runStart = h;
      prev = h;
    }
    flush();
  }
  return out;
}
