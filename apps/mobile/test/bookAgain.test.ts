import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bookAgainDraft } from '../lib/bookAgain.ts';
import type { Tutor } from '../lib/data';

const tutor: Tutor = {
  id: 'tutor', name: 'Tutor', year: '', major: '', rating: 0, sessions: 2, rate: 30,
  verified: false, verifiedGrade: '', next: 0, nextLabel: '', bio: '',
  courses: [['CS 100', 'A', 30, 2], ['MATH 125', 'A', 35, 1]],
};
test('Book again prefills the last course and duration and opens time selection', () => {
  const plan = bookAgainDraft(tutor, 'MATH 125', 90);
  assert.equal(plan.route, '/b3');
  assert.deepEqual(plan.draft, { tutor, course: 'MATH 125', lengthMin: 90 });
});
test('Book again replaces the draft without old booking, payment, time or meeting data', () => {
  const plan = bookAgainDraft(tutor, 'CS 100', 60);
  assert.deepEqual(Object.keys(plan.draft).sort(), ['course', 'lengthMin', 'tutor']);
});
test('a removed course falls back to the profile with a current course', () => {
  const plan = bookAgainDraft(tutor, 'HIST 101', 30);
  assert.equal(plan.route, '/b2');
  assert.equal(plan.draft.course, 'CS 100');
});
test('a tutor with no courses never opens the time picker', () => {
  const plan = bookAgainDraft({ ...tutor, courses: [] }, 'CS 100', 60);
  assert.equal(plan.route, '/b2');
  assert.equal(plan.draft.course, undefined);
});
