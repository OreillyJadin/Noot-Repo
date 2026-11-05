import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACCEPT_CUTOFF_HOURS,
  ACCEPT_WINDOW_HOURS,
  MIN_BOOKING_LEAD_HOURS,
  SHORT_NOTICE_ACCEPT_CUTOFF_HOURS,
  acceptDeadline,
} from '../functions/_shared/acceptance.ts';

const hour = 60 * 60 * 1000;

test('a booking three days out gives the tutor twelve hours', () => {
  const now = Date.UTC(2026, 0, 1);
  assert.equal(
    acceptDeadline(now, now + 3 * 24 * hour).getTime(),
    now + ACCEPT_WINDOW_HOURS * hour,
  );
});

test('a booking ten hours out gives the tutor until two hours before the session', () => {
  const now = Date.UTC(2026, 0, 1);
  assert.equal(
    acceptDeadline(now, now + 10 * hour).getTime(),
    now + (10 - ACCEPT_CUTOFF_HOURS) * hour,
  );
});

test('a booking exactly three hours out gives the tutor one hour to respond', () => {
  const now = Date.UTC(2026, 0, 1);
  assert.equal(acceptDeadline(now, now + 3 * hour).getTime(), now + hour);
});

test('a booking two and a half hours out gives the tutor until one hour before', () => {
  const now = Date.UTC(2026, 0, 1);
  const scheduledAt = now + 2.5 * hour;
  assert.equal(
    acceptDeadline(now, scheduledAt).getTime(),
    scheduledAt - SHORT_NOTICE_ACCEPT_CUTOFF_HOURS * hour,
  );
});

test('a booking exactly two hours out gives the tutor one hour to respond', () => {
  const now = Date.UTC(2026, 0, 1);
  assert.equal(
    acceptDeadline(now, now + MIN_BOOKING_LEAD_HOURS * hour).getTime(),
    now + hour,
  );
});

test('all allowed start times leave the tutor and student at least one hour', () => {
  const now = Date.UTC(2026, 0, 1);
  const furthestStart = 14 * 24 * hour;
  const step = 5 * 60 * 1000;
  for (let offset = MIN_BOOKING_LEAD_HOURS * hour; offset <= furthestStart; offset += step) {
    const scheduledAt = now + offset;
    const deadline = acceptDeadline(now, scheduledAt).getTime();
    assert.ok(deadline - now >= SHORT_NOTICE_ACCEPT_CUTOFF_HOURS * hour, `tutor response window at ${offset}ms`);
    assert.ok(scheduledAt - deadline >= SHORT_NOTICE_ACCEPT_CUTOFF_HOURS * hour, `student notice window at ${offset}ms`);
  }
});
