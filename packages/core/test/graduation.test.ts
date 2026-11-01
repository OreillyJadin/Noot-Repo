import { test } from 'node:test';
import assert from 'node:assert/strict';
import { academicYearLabel, currentAcademicYear, validGraduationYear, graduationPromptDue } from '../src/graduation.ts';

test('graduation prompts start the following campus year, never automatically change status', () => {
  const p = { year: 'Senior', expectedGraduationYear: 2024 };
  assert.equal(graduationPromptDue(p, new Date('2025-01-01T05:59:59Z')), false);
  assert.equal(graduationPromptDue(p, new Date('2025-01-01T06:00:00Z')), true);
  assert.equal(graduationPromptDue({ ...p, year: 'Post Grad' }, new Date('2026-01-01T12:00:00Z')), false);
  assert.equal(graduationPromptDue({ ...p, expectedGraduationYear: null }), false);
  assert.equal(currentAcademicYear(new Date('2025-01-01T05:59:59Z')), 2024);
});

test('graduation years reject invalid values and legacy graduate labels stay distinct from Post Grad', () => {
  for (const year of [NaN, Infinity, 2024.5, 1899, 2201]) assert.equal(validGraduationYear(year), false);
  for (const year of [1900, 2024, 2200]) assert.equal(validGraduationYear(year), true);
  assert.equal(academicYearLabel('Grad'), 'Graduate Student');
  assert.equal(academicYearLabel('Post Grad'), 'Post Grad');
  assert.equal(academicYearLabel(null), '');
});
