// Tutor application gating (tracker T4) — which requirements are met, per onboarding step.
//
// The app's mirror of tutor_application_missing() in migration 0038, with the SAME keys.
// The server re-checks on submit (submit_tutor_application), so this only decides what the
// UI enables; it can't let an incomplete application through. Pure, so it's unit-tested.
import { MIN_HOURLY_RATE } from './pricing';

export type Requirement =
  | 'name'
  | 'photo'
  | 'courses'
  | 'rates'
  | 'availability'
  | 'transcript'
  | 'agreement'
  | 'payouts';

export interface ApplicationFacts {
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  courses: { hourlyRate: number }[];
  availabilityCount: number;
  transcriptUploaded: boolean;
  transcriptSkipped: boolean;
  agreementSignedAt: string | null;
  payoutsEnabled: boolean;
}

/** The requirements each onboarding step owns. Step 9 (review) and 10 own none. */
export const STEP_REQUIREMENTS: Readonly<Record<number, readonly Requirement[]>> = {
  2: ['name', 'photo'],
  3: ['courses'],
  4: ['rates'],
  5: ['availability'],
  6: ['transcript'],
  7: ['agreement'],
  8: ['payouts'],
};

/** What still stands between this application and "Submit for review", in step order. */
export function missingRequirements(f: ApplicationFacts): Requirement[] {
  const out: Requirement[] = [];
  if (!f.firstName.trim() || !f.lastName.trim()) out.push('name');
  if (!f.avatarUrl) out.push('photo');
  if (f.courses.length === 0) out.push('courses');
  if (f.courses.length === 0 || f.courses.some((c) => c.hourlyRate < MIN_HOURLY_RATE)) out.push('rates');
  if (f.availabilityCount === 0) out.push('availability');
  if (!f.transcriptUploaded && !f.transcriptSkipped) out.push('transcript');
  if (!f.agreementSignedAt) out.push('agreement');
  if (!f.payoutsEnabled) out.push('payouts');
  return out;
}

export function stepComplete(step: number, missing: readonly Requirement[]): boolean {
  return (STEP_REQUIREMENTS[step] ?? []).every((r) => !missing.includes(r));
}

/** The first step with something left to do (2–8), or 9 (review) when nothing is missing. */
export function firstIncompleteStep(missing: readonly Requirement[]): number {
  for (let step = 2; step <= 8; step++) if (!stepComplete(step, missing)) return step;
  return 9;
}

/** Plain-English label for a requirement, for "still to do" lists. */
export const REQUIREMENT_LABEL: Readonly<Record<Requirement, string>> = {
  name: 'Your first and last name',
  photo: 'A profile photo',
  courses: 'At least one course',
  rates: 'A rate for every course',
  availability: 'Your weekly availability',
  transcript: 'A transcript, or choosing to sign up unverified',
  agreement: 'The signed tutor agreement',
  payouts: 'Stripe payout setup',
};

/**
 * Version stamp stored with each signature (tutor_profiles.agreement_version), so a
 * signature always points at the exact text signed. PLACEHOLDER text is in use (D6); bump
 * this when the real agreement replaces it, and tutors re-sign.
 */
export const AGREEMENT_VERSION = '2026-09-23-placeholder';
