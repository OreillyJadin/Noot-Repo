// What the Search tab shows before the student types anything — kept pure so it can be
// tested (test/browse.test.ts).
//
// ERR-010: "For you" showed the SAME unfiltered tutor list twice, once as a carousel and once
// as a list, both titled "Popular this week". The carousel is now picked for the student —
// tutors for the courses they're taking, or failing that tutors in their major — and the list
// is the most popular tutors (most sessions first), titled "Most popular" since the count is
// all-time, not this week's.
//
// ERR-011: the Business / STEM / Humanities tabs matched course codes by PREFIX against a
// hand-written list, so "PH" (physics) also pulled in PHL (philosophy), "EC" pulled in ECE,
// and several codes on the list (PSY, BIO, PHY, EE, BME) aren't UA subject codes at all.
// Categories now match the catalog's real subject codes exactly, cover the whole catalog,
// and a tab only shows while at least one tutor teaches in it — so nothing opens onto an
// empty list, and tabs appear on their own as tutors join.
import type { Tutor } from './data';

export interface Category {
  name: string;
  /** Catalog subject codes (the part of a course code before the space). */
  subjects: string[];
}

// Every active subject code in the UA catalog (courses.subject_code) belongs to exactly one.
export const CATEGORIES: Category[] = [
  {
    name: 'Business',
    subjects: [
      'AC', 'CSM', 'EC', 'FI', 'GBA', 'HCAN', 'HSM', 'IBA', 'LGS', 'MGT', 'MIS', 'MKT', 'OM', 'ST',
    ],
  },
  {
    name: 'STEM',
    subjects: [
      'AEM', 'AY', 'BSC', 'CE', 'CH', 'CHE', 'CS', 'DR', 'ECE', 'ENGR', 'EPIC', 'GEO', 'GES', 'GY',
      'MATH', 'ME', 'MFE', 'MS', 'MTE', 'PH',
    ],
  },
  {
    // Languages, social sciences and the general / honors programs sit here too.
    name: 'Humanities',
    subjects: [
      'AAST', 'AFS', 'ALA', 'AMS', 'ANT', 'ARB', 'AS', 'ASL', 'BUI', 'CC', 'CHI', 'CIP', 'CJ', 'CL',
      'CRL', 'CZE', 'EN', 'FR', 'GN', 'GR', 'GS', 'HY', 'IT', 'JA', 'KOR', 'LA', 'LAS', 'MDGR', 'MIL',
      'MLC', 'NCLT', 'NEW', 'NSE', 'PHL', 'POR', 'PSC', 'PY', 'REL', 'RL', 'RRS', 'RUS', 'SOC', 'SP',
      'SS', 'THAI', 'UA', 'UAEC', 'UFE', 'UH', 'UKR', 'VIET', 'WS',
    ],
  },
  {
    name: 'Health',
    subjects: [
      'ATR', 'CHS', 'HD', 'HES', 'HHE', 'IDMD', 'KIN', 'NHM', 'NUR', 'POPH', 'RCH', 'SLH', 'SW',
    ],
  },
  {
    name: 'Arts & Media',
    subjects: [
      'APR', 'ARH', 'ART', 'BA', 'CIS', 'COM', 'CTD', 'DN', 'DNCA', 'FA', 'GDS', 'IS', 'JCM', 'LS',
      'MC', 'MUA', 'MUS', 'MUSM', 'TH', 'THMT',
    ],
  },
  {
    name: 'Education',
    subjects: ['BCE', 'BEF', 'BEP', 'BER', 'CAT', 'CEE', 'CIE', 'CRD', 'CSE', 'EDU', 'MAP', 'MUE', 'SPE'],
  },
];

/** "MATH 125" → "MATH": the letters a code starts with (so a legacy "CS100" still reads CS). */
export function subjectOf(courseCode: string): string {
  return (/^[A-Za-z]+/.exec(courseCode.trim())?.[0] ?? '').toUpperCase();
}

const teachesIn = (tutor: Tutor, category: Category): string | undefined =>
  tutor.courses.map(([code]) => code).find((code) => category.subjects.includes(subjectOf(code)));

/** Most sessions first; ties keep their order. */
export function byPopularity(tutors: Tutor[]): Tutor[] {
  return [...tutors].sort((a, b) => b.sessions - a.sessions);
}

/** A tutor and the course to show on their card (and to open them with). */
export interface Pick {
  tutor: Tutor;
  course: string;
}

