// Interview times to offer an admin, taken from the tutor's own weekly availability
// (ERR-005). Pure — see test/interviewSlots.test.ts.
//
// Availability is stored as recurring windows ("Tue 14:00–17:00"), read in the phone's local
// time the same way the booking calendar reads them (lib/availability.ts). One suggestion
// per window, at its start, soonest first — a spread of days to choose from rather than
// every half hour of the first afternoon.

/** The part of a tutor's availability this needs. */
export interface WeeklyWindow {
  dayOfWeek: number; // 0-6, Sun = 0
  startTime: string; // "14:00"
  endTime: string;
}

/** Don't offer something the tutor could not reasonably make. */
const MIN_NOTICE_MS = 12 * 60 * 60 * 1000;
const LOOKAHEAD_DAYS = 14;
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parseHM(s: string): [number, number] {
  const [h, m] = s.split(':').map(Number);
  return [h ?? 0, m ?? 0];
}

/** The next `count` window starts at least 12 hours out, within two weeks, soonest first. */
export function nextInterviewSlots(windows: WeeklyWindow[], now: Date, count = 6): Date[] {
  const earliest = now.getTime() + MIN_NOTICE_MS;
  const out: Date[] = [];
  for (let d = 0; d <= LOOKAHEAD_DAYS; d++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d);
    for (const w of windows) {
      if (w.dayOfWeek !== day.getDay()) continue;
      const [h, m] = parseHM(w.startTime);
      const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
      if (at.getTime() >= earliest) out.push(at);
    }
  }
  const unique = [...new Map(out.map((at) => [at.getTime(), at])).values()];
  return unique.sort((a, b) => a.getTime() - b.getTime()).slice(0, count);
}

/** "Tue, Oct 6 · 3:00 PM" in the phone's local time. */
export function interviewLabel(at: Date): string {
  const h = at.getHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const time = `${h12}:${String(at.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  return `${DOW[at.getDay()]}, ${MONTHS[at.getMonth()]} ${at.getDate()} · ${time}`;
}
