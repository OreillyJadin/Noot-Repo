// The onboarding availability grid (T5): 7 days × five 3-hour blocks, and its conversion
// to and from the weekly windows the DB stores (tutor_availability). Pure, so it's tested
// (apps/mobile/test/weekGrid.test.ts).
export const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
export const ROW_LABELS = ['8a', '11a', '2p', '5p', '8p'];
/** Each row is a 3-hour block; index matches ROW_LABELS. */
export const ROW_START_HOUR = [8, 11, 14, 17, 20];
export const BLOCK_HOURS = 3;
/** Column 0 is Monday, but the DB stores day_of_week with Sunday = 0. */
const COL_TO_DOW = [1, 2, 3, 4, 5, 6, 0];
export const EMPTY_GRID: number[][] = ROW_LABELS.map(() => DAY_LABELS.map(() => 0));

const hhmm = (h: number) => `${String(h).padStart(2, '0')}:00`;

/**
 * Turn the painted grid into the weekly windows the DB stores, merging vertically
 * adjacent blocks on the same day into one window (8a+11a → 08:00-14:00) so we don't
 * write three rows where one will do.
 */
export function windowsFromGrid(grid: number[][]) {
  const out: { dayOfWeek: number; startTime: string; endTime: string }[] = [];
  for (let col = 0; col < DAY_LABELS.length; col++) {
    let runStart: number | null = null;
    for (let row = 0; row <= grid.length; row++) {
      const on = row < grid.length && grid[row]![col] === 1;
      if (on && runStart === null) runStart = row;
      if (!on && runStart !== null) {
        out.push({
          dayOfWeek: COL_TO_DOW[col]!,
          startTime: hhmm(ROW_START_HOUR[runStart]!),
          endTime: hhmm(ROW_START_HOUR[row - 1]! + BLOCK_HOURS),
        });
        runStart = null;
      }
    }
  }
  return out;
}

// Shared step header for T2–T9. Defined locally per-screen (no shared file).

const parseHour = (hm: string) => {
  const [h, m] = hm.split(':').map(Number);
  return (h ?? 0) + (m ?? 0) / 60;
};

/**
 * Paint the grid from saved windows. A block is on only when a window covers all of it —
 * so what step 5 saved reads back exactly, and finer hours set in Edit Availability never
 * light up a block they only partly cover.
 */
export function gridFromWindows(windows: { dayOfWeek: number; startTime: string; endTime: string }[]): number[][] {
  return ROW_LABELS.map((_, row) =>
    DAY_LABELS.map((_, col) => {
      const start = ROW_START_HOUR[row]!;
      const end = start + BLOCK_HOURS;
      const covered = windows.some(
        (w) => w.dayOfWeek === COL_TO_DOW[col] && parseHour(w.startTime) <= start && parseHour(w.endTime) >= end,
      );
      return covered ? 1 : 0;
    }),
  );
}
