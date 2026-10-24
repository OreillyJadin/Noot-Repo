export const MIN_AGE = 18;

type DatePart = string | number;

export function parseDob(month: DatePart, day: DatePart, year: DatePart): string | null {
  const monthText = String(month).trim();
  const dayText = String(day).trim();
  const yearText = String(year).trim();
  if (!/^\d{1,2}$/.test(monthText) || !/^\d{1,2}$/.test(dayText) || !/^\d{4}$/.test(yearText)) {
    return null;
  }

  const monthNumber = Number(monthText);
  const dayNumber = Number(dayText);
  const yearNumber = Number(yearText);
  const date = new Date(Date.UTC(yearNumber, monthNumber - 1, dayNumber));
  if (
    yearNumber < 1900 ||
    date.getUTCFullYear() !== yearNumber ||
    date.getUTCMonth() !== monthNumber - 1 ||
    date.getUTCDate() !== dayNumber
  ) {
    return null;
  }

  const today = new Date();
  if (
    yearNumber > today.getFullYear() ||
    (yearNumber === today.getFullYear() && monthNumber > today.getMonth() + 1) ||
    (yearNumber === today.getFullYear() && monthNumber === today.getMonth() + 1 && dayNumber > today.getDate())
  ) {
    return null;
  }

  return `${yearText}-${String(monthNumber).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
}

export function isAdult(dob: string, today = new Date()): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 1900 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return false;
  }

  const age = today.getFullYear() - year;
  const birthdayHasPassed =
    today.getMonth() + 1 > month ||
    (today.getMonth() + 1 === month && today.getDate() >= day);
  return age - (birthdayHasPassed ? 0 : 1) >= MIN_AGE;
}
