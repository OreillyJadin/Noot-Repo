// Shape + adapter layer between @noot/core and the ported UI. Live screens fetch via
// @noot/core and map into the UI Tutor/Review shapes with the adapters at the bottom.
// DAYS is the real 14-day booking window (from today); per-tutor availability slots come
// from api.tutors.getAvailability(...) via lib/availability.ts (no more mock generator).
import type { ReviewSummary, TutorSummary } from '@noot/core';

export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface Day {
  i: number;
  /** 0-6 (Sun=0) — matches TutorAvailability.dayOfWeek for the real calendar. */
  dowNum: number;
  dow: string;
  dom: number;
  month: string;
  /** Full year, so a picked day maps to a real timestamp (not a hardcoded 2026). */
  year: number;
  label: string;
}

function buildDays(): Day[] {
  const start = new Date();
  start.setHours(0, 0, 0, 0); // real "today", local midnight
  const out: Day[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out.push({
      i,
      dowNum: d.getDay(),
      dow: DOW[d.getDay()]!,
      dom: d.getDate(),
      month: MONTHS[d.getMonth()]!,
      year: d.getFullYear(),
      label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `${DOW[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}`,
    });
  }
  return out;
}

export const DAYS = buildDays();

export interface Review {
  name: string;
  course: string;
  rating: number;
  when: string;
  text: string;
}

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
