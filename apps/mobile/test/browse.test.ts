// Run: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, byPopularity, courseForQuery, forYou, nudgeCourse, populatedCategories, searchTutors, subjectOf, tutorsIn } from '../lib/browse.ts';
import type { Tutor } from '../lib/data.ts';

const tutor = (id: string, major: string, sessions: number, codes: string[]): Tutor => ({
  id, name: id, year: '', major, rating: 0, sessions, rate: 20, gender: 'f', verified: false,
  verifiedGrade: '', next: 0, nextLabel: '', bio: '',
  courses: codes.map((c) => [c, 'A', 20, 0]),
});
const cat = (name: string) => CATEGORIES.find((c) => c.name === name)!;
const ids = (picks: { tutor: Tutor }[]) => picks.map((p) => p.tutor.id);

const sara = tutor('sara', 'Finance', 40, ['FI 302', 'MATH 125']);
const ben = tutor('ben', 'Mathematics', 12, ['MATH 125', 'MATH 227']);
const phil = tutor('phil', 'Philosophy', 30, ['PHL 100']);
const all = [ben, sara, phil];

test('a subject code belongs to exactly one category', () => {
  const seen = new Map<string, string>();
  for (const c of CATEGORIES) {
    for (const s of c.subjects) {
      assert.equal(seen.get(s), undefined, `${s} is in both ${seen.get(s)} and ${c.name}`);
      seen.set(s, c.name);
    }
  }
});

test('subjectOf reads the code before the space', () => {
  assert.equal(subjectOf('MATH 125'), 'MATH');
  assert.equal(subjectOf(' ph 105 '), 'PH');
  assert.equal(subjectOf('CS100'), 'CS');
  assert.equal(subjectOf(''), '');
});

test('categories match the subject exactly, not by prefix (ERR-011)', () => {
  // PH is physics; PHL (philosophy) used to ride into STEM on the "PH" prefix.
  assert.deepEqual(ids(tutorsIn(all, cat('STEM'))), ['sara', 'ben']);
  assert.deepEqual(ids(tutorsIn(all, cat('Humanities'))), ['phil']);
  const ece = tutor('ece', '', 1, ['ECE 225']);
  assert.deepEqual(ids(tutorsIn([ece], cat('Business'))), []); // "EC" is economics, not ECE
  assert.deepEqual(ids(tutorsIn([ece], cat('STEM'))), ['ece']);
});

test('a category card shows the course the tutor teaches IN that category', () => {
  assert.equal(tutorsIn([sara], cat('STEM'))[0]!.course, 'MATH 125');
  assert.equal(tutorsIn([sara], cat('Business'))[0]!.course, 'FI 302');
});

test('only categories with a tutor get a tab (ERR-011)', () => {
  assert.deepEqual(populatedCategories(all).map((c) => c.name), ['Business', 'STEM', 'Humanities']);
  assert.deepEqual(populatedCategories([ben]).map((c) => c.name), ['STEM']);
  assert.deepEqual(populatedCategories([]), []);
});

test('popular is most sessions first and does not reorder the input', () => {
  assert.deepEqual(byPopularity(all).map((t) => t.id), ['sara', 'phil', 'ben']);
  assert.deepEqual(all.map((t) => t.id), ['ben', 'sara', 'phil']);
});

test('for you: tutors for the courses the student takes, with the shared course (ERR-010)', () => {
  const res = forYou(all, ['math 227', 'PHL 100'], 'Finance');
  assert.equal(res?.title, 'For your courses');
  assert.deepEqual(res?.picks.map((p) => [p.tutor.id, p.course]), [['phil', 'PHL 100'], ['ben', 'MATH 227']]);
});

test('for you: falls back to the student’s major when no tutor has their courses', () => {
  const res = forYou(all, ['NUR 305'], 'mathematics');
  assert.equal(res?.title, 'In your major · mathematics');
  assert.deepEqual(res?.picks.map((p) => [p.tutor.id, p.course]), [['ben', 'MATH 125']]);
});

