// Demo data ported from design_handoff_noot_app/app/booking-data.jsx.
// The TUTORS/REVIEWS_POOL arrays are the offline fallback; live screens now fetch via
// @noot/core and map into these same shapes with the adapters at the bottom of this file.
// Availability (DAYS/slotsFor) is still client-derived — real availability wiring is TODO.
import type { ReviewSummary, TutorSummary } from '@noot/core';

export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface Day {
  i: number;
  dow: string;
  dom: number;
  month: string;
  label: string;
}

function buildDays(): Day[] {
  const start = new Date(2026, 5, 16); // Jun 16 2026 (Mon)
  const out: Day[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out.push({
      i,
      dow: DOW[d.getDay()]!,
      dom: d.getDate(),
      month: MONTHS[d.getMonth()]!,
      label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `${DOW[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}`,
    });
  }
  return out;
}

export const DAYS = buildDays();

/** Per-tutor availability: map of dayIndex -> array of time-slot strings. */
export function slotsFor(seed: number): Record<number, string[]> {
  const pool = ['9:00 AM', '10:30 AM', '12:00 PM', '1:30 PM', '3:00 PM', '4:30 PM', '6:00 PM', '7:30 PM'];
  const map: Record<number, string[]> = {};
  for (let d = 0; d < 14; d++) {
    if ((d + seed) % 7 === 3 || (d + seed) % 5 === 0) continue;
    const n = ((d * 7 + seed * 3) % 4) + 2;
    const start = (d + seed) % 3;
    map[d] = pool.filter((_, idx) => idx >= start).slice(0, n);
  }
  return map;
}

export interface Review {
  name: string;
  course: string;
  rating: number;
  when: string;
  text: string;
}

export const REVIEWS_POOL: Review[] = [
  { name: 'Jordan M.', course: 'MGT 300', rating: 5, when: '2 weeks ago', text: "Explained the case-study framework better than the professor. Walked out actually understanding Porter's Five Forces." },
  { name: 'Priya S.', course: 'MGT 300', rating: 5, when: '3 weeks ago', text: 'Super patient and great with exam prep. We did three practice problems and I nailed the midterm.' },
  { name: 'Chris D.', course: 'MGT 301', rating: 4, when: 'Last month', text: 'Knows the material cold. A little fast at first but slowed down when I asked.' },
  { name: 'Mariah T.', course: 'MGT 300', rating: 5, when: 'Last month', text: 'Met me at Gorgas and we went through the whole study guide. Booked again the next week.' },
  { name: 'Sam W.', course: 'MGT 300', rating: 5, when: '5 weeks ago', text: 'Took the same class with the same prof, so the tips were exactly on point.' },
];

export interface Tutor {
  id: string;
  name: string;
  year: string;
  major: string;
  rating: number;
  sessions: number;
  rate: number;
  gender: 'f' | 'm';
  verified: string;
  next: number;
  nextLabel: string;
  bio: string;
  /** [courseCode, grade, rate, sessions] */
  courses: [string, string, number, number][];
}

