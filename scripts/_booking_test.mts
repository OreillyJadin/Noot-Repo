import type { SupabaseClient } from '@supabase/supabase-js';
import { campusParts } from '../packages/core/src/campusTime.ts';
import { DEV_PASSWORD } from './_devPassword.mjs';

/** A full hour inside one campus day, not a session straddling midnight. */
export function bookingTime(hoursAhead: number, now = Date.now()): string {
  let start = Math.ceil((now + hoursAhead * 3600_000) / 3600_000) * 3600_000;
  while (campusParts(start).minutes + 60 > 23 * 60 + 59 ||
    campusParts(start).day !== campusParts(start + 3600_000).day) {
    start += 3600_000;
  }
  return new Date(start).toISOString();
}

/** Isolated booking fixture: never broaden a seeded tutor's availability or payout flags. */
export async function createBookingTutor(db: SupabaseClient, prefix: string) {
  const email = `${prefix}-${crypto.randomUUID()}@crimson.ua.edu`;
  const { data, error } = await db.auth.admin.createUser({ email, password: DEV_PASSWORD, email_confirm: true });
  if (error || !data.user) throw error ?? new Error('Could not create fixture tutor');
  const id = data.user.id;
  const cleanup = async () => {
    const { error } = await db.auth.admin.deleteUser(id);
    if (error) throw error;
  };
  try {
    const { data: course, error: courseError } = await db.from('courses')
      .select('course_code').eq('is_active', true).limit(1).single();
    if (courseError || !course) throw courseError ?? new Error('Seed the course catalog first');
    const courseCode = course.course_code as string;
    const hourlyRate = 30;
    const { error: roleError } = await db.from('user_roles').insert({ user_id: id, role: 'tutor' });
    if (roleError) throw roleError;
    const { error: profileError } = await db.from('tutor_profiles').upsert({
      user_id: id, approval_status: 'approved', stripe_charges_enabled: true, hourly_rate: hourlyRate,
    });
    if (profileError) throw profileError;
    const { error: courseInsertError } = await db.from('tutor_courses').insert({
      tutor_id: id, course_code: courseCode, grade: 'A', hourly_rate: hourlyRate, sessions: 0,
    });
    if (courseInsertError) throw courseInsertError;
    const { error: availabilityError } = await db.from('tutor_availability').insert(
      Array.from({ length: 7 }, (_, day_of_week) => ({
        tutor_id: id, day_of_week, start_time: '00:00', end_time: '23:59',
      })),
    );
    if (availabilityError) throw availabilityError;
    return { id, email, courseCode, hourlyRate, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
