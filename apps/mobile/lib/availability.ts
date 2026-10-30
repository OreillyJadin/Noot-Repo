// Turns a tutor's recurring weekly availability windows (api.tutors.getAvailability)
// into the concrete per-day slot maps the booking + calendar screens render. This is
// the real replacement for the old client-side slotsFor() mock generator.
import { campusInstant, campusParts, campusSlotISO, formatCampusTime, mergeAvailabilityWindows, type BusyTime, type TutorAvailability } from '@noot/core';
import { DAYS, MONTHS, buildDays } from './data';

/** "14:00" / "14:30" → minutes since midnight. */
function parseHM(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** minutes since midnight → "2:00 PM" (matches the ported slot-label style). */
export function fmtSlot(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

/**
 * Map weekly windows onto the DAYS window, producing hourly start times inside each
 * window: { dayIndex -> ["12:00 PM", "1:00 PM", …] }. Days with no matching window are
 * omitted (so the picker can grey them out).
 *
 * Slots earlier than now on day 0 ("Today") are dropped: the booking picker defaults to
 * a day, so offering a time that has already passed sends the student all the way to
 * payment before the server refuses it with "That time is in the past".
 */
export function slotsFromWindows(windows: TutorAvailability[], lengthMin = 60, now = new Date()): Record<number, string[]> {
  const map: Record<number, string[]> = {};
  const mergedWindows = mergeAvailabilityWindows(windows);
  const minutesNow = campusParts(now).minutes;
  for (const d of buildDays(now)) {
    const dayWindows = mergedWindows.filter((w) => w.dayOfWeek === d.dowNum);
    if (dayWindows.length === 0) continue;
    const starts = new Set<number>();
    for (const w of dayWindows) {
      const end = parseHM(w.endTime);
      for (let m = parseHM(w.startTime); m + lengthMin <= end; m += 60) {
        if (d.i === 0 && m <= minutesNow) continue; // already passed today
        try {
          const at = campusInstant({ year: d.year, month: MONTHS.indexOf(d.month) + 1, day: d.dom }, m);
          const endParts = campusParts(at.getTime() + lengthMin * 60_000);
          if (endParts.day !== d.dom || endParts.minutes > end) continue;
          starts.add(m);
        } catch { /* Spring-forward gaps have no instant to book. */ }
      }
    }
    if (starts.size) map[d.i] = [...starts].sort((a, b) => a - b).map((m) => formatCampusTime(campusInstant({ year: d.year, month: MONTHS.indexOf(d.month) + 1, day: d.dom }, m)));
  }
  return map;
}

/** The soonest day/slot across the window, for "Next available: …" summaries. */
export function nextFromWindows(windows: TutorAvailability[]): { dayIndex: number; label: string } {
  const slots = slotsFromWindows(windows);
  const day = DAYS.find((d) => (slots[d.i]?.length ?? 0) > 0);
  if (!day) return { dayIndex: 99, label: 'No upcoming availability' };
  const time = slots[day.i]![0]!;
  const dayLabel = day.i === 0 ? 'Today' : day.i === 1 ? 'Tomorrow' : day.dow;
  return { dayIndex: day.i, label: `${dayLabel} ${time}` };
}

/** Parse a rendered clock label into minutes since midnight. */
function parseSlotLabel(label: string): number | null {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)(?: CT)?$/i.exec(label.trim());
  if (!m) return null;
  let hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 1 || hh > 12 || mm > 59) return null;
  const pm = m[3]!.toUpperCase() === 'PM';
  if (pm && hh !== 12) hh += 12;
  if (!pm && hh === 12) hh = 0;
  return hh * 60 + mm;
}

/** Which slots overlap busy ranges: { dayIndex -> Set<label> }. */
export function bookedSlots(
  slots: Record<number, string[]>,
  busy: BusyTime[],
  lengthMin = 60,
): Record<number, Set<string>> {
  const ranges = busy
    .map(({ startsAt, endsAt }) => [Date.parse(startsAt), Date.parse(endsAt)] as const)
    .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && start < end);
  const result: Record<number, Set<string>> = {};

  for (const [dayKey, labels] of Object.entries(slots)) {
    const day = DAYS[Number(dayKey)];
    if (!day) continue;
    const month = MONTHS.indexOf(day.month);
    const booked = new Set<string>();
    for (const label of labels) {
      const minutes = parseSlotLabel(label);
      if (minutes == null) continue;
      const start = Date.parse(campusSlotISO({ year: day.year, month: month + 1, day: day.dom }, label));
      const end = start + lengthMin * 60_000;
      if (ranges.some(([busyStart, busyEnd]) => start < busyEnd && busyStart < end)) {
        booked.add(label);
      }
    }
    if (booked.size > 0) result[Number(dayKey)] = booked;
  }
  return result;
}

/** Does a rendered clock label (e.g. "3:00 PM") fall inside a window for that weekday? */
export function isTimeOpen(windows: TutorAvailability[], dowNum: number, label: string): boolean {
  const minutes = parseSlotLabel(label);
  return minutes != null && windows.some(
    (w) => w.dayOfWeek === dowNum && parseHM(w.startTime) <= minutes && minutes < parseHM(w.endTime),
  );
}
