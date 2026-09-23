// Run: pnpm dlx tsx --test packages/core/test/*.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UA_MAJORS, searchMajors } from '../src/data/uaMajors.ts';

test('the list has no duplicates and no degree suffixes', () => {
  const names = UA_MAJORS.map((m) => m.name);
  assert.equal(new Set(names).size, names.length);
  for (const n of names) assert.doesNotMatch(n, /, B[A-Z]/, n);
});

test('blank query returns nothing', () => {
  assert.deepEqual(searchMajors('   '), []);
});

test('prefix matches rank ahead of word matches', () => {
  const names = searchMajors('eng', 20).map((m) => m.name);
  assert.equal(names[0], 'English');
  assert.ok(names.includes('Aerospace Engineering'));
  assert.ok(names.indexOf('English') < names.indexOf('Aerospace Engineering'));
});

test('case-insensitive substring match still lands', () => {
  assert.ok(searchMajors('CHEM').some((m) => m.name === 'Chemistry'));
  assert.ok(searchMajors('science').length > 0);
});

test('respects the limit', () => {
  assert.equal(searchMajors('a', 5).length, 5);
});
