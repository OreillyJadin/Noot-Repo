// Turns a tutor's recurring weekly availability windows (api.tutors.getAvailability)
// into the concrete per-day slot maps the booking + calendar screens render. This is
// the real replacement for the old client-side slotsFor() mock generator.
import type { TutorAvailability } from '@noot/core';
import { DAYS } from './data';

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
 * Map weekly windows onto the fixed 14-day DAYS window, producing hourly start
 * times inside each window: { dayIndex -> ["12:00 PM", "1:00 PM", …] }. Days with
 * no matching window are omitted (so the picker can grey them out).
 */
export function slotsFromWindows(windows: TutorAvailability[]): Record<number, string[]> {
  const map: Record<number, string[]> = {};
  for (const d of DAYS) {
    const dayWindows = windows.filter((w) => w.dayOfWeek === d.dowNum);
    if (dayWindows.length === 0) continue;
    const starts = new Set<number>();
    for (const w of dayWindows) {
      const end = parseHM(w.endTime);
      for (let m = parseHM(w.startTime); m < end; m += 60) starts.add(m);
    }
    if (starts.size) map[d.i] = [...starts].sort((a, b) => a - b).map(fmtSlot);
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

/** Does a rendered clock label (e.g. "3:00 PM") fall inside a window for that weekday? */
export function isTimeOpen(windows: TutorAvailability[], dowNum: number, label: string): boolean {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(label.trim());
  if (!m) return false;
  let hh = Number(m[1]);
  const mm = Number(m[2]);
  const pm = m[3]!.toUpperCase() === 'PM';
  if (pm && hh !== 12) hh += 12;
  if (!pm && hh === 12) hh = 0;
  const t = hh * 60 + mm;
  return windows.some((w) => w.dayOfWeek === dowNum && parseHM(w.startTime) <= t && t < parseHM(w.endTime));
}