test('for you: "Undeclared" is not a major to match on', () => {
  const undeclared = [tutor('u1', 'Undeclared', 5, ['EN 101']), tutor('u2', 'Undecided', 3, ['EN 102'])];
  assert.equal(forYou(undeclared, [], 'Undeclared'), null);
  assert.equal(forYou(undeclared, [], 'undecided'), null);
  assert.equal(forYou(undeclared, [], '   '), null);
});

test('for you: the carousel is capped', () => {
  const many = Array.from({ length: 25 }, (_, i) => tutor(`t${i}`, 'Finance', i, ['FI 302']));
  assert.equal(forYou(many, ['FI 302'], null)?.picks.length, 10);
  assert.equal(forYou(many, [], 'Finance')?.picks.length, 10);
  // …and keeps the most popular ones.
  assert.equal(forYou(many, ['FI 302'], null)?.picks[0]!.tutor.id, 't24');
});

test('subjects a student would look for are where they expect', () => {
  const where = (code: string) => CATEGORIES.find((c) => c.subjects.includes(code))?.name;
  assert.equal(where('GES'), 'STEM'); // General Engineering Studies
  assert.equal(where('EC'), 'Business');
  assert.equal(where('PY'), 'Humanities');
  assert.equal(where('NUR'), 'Health');
  assert.equal(where('FA'), 'Arts & Media');
});

test('for you: nothing to show means no carousel, not a repeat of the popular list', () => {
  assert.equal(forYou(all, [], null), null);
  assert.equal(forYou(all, ['NUR 305'], 'Nursing'), null);
  assert.equal(forYou([], ['MATH 125'], 'Finance'), null);
});

test('the Home nudge names a course of mine that a tutor teaches (ERR-015)', () => {
  // My first course has no tutor; the card used to name it anyway and open an unrelated tutor.
  assert.equal(nudgeCourse(all, ['CS 100', 'MATH 227']), 'MATH 227');
  // My order wins when several are taught.
  assert.equal(nudgeCourse(all, ['PHL 100', 'MATH 125']), 'PHL 100');
  // Spelled the tutor's way, whichever side is untidy.
  assert.equal(nudgeCourse(all, [' math 227 ']), 'MATH 227');
  assert.equal(nudgeCourse([tutor('odd', 'Math', 1, [' math 227 '])], ['MATH 227']), 'math 227');
});

test('no Home nudge when nobody teaches my courses', () => {
  assert.equal(nudgeCourse(all, ['CS 100']), null);
  assert.equal(nudgeCourse(all, []), null);
  assert.equal(nudgeCourse(all, ['', '  ']), null);
  assert.equal(nudgeCourse([], ['MATH 125']), null);
});

test('an exact course query lists only that course\'s tutors (ERR-015)', () => {
  // IS is a suffix of MIS: a substring match put MIS 200 tutors under "IS 200".
  const is = tutor('is', 'MIS', 5, ['IS 200']);
  const mis = tutor('mis', 'MIS', 9, ['MIS 200']);
  const both = tutor('both', 'MIS', 1, ['MIS 200', 'IS 200']);
  assert.deepEqual(searchTutors([is, mis, both], 'is 200 ').map((t) => t.id), ['is', 'both']);
  assert.equal(courseForQuery(both, 'IS 200'), 'IS 200');
  // The Home card's course always finds someone, and only tutors who teach it.
  const course = nudgeCourse(all, ['MATH 227'])!;
  assert.deepEqual(searchTutors(all, course).map((t) => t.id), ['ben']);
});

test('a partial query still matches names and parts of course codes', () => {
  assert.deepEqual(searchTutors(all, 'math').map((t) => t.id), ['ben', 'sara']);
  assert.deepEqual(searchTutors(all, 'PHI').map((t) => t.id), ['phil']);
  assert.deepEqual(searchTutors(all, '  '), all);
  assert.deepEqual(searchTutors(all, 'zzz'), []);
  assert.equal(courseForQuery(sara, 'math'), 'MATH 125');
  assert.equal(courseForQuery(sara, 'sara'), 'FI 302');
  assert.equal(courseForQuery(sara, ''), 'FI 302');
});
