import assert from 'node:assert/strict';
import test from 'node:test';
import { ACCEPT_CUTOFF_HOURS, ACCEPT_WINDOW_HOURS, acceptDeadline } from '../functions/_shared/acceptance.ts';

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
    now + 8 * hour,
  );
});

test('a booking one hour out gives the tutor until the session starts', () => {
  const now = Date.UTC(2026, 0, 1);
  assert.equal(acceptDeadline(now, now + hour).getTime(), now + hour);
});

test('a booking exactly two hours out gives the tutor until the session starts', () => {
  const now = Date.UTC(2026, 0, 1);
  assert.equal(
    acceptDeadline(now, now + ACCEPT_CUTOFF_HOURS * hour).getTime(),
    now + ACCEPT_CUTOFF_HOURS * hour,
  );
});
