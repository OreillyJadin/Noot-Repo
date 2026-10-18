// A real booking → the in-memory booking draft the tutor-side screens read (tb2, chat_tutor).
// The tutor screens used to open those with whatever draft happened to be in the store —
// usually none — so session details and the chat had nothing to show (tracker B2).
import type { Booking } from '@noot/core';
import type { BookingDraft } from './store';

export function draftFromBooking(b: Booking): Partial<BookingDraft> {
  return {
    bookingId: b.id,
    studentId: b.studentId,
    tutorId: b.tutorId,
    course: b.subject,
    scheduledAt: b.scheduledAt,
    acceptBy: b.acceptBy,
    acceptedAt: b.acceptedAt,
    status: b.status,
    cancelReason: b.cancelReason,
    declineNote: b.declineNote,
    rescheduleProposedAt: b.rescheduleProposedAt,
    rescheduleProposedBy: b.rescheduleProposedBy,
    location: b.location ?? undefined,
    sessionType: b.sessionType === 'video' ? 'video' : 'in_person',
    lengthMin: b.durationMinutes,
    price: b.price,
    studentFee: b.studentFee,
    creditApplied: b.creditApplied,
    tutorPayoutAmount: b.tutorPayoutAmount,
  };
}

/**
 * The same fields draftFromBooking fills, all undefined — spread into a
 * patchBooking() call when opening a thread that has no upcoming booking, so a
 * previously opened session's details can't leak into this conversation.
 * Keep the key set in sync with draftFromBooking above.
 */
export function blankSessionFields(): Partial<BookingDraft> {
  return {
    bookingId: undefined,
    studentId: undefined,
    tutorId: undefined,
    course: undefined,
    scheduledAt: undefined,
    acceptBy: undefined,
    acceptedAt: undefined,
    status: undefined,
    cancelReason: undefined,
    declineNote: undefined,
    rescheduleProposedAt: undefined,
    rescheduleProposedBy: undefined,
    location: undefined,
    sessionType: undefined,
    lengthMin: undefined,
    price: undefined,
    studentFee: undefined,
    creditApplied: undefined,
    tutorPayoutAmount: undefined,
  };
}
