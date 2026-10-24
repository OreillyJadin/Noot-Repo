// Verify write-once DOB storage and server-side signup age checks against local Supabase.
//   pnpm dlx tsx scripts/verify_age_gate.mts
import { createClient } from '@supabase/supabase-js';
import { DEV_PASSWORD } from './_devPassword.mjs';

const URL = 'http://127.0.0.1:54321';
const ANON =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const svc = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const tag = Date.now();
const created: string[] = [];
const tutorChargeStates: Array<{ userId: string; enabled: boolean }> = [];
let pass = 0;
let fail = 0;

const check = (name: string, ok: boolean, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const dateAtAge = (years: number) => {
  const today = new Date();
  return new Date(Date.UTC(today.getUTCFullYear() - years, today.getUTCMonth(), today.getUTCDate()))
    .toISOString().slice(0, 10);
};
const tomorrow = () => {
  const today = new Date();
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1))
    .toISOString().slice(0, 10);
};

async function createUser(label: string, dateOfBirth?: string) {
  const email = `age-gate-${label}-${tag}@crimson.ua.edu`;
  const { data, error } = await svc.auth.admin.createUser({
    email,
    password: DEV_PASSWORD,
    email_confirm: true,
    ...(dateOfBirth ? { user_metadata: { first_name: 'Age Gate', last_name: label, date_of_birth: dateOfBirth } } : {}),
  });
  if (error || !data.user) throw error ?? new Error(`createUser failed: ${label}`);
  created.push(data.user.id);
  return { email, id: data.user.id };
}

async function signIn(email: string) {
  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: DEV_PASSWORD });
  if (error || !data.session) throw error ?? new Error(`sign-in failed: ${email}`);
  return client;
}

