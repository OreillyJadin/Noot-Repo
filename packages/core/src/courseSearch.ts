// How a typed course search is matched against the catalog (ERR-008 / ERR-009).
//
// The picker used to run one "contains, anywhere" match ordered by code. Typing MATH listed
// CEE 380, CS 404 and EC 470 ahead of any MATH course (their titles contain "math"), and
// typing CS listed AAST and AEM courses (titles containing "cs", like "Politics") — so it
// looked like every course until a number narrowed it. A course code is what people type,
// so courses whose CODE starts with the query now come first; title and subject matches
// only fill whatever room is left.

/**
 * The query as the catalog writes codes: PostgREST filter syntax stripped, whitespace
 * collapsed, and a space between the subject and number ("math125" → "math 125").
 */
export function normalizeCourseQuery(query: string): string {
  const safe = query.replace(/[,()*]/g, ' ').replace(/\s+/g, ' ').trim();
  return safe.replace(/^([A-Za-z]+)(\d)/, '$1 $2');
}

/** Code-prefix matches first, then the rest, without repeats, capped at `limit`. */
export function rankCourseMatches<T extends { courseCode: string }>(
  byCode: T[],
  anywhere: T[],
  limit: number,
): T[] {
  const seen = new Set(byCode.map((c) => c.courseCode));
  const rest = anywhere.filter((c) => !seen.has(c.courseCode));
  return [...byCode, ...rest].slice(0, limit);
}
