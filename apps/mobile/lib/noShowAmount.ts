import { studentFeeFor } from '@noot/core';
import type { BookingDraft } from './store';

export function noShowAmount(persona: 'student' | 'tutor', draft: BookingDraft, fallbackGross: number): number {
  if (persona === 'tutor') return draft.tutorPayoutAmount ?? fallbackGross;

  const price = draft.price ?? fallbackGross;
  const studentFee = draft.studentFee ?? studentFeeFor(price);
  const paidCents =
    Math.round(price * 100) +
    Math.round(studentFee * 100) -
    Math.round((draft.creditApplied ?? 0) * 100);
  return paidCents / 100;
}
