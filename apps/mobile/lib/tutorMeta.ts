import type { Tutor } from './data';

export function tutorMeta(tutor: Pick<Tutor, 'courses' | 'year' | 'sessions'>, courseOverride?: string) {
  const course = courseOverride ?? tutor.courses[0]?.[0] ?? '';
  const sessions = `${tutor.sessions} ${tutor.sessions === 1 ? 'session' : 'sessions'}`;
  const details = [tutor.year, sessions].filter(Boolean);
  return {
    course,
    details,
    line: [course, ...details].filter(Boolean).join(' · '),
  };
}