try {
  const student = await createUser('student');
  const studentClient = await signIn(student.email);

  const direct = await studentClient.from('users')
    .update({ date_of_birth: dateAtAge(30) })
    .eq('id', student.id)
    .select('id');
  const { data: afterDirect } = await svc.from('users').select('date_of_birth').eq('id', student.id).single();
  check(
    'authenticated direct DOB update is refused',
    direct.error?.code === '42501' && afterDirect?.date_of_birth == null,
    direct.error?.message ?? `DOB=${afterDirect?.date_of_birth ?? 'null'}`,
  );

  const future = await studentClient.rpc('confirm_date_of_birth', { p_dob: tomorrow() });
  check('RPC rejects a future date', future.error?.code === '22023', future.error?.message ?? String(future.data));

  const underageDob = dateAtAge(10);
  const underage = await studentClient.rpc('confirm_date_of_birth', { p_dob: underageDob });
  const { data: underageRow } = await svc.from('users').select('date_of_birth').eq('id', student.id).single();
  check(
    'underage DOB is stored and RPC returns false',
    !underage.error && underage.data === false && underageRow?.date_of_birth === underageDob,
    underage.error?.message ?? `${underage.data}; stored=${underageRow?.date_of_birth}`,
  );

  const changed = await studentClient.rpc('confirm_date_of_birth', { p_dob: dateAtAge(30) });
  check(
    'a different second DOB is refused',
    !!changed.error && changed.error.message === "Date of birth can't be changed. Contact support@trynoot.com.",
    changed.error?.message ?? String(changed.data),
  );

  const adult = await createUser('adult');
  const adultClient = await signIn(adult.email);
  const adultDob = dateAtAge(30);
  const confirmedAdult = await adultClient.rpc('confirm_date_of_birth', { p_dob: adultDob });
  const isAdult = await svc.rpc('is_adult', { p_uid: adult.id });
  check(
    'adult DOB returns true and is_adult agrees',
    !confirmedAdult.error && confirmedAdult.data === true && !isAdult.error && isAdult.data === true,
    confirmedAdult.error?.message ?? isAdult.error?.message ?? `${confirmedAdult.data}/${isAdult.data}`,
  );

  const rejectedSignup = await svc.auth.admin.createUser({
    email: `age-gate-underage-signup-${tag}@crimson.ua.edu`,
    password: DEV_PASSWORD,
    email_confirm: true,
    user_metadata: { date_of_birth: underageDob },
  });
  if (rejectedSignup.data.user) created.push(rejectedSignup.data.user.id);
  check('admin signup with underage DOB is rejected', !!rejectedSignup.error, rejectedSignup.error?.message ?? '');

  const adultSignup = await createUser('adult-metadata', adultDob);
  const { data: metadataRow, error: metadataError } = await svc.from('users')
    .select('date_of_birth')
    .eq('id', adultSignup.id)
    .single();
  check(
    'adult signup metadata stores DOB',
    !metadataError && metadataRow?.date_of_birth === adultDob,
    metadataError?.message ?? String(metadataRow?.date_of_birth),
  );

  const anon = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const anonRpc = await anon.rpc('confirm_date_of_birth', { p_dob: adultDob });
  check('anon cannot call confirm_date_of_birth', !!anonRpc.error, anonRpc.error?.message ?? '');

  if (process.env.VERIFY_BOOKING_AGE_FUNCTIONS === '1') {
    const edgeStudent = await createUser('edge-function');
    const edgeClient = await signIn(edgeStudent.email);
    const { data: session } = await edgeClient.auth.getSession();
    const { data: tutor, error: tutorError } = await svc.from('users')
      .select('id')
      .eq('email', 'sara@crimson.ua.edu')
      .single();
    if (tutorError || !tutor) throw tutorError ?? new Error('Seed Sara before the optional Edge Function check');
    const { data: tutorProfile, error: tutorProfileError } = await svc.from('tutor_profiles')
      .select('stripe_charges_enabled')
      .eq('user_id', tutor.id)
      .single();
    if (tutorProfileError || !tutorProfile) throw tutorProfileError ?? new Error('Sara profile not found');
    tutorChargeStates.push({ userId: tutor.id, enabled: tutorProfile.stripe_charges_enabled });
    const { error: enableTutorError } = await svc.from('tutor_profiles')
      .update({ stripe_charges_enabled: true })
      .eq('user_id', tutor.id);
    if (enableTutorError) throw enableTutorError;
    const { data: course, error: courseError } = await svc.from('tutor_courses')
      .select('course_code')
      .eq('tutor_id', tutor.id)
      .limit(1)
      .single();
    if (courseError || !course) throw courseError ?? new Error('Seed a course for Sara before the optional Edge Function check');
    const { data: availability, error: availabilityError } = await svc.from('tutor_availability')
      .select('day_of_week,start_time,end_time')
      .eq('tutor_id', tutor.id);
    if (availabilityError) throw availabilityError;
    const { data: bookings, error: bookingsError } = await svc.from('bookings')
      .select('scheduled_at,duration_minutes')
      .eq('tutor_id', tutor.id)
      .in('status', ['pending', 'confirmed']);
    if (bookingsError) throw bookingsError;

    const chicago = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    const partsAt = (date: Date) =>
      Object.fromEntries(chicago.formatToParts(date).map((part) => [part.type, part.value]));
    const chicagoSlot = (days: number, minutes: number) => {
      const local = partsAt(new Date());
      const date = new Date(Date.UTC(
        Number(local.year),
        Number(local.month) - 1,
        Number(local.day) + days,
      ));
      const target = Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        Math.floor(minutes / 60),
        minutes % 60,
      );
      let instant = target;
      for (let attempt = 0; attempt < 4; attempt++) {
        const parts = partsAt(new Date(instant));
        const represented = Date.UTC(
          Number(parts.year),
          Number(parts.month) - 1,
          Number(parts.day),
          Number(parts.hour),
          Number(parts.minute),
          Number(parts.second),
        );
        const adjusted = instant + target - represented;
        if (adjusted === instant) break;
        instant = adjusted;
      }
      return new Date(instant).toISOString();
    };
    const localDate = (days: number) => {
      const local = partsAt(new Date());
      return new Date(Date.UTC(
        Number(local.year),
        Number(local.month) - 1,
        Number(local.day) + days,
      ));
    };
    let scheduledAt: string | null = null;
    for (const days of [1, 2, 3, 4, 5, 6]) {
      const weekday = localDate(days).getUTCDay();
      for (const window of availability ?? []) {
        if (Number(window.day_of_week) !== weekday) continue;
        const toMinutes = (time: string) => {
          const [hour, minute] = time.slice(0, 5).split(':').map(Number);
          return hour * 60 + minute;
        };
        const startMinute = toMinutes(window.start_time);
        const endMinute = toMinutes(window.end_time);
        for (let minute = startMinute; minute + 60 <= endMinute; minute += 60) {
          const candidate = chicagoSlot(days, minute);
          const start = new Date(candidate).getTime();
          const end = start + 60 * 60_000;
          const overlaps = (bookings ?? []).some((booking) => {
            const bookedStart = new Date(booking.scheduled_at).getTime();
            const bookedEnd = bookedStart + Number(booking.duration_minutes) * 60_000;
            return bookedStart < end && start < bookedEnd;
          });
          if (start > Date.now() + 2 * 60 * 60_000 &&
              start < Date.now() + 6 * 86_400_000 && !overlaps) {
            scheduledAt = candidate;
            break;
          }
        }
        if (scheduledAt) break;
      }
      if (scheduledAt) break;
    }
    if (!scheduledAt) throw new Error('Could not find a free hour inside Sara availability');

    const body = {
      tutorId: tutor.id,
      courseCode: course.course_code,
      durationMinutes: 60,
      scheduledAt,
    };
    const call = async () => {
      const response = await fetch(`${URL}/functions/v1/create-payment-intent`, {
        method: 'POST',
        headers: {
          apikey: ANON,
          Authorization: `Bearer ${session.session?.access_token ?? ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() as Record<string, unknown> };
    };
    const denied = await call();
    check(
      'Edge Function denies a student without DOB before Stripe work',
      denied.status === 403 && denied.body.error === 'age_required',
      `${denied.status} ${String(denied.body.error ?? '')}`,
    );
    const ageConfirmation = await edgeClient.rpc('confirm_date_of_birth', { p_dob: adultDob });
    if (ageConfirmation.error) throw ageConfirmation.error;
    const allowed = await call();
    check(
      'Edge Function succeeds after adult DOB is confirmed without Stripe',
      allowed.status === 200 && allowed.body.simulated === true,
      `${allowed.status} ${String(allowed.body.error ?? allowed.body.simulated ?? '')}`,
    );
  }
} finally {
  for (const { userId, enabled } of tutorChargeStates) {
    const { error } = await svc.from('tutor_profiles')
      .update({ stripe_charges_enabled: enabled })
      .eq('user_id', userId);
    if (error) console.error(`restore tutor ${userId}: ${error.message}`);
  }
  for (const id of created) {
    const { error } = await svc.auth.admin.deleteUser(id);
    if (error) console.error(`cleanup ${id}: ${error.message}`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
