import type { TutorDemand } from './models';

function number(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function mapTutorDemand(payload: unknown): TutorDemand {
  const row = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
  const requests = Array.isArray(row.openRequests) ? row.openRequests : [];

  return {
    profileViews: number(row.profileViews),
    uniqueViewers: number(row.uniqueViewers),
    openRequests: requests.map((value) => {
      const item = value && typeof value === 'object' ? value as Record<string, unknown> : {};
      return { courseCode: String(item.courseCode ?? ''), requests: number(item.requests) };
    }),
    openRequestTotal: number(row.openRequestTotal),
    earned: number(row.earnedCents) / 100,
    sessionsCompleted: number(row.sessionsCompleted),
  };
}
