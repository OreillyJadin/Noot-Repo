import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Booking, Conversation } from '@noot/core';
import type { Tutor } from '../lib/data.ts';
import { targetFor } from '../lib/notificationTarget.ts';

const now = Date.parse('2026-10-16T12:00:00.000Z');

function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'booking-1',
    studentId: 'student-1',
    tutorId: 'tutor-1',
    subject: 'MATH 125',
    scheduledAt: new Date(now + 60 * 60 * 1000).toISOString(),
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
    cancellationDeadline: new Date(now).toISOString(),
    cancelledAt: null,
    refundStatus: 'not_applicable',
    stripePaymentIntentId: null,
    createdAt: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'conversation-1',
    kind: 'direct',
    studentId: 'student-1',
    tutorId: 'tutor-1',
    createdAt: new Date(now).toISOString(),
    ...overrides,
  };
}

const tutor: Tutor = {
  id: 'tutor-1',
  name: 'Sara T.',
  year: 'Junior',
  major: 'Finance',
  rating: 5,
  sessions: 10,
  rate: 30,
  verified: true,
  verifiedGrade: 'A',
  next: 0,
  nextLabel: '',
  bio: '',
  courses: [],
};

const notice = (type: string, data: Record<string, unknown> = {}, title = '') => ({ type, data, title });

test('a message to the tutor opens their student chat with the student draft', () => {
  const target = targetFor(notice('message', { conversationId: 'conversation-1' }), {
    uid: 'tutor-1',
    currentRole: 'student',
    conversation: conversation(),
    now,
  });
  assert.equal(target.role, 'tutor');
  assert.equal(target.route, '/chat_tutor');
  assert.deepEqual(target.draft, { studentId: 'student-1' });
});

test('a message to the student opens chat with the tutor draft', () => {
  const target = targetFor(notice('message', { conversationId: 'conversation-1' }), {
    uid: 'student-1',
    currentRole: 'tutor',
    conversation: conversation(),
    tutor,
    now,
  });
  assert.equal(target.role, 'student');
  assert.equal(target.route, '/chat');
  assert.deepEqual(target.draft, { tutor });
});

test('a student message without a tutor summary falls back to notifications', () => {
  const target = targetFor(notice('message'), {
    uid: 'student-1',
    currentRole: 'student',
    conversation: conversation(),
    now,
  });
  assert.equal(target.role, 'student');
  assert.equal(target.route, '/notifications');
});

test('an admin-room message falls back to notifications', () => {
  const target = targetFor(notice('message'), {
    uid: 'admin-1',
    currentRole: 'student',
    conversation: conversation({ kind: 'admin', studentId: null, tutorId: null }),
    now,
  });
  assert.equal(target.route, '/notifications');
});

test('a tutor request notice opens chat with the booking draft', () => {
  const target = targetFor(notice('booking', { bookingId: 'booking-1' }, 'New session request'), {
    uid: 'tutor-1',
    currentRole: 'student',
    booking: booking({ status: 'pending' }),
    now,
  });
  assert.equal(target.role, 'tutor');
  assert.equal(target.route, '/chat_tutor');
  assert.equal(target.draft?.studentId, 'student-1');
  assert.equal(target.draft?.bookingId, 'booking-1');
});

test('a confirmed booking notice opens the student chat when its tutor is available', () => {
  const target = targetFor(notice('booking', { bookingId: 'booking-1' }, 'Session confirmed'), {
    uid: 'student-1',
    currentRole: 'tutor',
    booking: booking(),
    tutor,
    now,
  });
  assert.equal(target.role, 'student');
  assert.equal(target.route, '/chat');
  assert.deepEqual(target.draft, { tutor, bookingId: 'booking-1' });
});

test('a confirmed booking notice without a tutor summary falls back to student sessions', () => {
  const target = targetFor(notice('booking', { bookingId: 'booking-1' }, 'Session confirmed'), {
    uid: 'student-1',
    currentRole: 'student',
    booking: booking(),
    now,
  });
  assert.equal(target.route, '/sessions');
});

test('a regular confirmed future tutor booking opens its details with the booking draft', () => {
  const target = targetFor(notice('booking', { bookingId: 'booking-1' }, 'Session reminder'), {
    uid: 'tutor-1',
    currentRole: 'tutor',
    booking: booking(),
    now,
  });
  assert.equal(target.route, '/tb2');
  assert.equal(target.draft?.bookingId, 'booking-1');
});

test('a cancelled tutor booking opens the Past tab', () => {
  const target = targetFor(notice('booking', { bookingId: 'booking-1' }, 'Session cancelled'), {
    uid: 'tutor-1',
    currentRole: 'tutor',
    booking: booking({ status: 'cancelled' }),
    now,
  });
  assert.deepEqual(target.route, { pathname: '/tutor_sessions', params: { tab: 'past' } });
});

test('a future confirmed student booking opens Sessions', () => {
  const target = targetFor(notice('booking', { bookingId: 'booking-1' }), {
    uid: 'student-1',
    currentRole: 'student',
    booking: booking(),
    now,
  });
  assert.equal(target.route, '/sessions');
});

test('a completed student booking opens the Past tab', () => {
  const target = targetFor(notice('booking', { bookingId: 'booking-1' }), {
    uid: 'student-1',
    currentRole: 'student',
    booking: booking({ status: 'completed', scheduledAt: new Date(now - 60_000).toISOString() }),
    now,
  });
  assert.deepEqual(target.route, { pathname: '/sessions', params: { tab: 'past' } });
});

test('an unresolved booking uses the current role sessions list', () => {
  const target = targetFor(notice('booking', { bookingId: 'missing' }), {
    uid: 'student-1',
    currentRole: 'tutor',
    now,
  });
  assert.equal(target.role, 'tutor');
  assert.equal(target.route, '/tutor_sessions');
});

test('an interview system notice opens tutor home', () => {
  for (const data of [{ interviewId: 'interview-1' }, { scheduledAt: '2026-10-17T10:00:00Z' }]) {
    const target = targetFor(notice('system', data), { uid: 'student-1', currentRole: 'student', now });
    assert.equal(target.role, 'tutor');
    assert.equal(target.route, '/tutor_home');
  }
});

test('an unknown notification opens the feed in the current role', () => {
  const target = targetFor(notice('unknown'), { uid: 'student-1', currentRole: 'ambassador', now });
  assert.equal(target.role, 'ambassador');
  assert.equal(target.route, '/notifications');
});
