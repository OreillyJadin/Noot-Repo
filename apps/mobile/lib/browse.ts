// What the Search tab shows before the student types anything — kept pure so it can be
// tested (test/browse.test.ts).
//
// ERR-010: "For you" showed the SAME unfiltered tutor list twice, once as a carousel and once
// as a list, both titled "Popular this week". The carousel is now picked for the student —
// tutors for the courses they're taking, or failing that tutors in their major — and the list
// is the popular one (most sessions first).
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
    subjects: ['AC', 'EC', 'FI', 'GBA', 'HCAN', 'IBA', 'LGS', 'MGT', 'MIS', 'MKT', 'OM', 'ST'],
  },
  {
    name: 'STEM',
    subjects: [
      'AEM', 'AY', 'BSC', 'CE', 'CH', 'CHE', 'CS', 'DR', 'ECE', 'ENGR', 'EPIC', 'GEO', 'GY', 'MATH',
      'ME', 'MFE', 'MS', 'MTE', 'NSE', 'PH',
    ],
  },
  {
    name: 'Humanities',
    subjects: [
      'AAST', 'ALA', 'AMS', 'ANT', 'ARB', 'AS', 'ASL', 'BUI', 'CC', 'CHI', 'CIP', 'CJ', 'CL', 'CRL',
      'CZE', 'EN', 'FA', 'FR', 'GDS', 'GES', 'GN', 'GR', 'GS', 'HY', 'IDMD', 'IT', 'JA', 'KOR', 'LA',
      'LAS', 'MDGR', 'MLC', 'NCLT', 'NEW', 'PHL', 'POR', 'PSC', 'PY', 'REL', 'RL', 'RRS', 'RUS', 'SOC',
      'SP', 'SS', 'THAI', 'UA', 'UAEC', 'UFE', 'UH', 'UKR', 'VIET', 'WS',
    ],
  },
  {
    name: 'Health',
    subjects: ['ATR', 'CHS', 'HD', 'HES', 'HHE', 'KIN', 'NHM', 'NUR', 'POPH', 'RCH', 'SLH', 'SW'],
  },
  {
    name: 'Arts & Media',
    subjects: [
      'APR', 'ARH', 'ART', 'BA', 'CIS', 'COM', 'CSM', 'CTD', 'DN', 'DNCA', 'HSM', 'IS', 'JCM', 'LS',
      'MC', 'MUA', 'MUS', 'MUSM', 'TH', 'THMT',
    ],
  },
  {
    name: 'Education',
    subjects: [
      'AFS', 'BCE', 'BEF', 'BEP', 'BER', 'CAT', 'CEE', 'CIE', 'CRD', 'CSE', 'EDU', 'MAP', 'MIL', 'MUE',
      'SPE',
    ],
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

/**
 * The carousel on "For you": tutors for the courses the student is taking (each shown with
 * the course they share), or else tutors in the student's major. Null when neither finds
 * anyone — the screen then shows only the popular list rather than repeating it.
 */
export function forYou(tutors: Tutor[], myCourses: string[], myMajor: string | null): ForYou | null {
  const ranked = byPopularity(tutors);

  const mine = myCourses.map((c) => c.trim()).filter(Boolean);
  const forCourses = ranked.flatMap((tutor) => {
    const course = tutor.courses.map(([code]) => code).find((code) => mine.some((m) => same(m, code)));
    return course ? [{ tutor, course }] : [];
  });
  if (forCourses.length > 0) return { title: 'For your courses', picks: forCourses };

  const major = myMajor?.trim();
  if (major) {
    const inMajor = ranked
      .filter((tutor) => same(tutor.major, major))
      .map((tutor) => ({ tutor, course: tutor.courses[0]?.[0] ?? '' }));
    if (inMajor.length > 0) return { title: `In your major · ${major}`, picks: inMajor };
  }
  return null;
}
