import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionPhase, isUpcomingSession, isPastSession, canReportNoShow, SESSION_LOOKBACK_MS } from '../src/sessionTiming.ts';

const start = Date.parse('2026-10-31T17:00:00Z');
const booking = { status: 'confirmed' as const, scheduledAt: new Date(start).toISOString(), durationMinutes: 60 };

test('confirmed sessions remain upcoming/active through their full duration, without overlap', () => {
  for (const [now, phase] of [[start - 1, 'upcoming'], [start, 'active'], [start + 3_599_999, 'active'], [start + 3_600_000, 'ended']] as const) {
    assert.equal(sessionPhase(booking, now), phase);
    assert.equal(isUpcomingSession(booking, now), phase !== 'ended');
    assert.equal(isPastSession(booking, now), phase === 'ended');
  }
});

test('the lookback covers the longest server-allowed session until its end boundary', () => {
  const longest = { ...booking, durationMinutes: 480 };
  assert.equal(isUpcomingSession(longest, start + SESSION_LOOKBACK_MS - 1), true);
  assert.equal(isPastSession(longest, start + SESSION_LOOKBACK_MS), true);
});

test('requests are never active, and closed sessions are only past even if cancelled before start', () => {
  const request = { ...booking, status: 'pending' as const };
  assert.equal(isUpcomingSession(request, start - 1), true);
  assert.equal(isUpcomingSession(request, start + 1), false);
  assert.equal(sessionPhase(request, start), null);
  assert.equal(isPastSession(request, start + 3_600_000), false);
  for (const status of ['completed', 'cancelled', 'no_show'] as const) {
    assert.equal(isUpcomingSession({ ...booking, status }, start - 1), false);
    assert.equal(isPastSession({ ...booking, status }, start - 1), true);
    assert.equal(sessionPhase({ ...booking, status }, start), null);
  }
});

test('invalid session times and durations are never called active', () => {
  assert.equal(sessionPhase({ ...booking, scheduledAt: 'bad' }, start), null);
  for (const durationMinutes of [0, -1, NaN, Infinity]) {
    assert.equal(sessionPhase({ ...booking, durationMinutes }, start), null);
  }
});

test('no-show display eligibility matches the unchanged end-through-48-hours server window', () => {
  const end = start + 3_600_000;
  assert.equal(canReportNoShow(booking, end - 1), false);
  assert.equal(canReportNoShow(booking, end), true);
  assert.equal(canReportNoShow(booking, end + 48 * 3_600_000), true);
  assert.equal(canReportNoShow(booking, end + 48 * 3_600_000 + 1), false);
  assert.equal(canReportNoShow({ ...booking, status: 'completed' }, end), false);
});
