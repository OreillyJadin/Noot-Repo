import { formatCampusSession } from '@noot/core';
export const formatSessionTime = formatCampusSession;

export function sessionDayAndTime(
  scheduledAt: string | undefined,
  fallback: { day: string; time: string },
): { day: string; time: string } {
  if (scheduledAt === undefined) return fallback;
  const [day, time] = formatSessionTime(scheduledAt).split(' · ');
  return { day: day!, time: time! };
}
