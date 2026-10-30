import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Booking } from '@noot/core';
import { blankSessionFields, draftFromBooking } from '../lib/bookingDraft.ts';

const fixture: Booking = {
  id: 'booking-1',
  studentId: 'student-1',
  tutorId: 'tutor-1',
  subject: 'MATH 125',
  scheduledAt: '2026-10-16T13:00:00.000Z',
  rescheduleProposedAt: null,
  rescheduleProposedBy: null,
  durationMinutes: 60,
  price: 40,
  creditApplied: 0,
  platformFee: 7,
  tutorPayoutAmount: 33,
  sessionType: 'video',
  meetingLink: null,
  location: null,
  status: 'confirmed',
  acceptBy: null,
  acceptedAt: null,
  cancelReason: null,
  declineNote: null,
  requestNote: 'Need help with chain rule',
  cancellationDeadline: '2026-10-16T12:00:00.000Z',
  cancelledAt: null,
  refundStatus: 'not_applicable',
  stripePaymentIntentId: null,
  createdAt: '2026-10-15T12:00:00.000Z',
  updatedAt: '2026-10-15T12:00:00.000Z',
};

test('draftFromBooking carries the student request note', () => {
  assert.equal(draftFromBooking(fixture).requestNote, 'Need help with chain rule');
});

test('draftFromBooking preserves a null request note', () => {
  assert.equal(draftFromBooking({ ...fixture, requestNote: null }).requestNote, null);
});

test('draftFromBooking does not set draft-only student fields', () => {
  const draft = draftFromBooking(fixture);
  assert.equal(draft.slot, undefined);
  assert.equal(draft.dayIndex, undefined);
  assert.equal(draft.message, undefined);
  assert.equal(draft.tag, undefined);
});

test('draftFromBooking and blankSessionFields have the same keys', () => {
  assert.deepEqual(
    Object.keys(draftFromBooking(fixture)).sort(),
    Object.keys(blankSessionFields()).sort(),
  );
});
