export function responseLabel(minutes: number | null): string | null {
  if (minutes == null) return null;
  if (minutes <= 60) return 'Usually responds within an hour';
  if (minutes <= 240) return 'Usually responds within a few hours';
  if (minutes <= 720) return 'Usually responds within 12 hours';
  if (minutes <= 1440) return 'Usually responds within a day';
  return null;
}
