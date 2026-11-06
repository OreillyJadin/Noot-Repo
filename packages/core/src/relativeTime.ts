const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 60 * 60],
  ['month', 30 * 24 * 60 * 60],
  ['week', 7 * 24 * 60 * 60],
  ['day', 24 * 60 * 60],
  ['hour', 60 * 60],
  ['minute', 60],
];

export function formatRelativeTime(iso: string | null, now = Date.now()): string {
  if (!iso) return 'Never';
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return 'Never';

  const seconds = Math.round((timestamp - now) / 1000);
  if (Math.abs(seconds) < 60) return 'now';

  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const unit = UNITS.find(([, size]) => Math.abs(seconds) >= size);
  if (unit) return formatter.format(Math.round(seconds / unit[1]), unit[0]);
  return formatter.format(seconds, 'second');
}
