import type { Tutor } from './data';
import type { BookingDraft } from './store';

export function bookAgainDraft(tutor: Tutor, course: string, durationMinutes: number): {
  draft: BookingDraft;
  route: '/b2' | '/b3';
} {
  const teachesCourse = tutor.courses.some(([code]) => code === course);
  return {
    draft: { tutor, course: teachesCourse ? course : tutor.courses[0]?.[0], lengthMin: durationMinutes },
    route: teachesCourse ? '/b3' : '/b2',
  };
}
