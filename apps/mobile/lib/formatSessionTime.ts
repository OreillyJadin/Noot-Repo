import { formatCampusSession } from '@noot/core';
export function formatSessionTime(iso: string): string {
  return formatCampusSession(iso);
}

export function sessionDayAndTime(
  scheduledAt: string | undefined,
  fallback: { day: string; time: string },
): { day: string; time: string } {
  if (scheduledAt === undefined || Number.isNaN(Date.parse(scheduledAt))) return fallback;
  const [day, time] = formatSessionTime(scheduledAt).split(' · ');
  return { day: day!, time: time! };
}
