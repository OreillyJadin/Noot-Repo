export function validatePersonal(
  { firstName, lastName, year, major }: { firstName: string; lastName: string; year: string; major: string },
  { requireYearMajor }: { requireYearMajor: boolean },
): string | null {
  const first = firstName.trim();
  const last = lastName.trim();

  if (!first) return 'Enter your first name.';
  if (!last) return 'Enter your last name.';
  if (requireYearMajor && !year.trim()) return 'Pick your year.';
  if (requireYearMajor && !major.trim()) return 'Pick your major.';
  if (first.length > 50 || last.length > 50) return 'Names can be at most 50 characters.';

  return null;
}
