import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Booking, Conversation } from '@noot/core';
import type { Tutor } from '../lib/data.ts';
import { BOOKING_CHAT_NOTIFICATION_TITLES, targetFor } from '../lib/notificationTarget.ts';

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
    requestNote: null,
    cancellationDeadline: new Date(now).toISOString(),
    cancelledAt: null,
    refundStatus: 'not_applicable',
    refundPercent: 0,
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

test('a completion rating notice carries the exact completed booking and tutor into C2', () => {
  const target = targetFor(notice('booking', { bookingId: 'booking-1', event: 'rate_session' }), {
    uid: 'student-1', currentRole: 'tutor', booking: booking({ status: 'completed' }), tutor, canRate: true, now,
  });
  assert.equal(target.role, 'student');
  assert.equal(target.route, '/c2');
  assert.equal(target.draft?.bookingId, 'booking-1');
  assert.equal(target.draft?.studentId, 'student-1');
  assert.equal(target.draft?.course, 'MATH 125');
  assert.equal(target.draft?.status, 'completed');
  assert.equal(target.draft?.tutor, tutor);
});

test('stale, rated, unavailable or mismatched rating notices do not reopen C2', () => {
  const n = notice('booking', { bookingId: 'booking-1', event: 'rate_session' });
  const ctx = { uid: 'student-1', currentRole: 'student' as const, booking: booking({ status: 'completed' }), tutor, canRate: true, now };
  for (const override of [
    { canRate: false }, { canRate: undefined }, { tutor: null }, { booking: null },
    { booking: booking({ status: 'cancelled' }) }, { booking: booking({ status: 'confirmed' }) },
    { booking: booking({ id: 'another-booking', status: 'completed' }) },
    { uid: 'tutor-1' }, { uid: 'outsider' },
  ]) {
    assert.notEqual(targetFor(n, { ...ctx, ...override }).route, '/c2', JSON.stringify(override));
  }
  assert.notEqual(targetFor(notice('booking', { bookingId: 'booking-1' }), ctx).route, '/c2');
});

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

test('a tutor request notice opens the sessions list where it can be accepted', () => {
  const target = targetFor(notice('booking', { bookingId: 'booking-1' }, 'New session request'), {
    uid: 'tutor-1',
    currentRole: 'student',
    booking: booking({ status: 'pending' }),
    now,
  });
  assert.equal(target.role, 'tutor');
  assert.equal(target.route, '/tutor_sessions');
});

test('a future confirmed booking notice opens the student handshake screen', () => {
  assert.equal(BOOKING_CHAT_NOTIFICATION_TITLES.has('Session confirmed'), false);
  const target = targetFor(notice('booking', { bookingId: 'booking-1' }, 'Session confirmed'), {
    uid: 'student-1',
    currentRole: 'tutor',
    booking: booking(),
    tutor,
    now,
  });
  assert.equal(target.role, 'student');
  assert.deepEqual(target.route, { pathname: '/b5', params: { bookingId: 'booking-1' } });
  assert.equal(target.draft, undefined);
});

test('a confirmed booking notice without a tutor summary still opens the handshake screen', () => {
  const target = targetFor(notice('booking', { bookingId: 'booking-1' }, 'Session confirmed'), {
    uid: 'student-1',
    currentRole: 'student',
    booking: booking(),
    now,
  });
  assert.deepEqual(target.route, { pathname: '/b5', params: { bookingId: 'booking-1' } });
});

test('a pending booking notice titled Session confirmed falls back to student sessions', () => {
  const target = targetFor(notice('booking', { bookingId: 'booking-1' }, 'Session confirmed'), {
    uid: 'student-1',
    currentRole: 'student',
    booking: booking({ status: 'pending' }),
    now,
  });
  assert.equal(target.route, '/sessions');
});

test('a past confirmed booking notice does not reopen the handshake screen', () => {
  const target = targetFor(notice('booking', { bookingId: 'booking-1' }, 'Session confirmed'), {
    uid: 'student-1',
    currentRole: 'student',
    booking: booking({ scheduledAt: new Date(now - 60_000).toISOString() }),
    now,
  });
  assert.deepEqual(target.route, { pathname: '/sessions', params: { tab: 'past' } });
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