/** Tutors who teach in the category, most popular first, each with their course in it. */
export function tutorsIn(tutors: Tutor[], category: Category): Pick[] {
  return byPopularity(tutors).flatMap((tutor) => {
    const course = teachesIn(tutor, category);
    return course ? [{ tutor, course }] : [];
  });
}

/** The categories with at least one tutor — the only ones worth a tab. */
export function populatedCategories(tutors: Tutor[]): Category[] {
  return CATEGORIES.filter((c) => tutors.some((t) => teachesIn(t, c)));
}

export interface ForYou {
  title: string;
  picks: Pick[];
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
/** Enough for a carousel; more would just repeat the list underneath it. */
const MAX_PICKS = 10;
/** "No major yet" is not a major to match tutors on. */
const NO_MAJOR = /^(undeclared|undecided)$/i;

/**
 * The carousel on "For you": tutors for the courses the student is taking (each shown with
 * the course they share), or else tutors in the student's major. Null when neither finds
 * anyone — the screen then shows only the popular list rather than repeating it.
 *
 * The major match is exact text. Majors are picked from a list at sign-up, but Edit profile
 * also takes other wording, so a differently-worded major simply finds no one.
 */
export function forYou(tutors: Tutor[], myCourses: string[], myMajor: string | null): ForYou | null {
  const ranked = byPopularity(tutors);

  const mine = myCourses.map((c) => c.trim()).filter(Boolean);
  const forCourses = ranked.flatMap((tutor) => {
    const course = tutor.courses.map(([code]) => code).find((code) => mine.some((m) => same(m, code)));
    return course ? [{ tutor, course }] : [];
  });
  if (forCourses.length > 0) return { title: 'For your courses', picks: forCourses.slice(0, MAX_PICKS) };

  const major = myMajor?.trim();
  if (major && !NO_MAJOR.test(major)) {
    const inMajor = ranked
      .filter((tutor) => same(tutor.major, major))
      .map((tutor) => ({ tutor, course: tutor.courses[0]?.[0] ?? '' }));
    if (inMajor.length > 0) return { title: `In your major · ${major}`, picks: inMajor.slice(0, MAX_PICKS) };
  }
  return null;
}

/** The tutor's code for exactly this course, if they teach it. */
const teaches = (tutor: Tutor, course: string): string | undefined =>
  tutor.courses.map(([code]) => code).find((code) => same(code, course));

/**
 * The tutors a search query finds. A query that is exactly a course some tutor teaches
 * finds only that course's tutors — "IS 200" must not also list "MIS 200", which a plain
 * substring match would. Anything else matches a tutor's name or any part of a course code,
 * so "mgt" still finds "MGT 300". An empty query finds everyone.
 */
export function searchTutors(tutors: Tutor[], query: string): Tutor[] {
  const q = query.trim().toLowerCase();
  if (!q) return tutors;
  const exact = tutors.filter((tutor) => teaches(tutor, q));
  if (exact.length > 0) return exact;
  return tutors.filter(
    (tutor) => tutor.name.toLowerCase().includes(q) || tutor.courses.some(([code]) => code.toLowerCase().includes(q)),
  );
}

/** The course to show on (and book with) a tutor the query found: the exact course, else the
 *  first code containing the query, else the tutor's first course. Never a made-up default. */
export function courseForQuery(tutor: Tutor, query: string): string {
  const q = query.trim().toLowerCase();
  const codes = tutor.courses.map(([code]) => code);
  return (q && (teaches(tutor, q) ?? codes.find((c) => c.toLowerCase().includes(q)))) || codes[0] || '';
}

/**
 * ERR-015: the Home card "Studying MATH 227?" always named the student's FIRST course and
 * its button opened whichever tutor happened to be first in the list, who usually didn't
 * teach it. This picks the course the card should name: the first of the student's courses
 * that a tutor actually teaches, spelled the way the tutor lists it so it can seed the
 * search (searchTutors then finds exactly that course's tutors). Null when no tutor teaches
 * any of them — the card is hidden rather than promising a tutor that isn't there.
 */
export function nudgeCourse(tutors: Tutor[], myCourses: string[]): string | null {
  const codes = tutors.flatMap((tutor) => tutor.courses.map(([code]) => code));
  for (const mine of myCourses) {
    if (!mine.trim()) continue;
    const taught = codes.find((code) => same(mine, code));
    if (taught) return taught.trim();
  }
  return null;
}
