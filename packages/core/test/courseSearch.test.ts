// Run: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCourseQuery, rankCourseMatches } from '../src/courseSearch.ts';

test('a code typed without its space is searched the way the catalog writes it', () => {
  assert.equal(normalizeCourseQuery('math125'), 'math 125');
  assert.equal(normalizeCourseQuery('MATH2'), 'MATH 2');
  assert.equal(normalizeCourseQuery('  math   125 '), 'math 125');
});

test('a query that is not a code is left alone', () => {
  assert.equal(normalizeCourseQuery('calc'), 'calc');
  assert.equal(normalizeCourseQuery('organic chemistry 2'), 'organic chemistry 2');
  assert.equal(normalizeCourseQuery('MATH 125'), 'MATH 125');
});

test('PostgREST filter syntax is stripped', () => {
  assert.equal(normalizeCourseQuery('math,(125)*'), 'math 125');
  assert.equal(normalizeCourseQuery(' ,() '), '');
});

const c = (courseCode: string) => ({ courseCode });

test('courses whose code starts with the query come before title matches (ERR-008)', () => {
  const byCode = [c('MATH 100'), c('MATH 125')];
  const anywhere = [c('CEE 380'), c('CS 404'), c('MATH 100'), c('MATH 125')];
  assert.deepEqual(
    rankCourseMatches(byCode, anywhere, 10).map((x) => x.courseCode),
    ['MATH 100', 'MATH 125', 'CEE 380', 'CS 404'],
  );
});

test('the list is capped, keeping the code matches', () => {
  const ranked = rankCourseMatches([c('MATH 100'), c('MATH 125')], [c('CEE 380'), c('CS 404')], 3);
  assert.deepEqual(ranked.map((x) => x.courseCode), ['MATH 100', 'MATH 125', 'CEE 380']);
});

test('with no code match the other matches are returned as before', () => {
  assert.deepEqual(rankCourseMatches([], [c('MATH 125'), c('MATH 126')], 10).map((x) => x.courseCode), ['MATH 125', 'MATH 126']);
});
