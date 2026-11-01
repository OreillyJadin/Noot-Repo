import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePersonal, validateExpectedGraduationYear } from '../lib/profileValidation.ts';

const valid = { firstName: 'Jamie', lastName: 'Rivera', year: 'Junior', major: 'Biology' };

test('personal fields require names and, when requested, year and major', () => {
  assert.equal(validatePersonal({ ...valid, firstName: '  ' }, { requireYearMajor: true }), 'Enter your first name.');
  assert.equal(validatePersonal({ ...valid, lastName: '' }, { requireYearMajor: true }), 'Enter your last name.');
  assert.equal(validatePersonal({ ...valid, year: ' ' }, { requireYearMajor: true }), 'Pick your year.');
  assert.equal(validatePersonal({ ...valid, major: '' }, { requireYearMajor: true }), 'Pick your major.');
});

test('edit personal info leaves year and major optional', () => {
  assert.equal(validatePersonal({ ...valid, year: '', major: '  ' }, { requireYearMajor: false }), null);
});

test('names longer than 50 trimmed characters are rejected', () => {
  assert.equal(validatePersonal({ ...valid, firstName: `${'a'.repeat(51)} ` }, { requireYearMajor: false }), 'Names can be at most 50 characters.');
  assert.equal(validatePersonal({ ...valid, lastName: 'b'.repeat(51) }, { requireYearMajor: false }), 'Names can be at most 50 characters.');
});

test('invalid or partial graduation years give the field error before any save', () => {
  for (const input of ['2', '20', '202', '1899', '2201', 'NaN', '2024.5']) {
    const expectedError = 'Enter a four-digit graduation year between 1900 and 2200.';
    assert.equal(validateExpectedGraduationYear(input, 'Senior'), expectedError);
    assert.equal(validatePersonal({ ...valid, expectedGraduationYear: input }, { requireYearMajor: true }), expectedError);
  }
  for (const input of ['', '2024', '2030']) assert.equal(validateExpectedGraduationYear(input, 'Senior'), null);
  assert.equal(validateExpectedGraduationYear('202', 'Post Grad'), null);
});
