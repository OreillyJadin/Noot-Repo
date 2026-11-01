import { validGraduationYear } from '@noot/core';

export function validateExpectedGraduationYear(value: string, year: string): string | null {
  return year !== 'Post Grad' && value && !validGraduationYear(Number(value))
    ? 'Enter a four-digit graduation year between 1900 and 2200.' : null;
}

export function validatePersonal(
  { firstName, lastName, year, major, expectedGraduationYear = '' }: { firstName: string; lastName: string; year: string; major: string; expectedGraduationYear?: string },
  { requireYearMajor }: { requireYearMajor: boolean },
): string | null {
  const first = firstName.trim();
  const last = lastName.trim();

  if (!first) return 'Enter your first name.';
  if (!last) return 'Enter your last name.';
  if (requireYearMajor && !year.trim()) return 'Pick your year.';
  if (requireYearMajor && !major.trim()) return 'Pick your major.';
  if (first.length > 50 || last.length > 50) return 'Names can be at most 50 characters.';

  return validateExpectedGraduationYear(expectedGraduationYear, year);
}
