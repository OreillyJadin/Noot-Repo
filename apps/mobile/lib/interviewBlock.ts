// Where a tutor's interview with the noot team sits on their calendar (ERR-032). Pure — see
// test/interviewBlock.test.ts.
//
// The calendar shows a fixed column of times per day ("9:00 AM", "10:30 AM", …). An interview
// is a start time held for INTERVIEW_MINUTES; it blocks every row whose time falls inside
// that hour, and the row it starts during, so no part of it reads as open for booking.

/** Matches INTERVIEW_MINUTES in supabase/functions/_shared/booking.ts, which enforces it. */
export const INTERVIEW_MINUTES = 60;

/** "10:30 AM" → minutes since midnight; null for anything else. */
export function slotMinutes(label: string): number | null {
  const m = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(label.trim());
  if (!m) return null;
  const h = Number(m[1]) % 12 + (m[3] === 'PM' ? 12 : 0);
  return h * 60 + Number(m[2]);
}

/**
 * The calendar rows an interview starting at `at` (the phone's local time) takes up, out of
 * that day's `slots` (in order). Empty if it starts after the last row has ended its day.
 */
export function interviewBlockedSlots(at: Date, slots: string[]): string[] {
  const start = at.getHours() * 60 + at.getMinutes();
  const end = start + INTERVIEW_MINUTES;
  const times = slots.map((label) => ({ label, min: slotMinutes(label) }));
  return times
    .filter(({ min }, i) => {
      if (min == null) return false;
      const next = times.slice(i + 1).find((t) => t.min != null)?.min ?? 24 * 60;
      // The row starts during the interview, or the interview starts during the row.
      return (min >= start && min < end) || (start >= min && start < next);
    })
    .map(({ label }) => label);
}

/** "3:00 PM – 4:00 PM" for an interview starting at `at`. */
export function interviewRange(at: Date): string {
  const fmt = (d: Date) => {
    const h = d.getHours();
    return `${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  };
  return `${fmt(at)} – ${fmt(new Date(at.getTime() + INTERVIEW_MINUTES * 60 * 1000))}`;
}
