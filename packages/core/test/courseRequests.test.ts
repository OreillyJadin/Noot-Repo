import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapAdminCourseRequest, mapCourseRequest } from '../src/courseRequests.ts';

test('course request mapper accepts the RPC camel-case response', () => {
  assert.deepEqual(mapCourseRequest({
    id: 'request-1',
    courseCode: 'MATH 125',
    status: 'open',
    createdAt: '2026-10-01T12:00:00.000Z',
    created: true,
  }), {
    id: 'request-1',
    courseCode: 'MATH 125',
    status: 'open',
    createdAt: '2026-10-01T12:00:00.000Z',
  });
});

test('course request mapper converts selected database fields to camel case', () => {
  assert.deepEqual(mapCourseRequest({
    id: 'request-2',
    course_code: 'CHEM 101',
    status: 'open',
    created_at: '2026-10-02T12:00:00.000Z',
  }), {
    id: 'request-2',
    courseCode: 'CHEM 101',
    status: 'open',
    createdAt: '2026-10-02T12:00:00.000Z',
  });
});

test('admin course request mapper converts the RPC aggregate fields', () => {
  assert.deepEqual(mapAdminCourseRequest({
    course_code: 'MATH 125',
    course_title: 'Calculus I',
    requests: '3',
    latest_at: '2026-10-01T12:00:00.000Z',
    covered: true,
  }), {
    courseCode: 'MATH 125',
    courseTitle: 'Calculus I',
    requests: 3,
    latestAt: '2026-10-01T12:00:00.000Z',
    covered: true,
  });
});
