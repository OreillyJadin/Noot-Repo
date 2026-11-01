// Run: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Booking } from '@noot/core';
import { campusDays, campusInstant } from '../../../packages/core/src/campusTime.ts';
import { formatSessionTime, sessionDayAndTime } from '../lib/formatSessionTime.ts';
import { draftFromBooking } from '../lib/bookingDraft.ts';

const fallback = { day: 'Wed Oct 21', time: '7:00 AM' };

test('uses the scheduled time for a booking tomorrow', () => {
  const tomorrow = campusInstant(campusDays(2)[1]!, 15 * 60);

  const result = sessionDayAndTime(tomorrow.toISOString(), fallback);

  assert.equal(result.day, 'Tomorrow');
  assert.match(result.time, /3:00/);
});

test('returns the fallback unchanged when no scheduled time is set', () => {
  assert.strictEqual(sessionDayAndTime(undefined, fallback), fallback);
});

test('uses the stored UTC timestamp for Central Standard Time', () => {
  const result = sessionDayAndTime('2026-11-02T06:31:00.000Z', fallback);

  assert.match(result.time, /^12:31[\s\u202f\u00a0]?AM CT$/);
  assert.notEqual(result.day, fallback.day);
  assert.doesNotMatch(result.day, /·/);
});

test('uses the stored UTC timestamp for Central Daylight Time', () => {
  const result = sessionDayAndTime('2026-07-15T19:45:00.000Z', fallback);

  assert.match(result.time, /^2:45[\s\u202f\u00a0]?PM CT$/);
});

test('uses the booking draft scheduledAt instead of the placeholder time', () => {
  const booking: Booking = {
    id: 'booking-1',
    studentId: 'student-1',
    tutorId: 'tutor-1',
    subject: 'MATH 125',
    scheduledAt: '2026-11-02T06:31:00.000Z',
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
    cancellationDeadline: '2026-11-02T05:31:00.000Z',
    cancelledAt: null,
    refundStatus: 'not_applicable',
    stripePaymentIntentId: null,
    createdAt: '2026-11-01T12:00:00.000Z',
    updatedAt: '2026-11-01T12:00:00.000Z',
  };
  const draft = draftFromBooking(booking);

  const result = sessionDayAndTime(draft.scheduledAt, { day: 'Tomorrow', time: '3:00 PM' });

  assert.match(result.time, /^12:31[\s\u202f\u00a0]?AM CT$/);
  assert.notEqual(result.time, '3:00 PM');
});

test('returns the fallback unchanged for invalid timestamps', () => {
  assert.strictEqual(sessionDayAndTime('not-a-date', fallback), fallback);
  assert.strictEqual(sessionDayAndTime('', fallback), fallback);
});

test('separates the day label from the time for a date five days out', () => {
  const future = campusInstant(campusDays(6)[5]!, 15 * 60);

  const result = sessionDayAndTime(future.toISOString(), fallback);

  assert.doesNotMatch(result.day, /·/);
  assert.match(result.time, /\d:\d\d/);
});

test('formatSessionTime ignores array callback arguments', () => {
  const times = campusDays(2).map((day) => campusInstant(day, 900).toISOString());
  assert.deepEqual(times.map(formatSessionTime), times.map((iso) => formatSessionTime(iso)));
});

test('cancel and no-show recaps use each booking scheduledAt', () => {
  const xtc = readFileSync(new URL('../app/xtc.tsx', import.meta.url), 'utf8');
  const xns = readFileSync(new URL('../app/xns.tsx', import.meta.url), 'utf8');

  assert.match(xtc, /sessionDayAndTime\(booking\.scheduledAt/);
  assert.match(xns, /sessionDayAndTime\(booking\.scheduledAt/);

  const sessionStrip = xtc.match(/function SessionStrip[\s\S]*?\n}\n/)?.[0] ?? '';
  assert.notEqual(sessionStrip, '');
  assert.doesNotMatch(sessionStrip, /\{f\.(?:slot|dayObj\.label)\}/);
});
