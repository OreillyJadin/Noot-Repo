import { createClient } from '@supabase/supabase-js';
import { DEV_PASSWORD } from './_devPassword.mjs';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!['127.0.0.1', 'localhost'].includes(new globalThis.URL(URL).hostname)) {
  throw new Error('verify_tutor_availability only runs against local Supabase');
}
if (!ANON || !SERVICE) throw new Error('Set local SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY');

const PASSWORD = DEV_PASSWORD;
const tag = Date.now();
const studentEmail = `availability-student-${tag}@crimson.ua.edu`;
const tutorEmail = `availability-tutor-${tag}@crimson.ua.edu`;
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const cleanup = { users: [] as string[], bookings: [] as string[], conversations: [] as string[] };
let pass = 0;
let fail = 0;
let stage = 'create users';

const step = (name: string, ok: boolean, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const call = async (name: string, body: unknown, token: string) => {
  const res = await fetch(`${URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { apikey: ANON!, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, any> };
};

const signIn = async (email: string) => {
  const client = createClient(URL, ANON!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !data.session) throw error ?? new Error(`No session for ${email}`);
  return data.session.access_token;
};

const makeUser = async (email: string, first: string, last: string) => {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error(`createUser ${email} failed`);
  cleanup.users.push(data.user.id);
  const { error: updateError } = await admin.from('users').update({
    first_name: first,
    last_name: last,
    status: 'active',
    password_set_at: new Date().toISOString(),
    terms_accepted_at: new Date().toISOString(),
    terms_version: '2026-09-17',
    guidelines_accepted_at: new Date().toISOString(),
    guidelines_version: '2026-10-13',
  }).eq('id', data.user.id);
  if (updateError) throw updateError;
  return data.user.id;
};

function chicagoDate(days: number) {
  const dateParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const parts = Object.fromEntries(dateParts.map((part) => [part.type, part.value]));
  const today = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + days));
  return {
    year: today.getUTCFullYear(),
    month: today.getUTCMonth() + 1,
    day: today.getUTCDate(),
    label: `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`,
  };
}

function chicagoTime(days: number, hour: number, minute = 0) {
  const date = chicagoDate(days);
  const target = Date.UTC(date.year, date.month - 1, date.day, hour, minute);
  let instant = target;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  for (let i = 0; i < 4; i++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
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
}

async function createBooking(
  studentToken: string,
  tutorId: string,
  courseCode: string,
  scheduledAt: string,
  durationMinutes = 60,
) {
  const input = { tutorId, courseCode, durationMinutes, scheduledAt };
  const pi = await call('create-payment-intent', input, studentToken);
  if (pi.status !== 200 || typeof pi.body.paymentIntentId !== 'string') {
    return { intent: pi, confirmation: null as null | Awaited<ReturnType<typeof call>> };
  }
  const confirmation = await call('confirm-booking', {
    ...input,
    sessionType: 'in_person',
    paymentIntentId: pi.body.paymentIntentId,
    message: 'Availability verification',
  }, studentToken);
  if (typeof confirmation.body.bookingId === 'string') cleanup.bookings.push(confirmation.body.bookingId);
  if (typeof confirmation.body.conversationId === 'string') cleanup.conversations.push(confirmation.body.conversationId);
  return { intent: pi, confirmation };
}

try {
  const studentId = await makeUser(studentEmail, 'Availability', 'Student');
  const tutorId = await makeUser(tutorEmail, 'Availability', 'Tutor');
  stage = 'provision tutor';

  const { data: course, error: courseError } = await admin
    .from('courses')
    .select('course_code')
    .eq('is_active', true)
    .limit(1)
    .single();
  if (courseError || !course) throw courseError ?? new Error('No active course');
  const courseCode = course.course_code as string;

  const { error: studentRoleError } = await admin.from('user_roles')
    .upsert({ user_id: studentId, role: 'student' }, { onConflict: 'user_id,role' });
  const { error: tutorRoleError } = await admin.from('user_roles')
    .upsert({ user_id: tutorId, role: 'tutor' }, { onConflict: 'user_id,role' });
  if (studentRoleError || tutorRoleError) throw studentRoleError ?? tutorRoleError;

  const { error: profileError } = await admin.from('tutor_profiles').upsert({
    user_id: tutorId,
    bio: 'Availability verification tutor',
    subjects: [courseCode],
    hourly_rate: 40,
    approval_status: 'approved',
    submitted_at: new Date().toISOString(),
    stripe_charges_enabled: true,
  }, { onConflict: 'user_id' });
  if (profileError) throw profileError;
  const { error: tutorCourseError } = await admin.from('tutor_courses').insert({
    tutor_id: tutorId,
    course_code: courseCode,
    grade: 'A',
    hourly_rate: 40,
    sessions: 0,
  });
  if (tutorCourseError) throw tutorCourseError;
  const { error: availabilityError } = await admin.from('tutor_availability').insert(
    Array.from({ length: 7 }, (_, day_of_week) => [
      { tutor_id: tutorId, day_of_week, start_time: '14:00', end_time: '17:00' },
      { tutor_id: tutorId, day_of_week, start_time: '17:00', end_time: '19:00' },
    ]).flat(),
  );
  if (availabilityError) throw availabilityError;

  const studentToken = await signIn(studentEmail);
  const tutorToken = await signIn(tutorEmail);
  stage = 'outside-window booking';

  const outside = chicagoTime(1, 9);
  const outsideInput = { tutorId, courseCode, durationMinutes: 60, scheduledAt: outside };
  const outsideIntent = await call('create-payment-intent', outsideInput, studentToken);
  step('09:00 Chicago create-payment-intent is refused with 409',
    outsideIntent.status === 409 && String(outsideIntent.body.error).includes('outside this tutor'),
    `status=${outsideIntent.status}`);

  const outsideConfirm = await call('confirm-booking', {
    ...outsideInput,
    sessionType: 'in_person',
    paymentIntentId: `sim_pi_availability_probe_${tag}`,
  }, studentToken);
  step('09:00 Chicago confirm-booking is refused with 409',
    outsideConfirm.status === 409 && String(outsideConfirm.body.error).includes('outside this tutor'),
    `status=${outsideConfirm.status}`);
  const { count: outsideCount, error: outsideCountError } = await admin.from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentId)
    .eq('tutor_id', tutorId)
    .eq('scheduled_at', outside);
  step('09:00 Chicago leaves no booking row', !outsideCountError && outsideCount === 0,
    `count=${outsideCount ?? 'error'}${outsideCountError ? ` (${outsideCountError.message})` : ''}`);

  stage = 'inside-window booking';
  const inside = await createBooking(studentToken, tutorId, courseCode, chicagoTime(1, 15));
  step('15:00 Chicago create-payment-intent succeeds', inside.intent.status === 200,
    `status=${inside.intent.status}`);
  step('15:00 Chicago booking succeeds', inside.confirmation?.status === 200,
    `status=${inside.confirmation?.status ?? 'not attempted'}`);

  stage = 'booking across adjacent windows';
  const acrossAdjacent = await createBooking(studentToken, tutorId, courseCode, chicagoTime(1, 16), 120);
  step('16:00 Chicago + 120 min booking spanning adjacent windows succeeds',
    acrossAdjacent.intent.status === 200 && acrossAdjacent.confirmation?.status === 200,
    `intent=${acrossAdjacent.intent.status}; confirmation=${acrossAdjacent.confirmation?.status ?? 'not attempted'}`);

  stage = 'availability end boundary';
  const atEnd = await call('create-payment-intent', {
    tutorId,
    courseCode,
    durationMinutes: 60,
    scheduledAt: chicagoTime(1, 19),
  }, studentToken);
  step('19:00 Chicago end boundary is excluded', atEnd.status === 409,
    `status=${atEnd.status}`);

  stage = 'inside end boundary';
  const beforeEnd = await createBooking(studentToken, tutorId, courseCode, chicagoTime(1, 18));
  step('18:00 Chicago + 60 min ends exactly at 19:00 and succeeds', beforeEnd.confirmation?.status === 200,
    `status=${beforeEnd.confirmation?.status ?? 'not attempted'}`);
  const startsInsideEndsOutside = await call('create-payment-intent', {
    tutorId,
    courseCode,
    durationMinutes: 60,
    scheduledAt: chicagoTime(1, 18, 30),
  }, studentToken);
  step('18:30 Chicago + 60 min is refused because it ends after 19:00',
    startsInsideEndsOutside.status === 409,
    `status=${startsInsideEndsOutside.status}`);

  stage = 'student reschedule';
  const rescheduleSourceAt = chicagoTime(2, 15);
  const reschedule = await createBooking(studentToken, tutorId, courseCode, rescheduleSourceAt);
  step('reschedule test booking is created', reschedule.confirmation?.status === 200,
    `status=${reschedule.confirmation?.status ?? 'not attempted'}`);
  const bookingId = reschedule.confirmation?.body.bookingId;
  if (reschedule.confirmation?.status === 200 && typeof bookingId === 'string') {
    const accepted = await call('respond-booking-request', { bookingId, action: 'accept' }, tutorToken);
    step('tutor accepts reschedule test booking', accepted.status === 200, `status=${accepted.status}`);
    const proposal = await call('reschedule-booking', {
      bookingId,
      action: 'propose',
      newScheduledAt: chicagoTime(2, 9),
    }, studentToken);
    step('student reschedule proposal to 09:00 Chicago is refused with 409',
      proposal.status === 409 && String(proposal.body.error).includes('outside this tutor'),
      `status=${proposal.status}`);
    const overrunProposal = await call('reschedule-booking', {
      bookingId,
      action: 'propose',
      newScheduledAt: chicagoTime(2, 18, 30),
    }, studentToken);
    step('student reschedule to 18:30 Chicago + 60 min is refused with 409',
      overrunProposal.status === 409 && String(overrunProposal.body.error).includes('outside this tutor'),
      `status=${overrunProposal.status}`);
  }

  stage = 'booking horizon';
  const beyondHorizon = await call('create-payment-intent', {
    tutorId,
    courseCode,
    durationMinutes: 60,
    scheduledAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  }, studentToken);
  step('seven-day request is refused by the six-day booking horizon',
    beyondHorizon.status === 400 && String(beyondHorizon.body.error).includes('6 days ahead'),
    `status=${beyondHorizon.status}; ${beyondHorizon.body.error ?? ''}`);

  stage = 'DST sanity';
  const dstFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
    hourCycle: 'h23',
  });
  const dstParts = (iso: string) =>
    Object.fromEntries(dstFormatter.formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
  const cdt = dstParts('2026-10-27T14:00:00.000Z');
  step('late-October UTC instant formats as 09:00 CDT',
    cdt.hour === '09' && cdt.timeZoneName === 'CDT',
    `${cdt.weekday} ${cdt.hour}:${cdt.minute} ${cdt.timeZoneName}`);
  const cst = dstParts('2026-11-10T15:00:00.000Z');
  step('mid-November UTC instant formats as 09:00 CST',
    cst.hour === '09' && cst.timeZoneName === 'CST',
    `${cst.weekday} ${cst.hour}:${cst.minute} ${cst.timeZoneName}; static timezone sanity, beyond current six-day booking horizon`);
} catch (error) {
  fail++;
  console.error(`❌ ${stage} — ${error instanceof Error ? error.message : String(error)}`);
} finally {
  const bookingIds = [...new Set(cleanup.bookings)];
  const conversationIds = [...new Set(cleanup.conversations)];
  if (bookingIds.length) {
    const { error } = await admin.from('reviews').delete().in('booking_id', bookingIds);
    if (error) {
      fail++;
      console.error(`❌ cleanup reviews — ${error.message}`);
    }
    const { error: bookingError } = await admin.from('bookings').delete().in('id', bookingIds);
    if (bookingError) {
      fail++;
      console.error(`❌ cleanup bookings — ${bookingError.message}`);
    }
    for (const bookingId of bookingIds) {
      const { error: notificationError } = await admin.from('notifications')
        .delete()
        .contains('data', { bookingId });
      if (notificationError) {
        fail++;
        console.error(`❌ cleanup booking notifications — ${notificationError.message}`);
      }
    }
  }
  if (conversationIds.length) {
    const { error } = await admin.from('conversations').delete().in('id', conversationIds);
    if (error) {
      fail++;
      console.error(`❌ cleanup conversations — ${error.message}`);
    }
  }
  for (const table of ['tutor_availability', 'tutor_courses']) {
    const { error } = await admin.from(table).delete().eq('tutor_id', cleanup.users[1] ?? '');
    if (error) {
      fail++;
      console.error(`❌ cleanup ${table} — ${error.message}`);
    }
  }
  if (cleanup.users[1]) {
    const { error } = await admin.from('tutor_profiles').delete().eq('user_id', cleanup.users[1]);
    if (error) {
      fail++;
      console.error(`❌ cleanup tutor_profiles — ${error.message}`);
    }
  }
  if (cleanup.users.length) {
    const { error: notificationError } = await admin.from('notifications').delete().in('user_id', cleanup.users);
    if (notificationError) {
      fail++;
      console.error(`❌ cleanup user notifications — ${notificationError.message}`);
    }
    const { error: roleError } = await admin.from('user_roles').delete().in('user_id', cleanup.users);
    if (roleError) {
      fail++;
      console.error(`❌ cleanup user roles — ${roleError.message}`);
    }
    const { error: userError } = await admin.from('users').delete().in('id', cleanup.users);
    if (userError) {
      fail++;
      console.error(`❌ cleanup users — ${userError.message}`);
    }
    for (const userId of cleanup.users) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error && error.message !== 'User not found') {
        fail++;
        console.error(`❌ cleanup auth user — ${error.message}`);
      }
    }
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
