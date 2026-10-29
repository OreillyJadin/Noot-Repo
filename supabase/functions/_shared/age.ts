import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const STUDENT_AGE_REQUIRED_MESSAGE = 'Add your date of birth to book a session.';
export const STUDENT_UNDER_AGE_MESSAGE = 'You must be 18 or older to book sessions on noot.';
export const TUTOR_UNDER_AGE_MESSAGE = 'This tutor is not eligible to take bookings.';

export type BookingAgeCode = 'age_required' | 'under_age';

/** `error` carries readable copy because shipped builds show it verbatim; clients branch on `code`. */
export class BookingAgeError extends Error {
  readonly status = 403;

  constructor(readonly code: BookingAgeCode, message: string) {
    super(message);
    this.name = 'BookingAgeError';
  }

  toBody() {
    return { error: this.message, code: this.code, message: this.message };
  }
}

/**
 * Students without a DOB may book until AGE_GATE_STRICT=true is set (old builds have no way to
 * enter one). A known under-18 DOB is always refused.
 */
function strictMode(): boolean {
  return Deno.env.get('AGE_GATE_STRICT') === 'true';
}

async function knownDob(db: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await db.from('users').select('date_of_birth').eq('id', userId).maybeSingle();
  if (error) throw error;
  return (data?.date_of_birth as string | null | undefined) ?? null;
}

async function isAdult(db: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await db.rpc('is_adult', { p_uid: userId });
  if (error) throw error;
  return data === true;
}

export async function requireBookingAge(
  db: SupabaseClient,
  studentId: string,
  tutorId: unknown,
): Promise<void> {
  if (!(await knownDob(db, studentId))) {
    if (strictMode()) throw new BookingAgeError('age_required', STUDENT_AGE_REQUIRED_MESSAGE);
  } else if (!(await isAdult(db, studentId))) {
    throw new BookingAgeError('under_age', STUDENT_UNDER_AGE_MESSAGE);
  }

  if (typeof tutorId !== 'string') return;
  if (!(await knownDob(db, tutorId))) return;
  if (!(await isAdult(db, tutorId))) throw new BookingAgeError('under_age', TUTOR_UNDER_AGE_MESSAGE);
}
