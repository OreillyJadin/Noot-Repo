export const ACADEMIC_YEAR_OPTIONS = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate Student', 'Post Grad'];

export function academicYearLabel(year: string | null): string {
  return year === 'Grad' ? 'Graduate Student' : year ?? '';
}

export function currentAcademicYear(now = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric' }).format(now));
}

export function validGraduationYear(year: number): boolean {
  return Number.isInteger(year) && year >= 1900 && year <= 2200;
}

export function graduationPromptDue(profile: { year: string | null; expectedGraduationYear: number | null }, now = new Date()): boolean {
  return profile.year !== 'Post Grad' && profile.expectedGraduationYear !== null
    && validGraduationYear(profile.expectedGraduationYear) && profile.expectedGraduationYear < currentAcademicYear(now);
}
