export const CAMPUS_TZ = 'America/Chicago';
export interface CampusDate { year: number; month: number; day: number }
export type Instant = Date | string | number;
const dateOf = (at: Instant) => new Date(at);
const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CAMPUS_TZ, year: 'numeric', month: 'numeric', day: 'numeric',
  hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
});

export function campusParts(at: Instant = new Date()) {
  const parts = partsFormatter.formatToParts(dateOf(at));
  const get = (name: string) => Number(parts.find((p) => p.type === name)!.value);
  const year = get('year'), month = get('month'), day = get('day');
  return { year, month, day, dayOfWeek: new Date(Date.UTC(year, month - 1, day)).getUTCDay(), minutes: get('hour') * 60 + get('minute') };
}

export function addCampusDays(day: CampusDate, count: number): CampusDate {
  const d = new Date(Date.UTC(day.year, day.month - 1, day.day + count));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** Nonexistent spring-forward times throw; repeated fall-back times use the earlier instant. */
export function campusInstant(day: CampusDate, minutes = 0): Date {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes >= 1440) throw new RangeError('Invalid campus minutes');
  const wall = Date.UTC(day.year, day.month - 1, day.day, 0, minutes);
  const candidates: number[] = [];
  for (const delta of [-86400000, 0, 86400000]) {
    const sample = wall + delta;
    const p = campusParts(sample);
    const offset = Date.UTC(p.year, p.month - 1, p.day, 0, p.minutes) - sample;
    const candidate = wall - offset;
    const c = campusParts(candidate);
    if (c.year === day.year && c.month === day.month && c.day === day.day && c.minutes === minutes) candidates.push(candidate);
  }
  if (!candidates.length) throw new RangeError('Campus time does not exist');
  return new Date(Math.min(...candidates));
}

export function campusDays(count: number, now: Instant = new Date()) {
  const today = campusParts(now);
  return Array.from({ length: count }, (_, i) => {
    const date = addCampusDays(today, i);
    return { ...date, dayOfWeek: campusParts(campusInstant(date)).dayOfWeek };
  });
}

export function campusDayKey(at: Instant): string {
  const p = campusParts(at);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function campusTimeZoneLabel(at: Instant): string {
  const d = dateOf(at);
  const p = campusParts(d);
  const campusOffset = Math.round((Date.UTC(p.year, p.month - 1, p.day, 0, p.minutes) - Math.floor(d.getTime() / 60000) * 60000) / 60000);
  return -d.getTimezoneOffset() === campusOffset ? '' : ' CT';
}

export function formatCampusTime(at: Instant, label = true): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: CAMPUS_TZ, hour: 'numeric', minute: '2-digit' }).format(dateOf(at)) + (label ? campusTimeZoneLabel(at) : '');
}

export function formatCampusDate(at: Instant, options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }): string {
  return new Intl.DateTimeFormat('en-US', { ...options, timeZone: CAMPUS_TZ }).format(dateOf(at));
}

export function formatCampusSession(at: Instant, now: Instant = new Date()): string {
  const key = campusDayKey(at);
  const days = campusDays(2, now);
  const day = key === campusDayKey(campusInstant(days[0]!)) ? 'Today'
    : key === campusDayKey(campusInstant(days[1]!)) ? 'Tomorrow' : formatCampusDate(at);
  return `${day} · ${formatCampusTime(at)}`;
}

export function campusSlotISO(day: CampusDate, slot: string): string {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)(?: CT)?$/i.exec(slot.trim());
  if (!m || Number(m[1]) < 1 || Number(m[1]) > 12 || Number(m[2]) > 59) throw new RangeError('Invalid slot');
  const minutes = (Number(m[1]) % 12 + (m[3]!.toUpperCase() === 'PM' ? 12 : 0)) * 60 + Number(m[2]);
  return campusInstant(day, minutes).toISOString();
}
