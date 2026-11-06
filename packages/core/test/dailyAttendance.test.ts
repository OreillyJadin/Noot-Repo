import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ATTENDANCE_THRESHOLD_SECONDS,
  attendanceForBooking,
  classifyAttendance,
  dailyUserId,
  fetchAttendance,
  participantSecondsInWindow,
} from '../../../supabase/functions/_shared/daily.ts';

async function withDailyResponse<T>(body: unknown, status: number, run: () => Promise<T>): Promise<T> {
  const originalFetch = globalThis.fetch;
  const denoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Deno');
  Object.defineProperty(globalThis, 'Deno', {
    configurable: true,
    value: { env: { get: (name: string) => name === 'DAILY_API_KEY' ? 'test-key' : undefined } },
  });
  globalThis.fetch = (async () => new Response(JSON.stringify(body), { status })) as typeof globalThis.fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
    if (denoDescriptor) Object.defineProperty(globalThis, 'Deno', denoDescriptor);
    else Reflect.deleteProperty(globalThis, 'Deno');
  }
}

test('attendance threshold is five minutes', () => {
  assert.equal(ATTENDANCE_THRESHOLD_SECONDS, 300);
  assert.deepEqual(classifyAttendance({ studentSeconds: 300, tutorSeconds: 299 }), {
    studentAttended: true,
    tutorAttended: false,
  });
});

test('Daily computer user IDs map back to booking user UUIDs', () => {
  assert.equal(dailyUserId('12345678-1234-1234-1234-123456789abc'), '12345678-1234-1234-1234-123456789abc');
  assert.equal(dailyUserId('c-12345678123412341234123456789abc'), '12345678-1234-1234-1234-123456789abc');
  assert.equal(dailyUserId('guest-1'), null);
});

test('participant seconds are clipped to the scheduled attendance window', () => {
  assert.equal(participantSecondsInWindow(
    { join_time: 90, duration: 120 },
    100_000,
    180_000,
  ), 80);
});

test('attendance sums only party time overlapping the scheduled window', () => {
  const start = '2026-11-06T12:00:00.000Z';
  const startSeconds = Date.parse(start) / 1000;
  const attendance = attendanceForBooking([{
    participants: [
      { user_id: 'student-unknown', join_time: startSeconds, duration: 600 },
      { user_id: '12345678-1234-1234-1234-123456789abc', join_time: startSeconds, duration: 600 },
      { user_id: 'c-abcdefabcdefabcdefabcdefabcdefab', join_time: startSeconds + 600, duration: 300 },
    ],
  }], '12345678-1234-1234-1234-123456789abc', 'abcdefab-cdef-abcd-efab-cdefabcdefab', start, 30);
  assert.equal(attendance.get('12345678-1234-1234-1234-123456789abc'), 600);
  assert.equal(attendance.get('abcdefab-cdef-abcd-efab-cdefabcdefab'), 300);
  assert.equal(attendance.size, 2);
});

test('a successful Daily lookup with no meetings returns empty attendance evidence', async () => {
  await withDailyResponse({ data: [] }, 200, async () => {
    const attendance = await fetchAttendance(
      'noot-abcd1234',
      '2026-11-06T12:00:00.000Z',
      60,
      '12345678-1234-1234-1234-123456789abc',
      'abcdefab-cdef-abcd-efab-cdefabcdefab',
    );
    assert.ok(attendance instanceof Map);
    assert.equal(attendance.size, 0);
  });
});

test('malformed Daily responses and Daily errors remain unavailable evidence', async () => {
  await withDailyResponse({ data: {} }, 200, async () => {
    assert.equal(await fetchAttendance(
      'noot-abcd1234',
      '2026-11-06T12:00:00.000Z',
      60,
      '12345678-1234-1234-1234-123456789abc',
      'abcdefab-cdef-abcd-efab-cdefabcdefab',
    ), null);
  });
  await withDailyResponse({}, 500, async () => {
    assert.equal(await fetchAttendance(
      'noot-abcd1234',
      '2026-11-06T12:00:00.000Z',
      60,
      '12345678-1234-1234-1234-123456789abc',
      'abcdefab-cdef-abcd-efab-cdefabcdefab',
    ), null);
  });
});
