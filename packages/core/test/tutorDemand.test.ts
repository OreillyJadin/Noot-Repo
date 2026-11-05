import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapTutorDemand } from '../src/tutorDemand.ts';

test('tutor demand mapper converts aggregate fields and earned cents to dollars', () => {
  assert.deepEqual(mapTutorDemand({
    profileViews: '4',
    uniqueViewers: 3,
    openRequests: [
      { courseCode: 'MATH 125', requests: '2' },
      { courseCode: 'CS 100', requests: 1 },
    ],
    openRequestTotal: '3',
    earnedCents: 4125,
    sessionsCompleted: '1',
  }), {
    profileViews: 4,
    uniqueViewers: 3,
    openRequests: [
      { courseCode: 'MATH 125', requests: 2 },
      { courseCode: 'CS 100', requests: 1 },
    ],
    openRequestTotal: 3,
    earned: 41.25,
    sessionsCompleted: 1,
  });
});

test('tutor demand mapper returns a safe empty shape for missing fields', () => {
  assert.deepEqual(mapTutorDemand(null), {
    profileViews: 0,
    uniqueViewers: 0,
    openRequests: [],
    openRequestTotal: 0,
    earned: 0,
    sessionsCompleted: 0,
  });
});
