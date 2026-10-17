/** scheduledAt ISO → "Today · 3:00 PM" style label used on session cards. */
export function formatSessionTime(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const day = sameDay(d, today)
    ? 'Today'
    : sameDay(d, tomorrow)
      ? 'Tomorrow'
      : d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  return `${day} · ${time}`;
}

export function sessionDayAndTime(
  scheduledAt: string | undefined,
  fallback: { day: string; time: string },
): { day: string; time: string } {
  if (scheduledAt === undefined) return fallback;
  const [day, time] = formatSessionTime(scheduledAt).split(' · ');
  return { day: day!, time: time! };
}
