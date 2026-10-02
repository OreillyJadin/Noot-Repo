// A real booking → the in-memory booking draft the tutor-side screens read (tb2, chat_tutor).
// The tutor screens used to open those with whatever draft happened to be in the store —
// usually none — so session details and the chat had nothing to show (tracker B2).
import type { Booking } from '@noot/core';
import type { BookingDraft } from './store';

export function draftFromBooking(b: Booking): Partial<BookingDraft> {
  return {
    bookingId: b.id,
    studentId: b.studentId,
    course: b.subject,
    scheduledAt: b.scheduledAt,
    location: b.location ?? undefined,
    sessionType: b.sessionType === 'video' ? 'video' : 'in_person',
    lengthMin: b.durationMinutes,
  };
}
