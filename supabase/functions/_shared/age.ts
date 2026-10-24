import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const STUDENT_AGE_REQUIRED_MESSAGE =
  "Confirm you're 18 or older to book. Sign out and back in to enter your date of birth.";

export class BookingAgeError extends Error {
  readonly code = 'age_required';
  readonly status = 403;

  constructor(message = STUDENT_AGE_REQUIRED_MESSAGE) {
    super(message);
    this.name = 'BookingAgeError';
  }
}

export async function requireBookingAge(
  db: SupabaseClient,
  studentId: string,
  tutorId: unknown,
): Promise<void> {
  const { data: studentIsAdult, error: studentError } = await db.rpc('is_adult', { p_uid: studentId });
  if (studentError) throw studentError;
  if (studentIsAdult !== true) throw new BookingAgeError();

  if (typeof tutorId !== 'string') return;
  const { data: tutor, error: tutorError } = await db
    .from('users')
    .select('date_of_birth')
    .eq('id', tutorId)
    .maybeSingle();
  if (tutorError) throw tutorError;
  if (!tutor?.date_of_birth) return;

  const { data: tutorIsAdult, error: tutorAgeError } = await db.rpc('is_adult', { p_uid: tutorId });
  if (tutorAgeError) throw tutorAgeError;
  if (tutorIsAdult !== true) throw new BookingAgeError('This tutor is not eligible to take bookings.');
}