export const TUTORS: Tutor[] = [
  { id: 'sara', name: 'Sara W.', year: 'Senior', major: 'Management', rating: 4.9, sessions: 48, rate: 28, gender: 'f', verified: 'A', next: 0, nextLabel: 'Today 3:00 PM',
    bio: 'Senior in Management, minoring in Econ. I took MGT 300 with Prof. Reynolds and pulled an A — I know exactly what shows up on his exams. I focus on the case frameworks and make them stick.',
    courses: [['MGT 300', 'A', 28, 48], ['MGT 301', 'A-', 26, 12], ['EC 110', 'A', 22, 9]] },
  { id: 'devon', name: 'Devon R.', year: 'Grad', major: 'MBA', rating: 5.0, sessions: 71, rate: 34, gender: 'm', verified: 'A', next: 1, nextLabel: 'Tomorrow 10:30 AM',
    bio: "First-year MBA and former undergrad TA for MGT 300. I've coached 70+ sessions on this exact course. Strong on strategy frameworks, financial ratios, and exam timing.",
    courses: [['MGT 300', 'A', 34, 52], ['MGT 410', 'A', 38, 19]] },
  { id: 'maya', name: 'Maya P.', year: 'Junior', major: 'Marketing', rating: 4.8, sessions: 23, rate: 22, gender: 'f', verified: 'A-', next: 0, nextLabel: 'Today 6:00 PM',
    bio: "Junior in Marketing. MGT 300 clicked for me once I stopped memorizing and started drawing the frameworks out. I'll show you how. Friendly, no-judgment sessions.",
    courses: [['MGT 300', 'A-', 22, 18], ['MKT 300', 'A', 24, 14]] },
  { id: 'alex', name: 'Alex J.', year: 'Senior', major: 'Finance', rating: 4.7, sessions: 31, rate: 25, gender: 'm', verified: 'A', next: 2, nextLabel: 'Wed 1:30 PM',
    bio: 'Finance senior. I tutor MGT 300 and the quantitative side of the business core. Great if you want to drill practice problems before an exam.',
    courses: [['MGT 300', 'A', 25, 21], ['FI 302', 'A', 30, 16]] },
  { id: 'nina', name: 'Nina K.', year: 'Grad', major: 'Management', rating: 4.9, sessions: 56, rate: 30, gender: 'f', verified: 'A', next: 3, nextLabel: 'Thu 9:00 AM',
    bio: 'PhD student in Management and current MGT 300 lab instructor. I teach this material every semester — I can demystify any topic on the syllabus.',
    courses: [['MGT 300', 'A', 30, 44], ['MGT 486', 'A', 40, 12]] },
  { id: 'kofi', name: 'Kofi A.', year: 'Junior', major: 'Economics', rating: 4.6, sessions: 14, rate: 19, gender: 'm', verified: 'B+', next: 1, nextLabel: 'Tomorrow 4:30 PM',
    bio: "Econ junior, newer tutor but I love teaching. Affordable rate while I build up reviews. Patient and thorough — we'll go at your pace.",
    courses: [['MGT 300', 'B+', 19, 11], ['EC 111', 'A', 20, 8]] },
];

export function tutorById(id: string): Tutor | undefined {
  return TUTORS.find((t) => t.id === id);
}

export function reviewsFor(_course: string): Review[] {
  return REVIEWS_POOL;
}

// ── adapters: @noot/core API shapes → the UI Tutor/Review shapes above ──────────
// Screens keep rendering exactly as before; only the data source changes.

function relativeWhen(iso: string): string {
  const then = new Date(iso).getTime();
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'Last week';
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return 'Last month';
}

/** TutorSummary (users+profile+courses) → the mock Tutor card shape. */
export function toTutor(s: TutorSummary): Tutor {
  const name = s.lastName ? `${s.firstName} ${s.lastName.charAt(0)}.` : s.firstName;
  const courses: Tutor['courses'] = s.courses.length
    ? s.courses.map((c) => [c.courseCode, c.grade ?? '', c.hourlyRate, c.sessions])
    : s.subjects.map((code) => [code, s.verifiedGrade ?? '', s.hourlyRate, 0]);
  const rate = s.hourlyRate || Math.min(...courses.map((c) => c[2]));
  return {
    id: s.userId,
    name,
    year: s.year ?? '',
    major: s.major ?? '',
    rating: s.ratingAvg ?? 0,
    sessions: s.totalSessions,
    rate,
    gender: s.gender ?? 'f',
    verified: s.verifiedGrade ?? 'A',
    next: 0,
    nextLabel: '',
    bio: s.bio,
    courses,
  };
}

/** ReviewSummary → the mock Review shape (reviewer name + course + relative time). */
export function toReview(r: ReviewSummary): Review {
  return {
    name: r.reviewerName || 'Student',
    course: r.course,
    rating: r.rating,
    when: relativeWhen(r.createdAt),
    text: r.comment ?? '',
  };
}
