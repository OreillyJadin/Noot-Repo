import { campusDays, campusInstant, formatCampusDate, formatCampusTime } from '@noot/core';
// Interview times to offer an admin, taken from the tutor's own weekly availability
// (ERR-005). Pure — see test/interviewSlots.test.ts.
//
// Availability is stored as recurring windows ("Tue 14:00–17:00"), read in campus
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

/** "14:30" (or "14:30:00") → [14, 30]; null for anything that isn't a time. */
function parseHM(s: string): [number, number] | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(s.trim());
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** The next `count` window starts at least 12 hours out, within two weeks, soonest first. */
export function nextInterviewSlots(windows: WeeklyWindow[], now: Date, count = 6): Date[] {
  const earliest = now.getTime() + MIN_NOTICE_MS;
  const out: Date[] = [];
  for (const day of campusDays(LOOKAHEAD_DAYS, now)) {
    for (const w of windows) {
      if (w.dayOfWeek !== day.dayOfWeek) continue;
      const hm = parseHM(w.startTime);
      if (!hm) continue;
      let at: Date;
      try { at = campusInstant(day, hm[0] * 60 + hm[1]); } catch { continue; }
      if (at.getTime() >= earliest) out.push(at);
    }
  }
  const unique = [...new Map(out.map((at) => [at.getTime(), at])).values()];
  return unique.sort((a, b) => a.getTime() - b.getTime()).slice(0, count);
}

/** "Tue, Oct 6 · 3:00 PM" in campus time. */
export function interviewLabel(at: Date): string {
  return `${formatCampusDate(at)} · ${formatCampusTime(at)}`;
}
