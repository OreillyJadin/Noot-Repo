// Integration check for the write-side: drives the real @noot/core write methods
// (which invoke the Edge Functions) against a running local stack + `supabase functions serve`.
//   node --experimental-strip-types is not enough (dir imports) — run via tsx:
//   EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 pnpm dlx tsx scripts/verify_mutations.mts
import { DEV_PASSWORD } from './_devPassword.mjs';
import { initSupabase, api, auth } from '../packages/core/src/index.ts';
import { createClient } from '@supabase/supabase-js';
import { authorizeHold } from './_stripe_test.mts';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

// Service-role client, only to put the demo tutor into a bookable state (charges
// enabled) — the local service_role key is a published dev constant.
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

let pass = 0, fail = 0;
async function check(name: string, fn: () => Promise<unknown>) {
  try {
    const r = await fn();
    console.log(`✅ ${name}: ${JSON.stringify(r)?.slice(0, 200)}`);
    pass++;
    return r as any;
  } catch (e) {
    console.log(`❌ ${name}: ${(e as Error).message}`);
    fail++;
    return null;
  }
}

async function assertBookingNotification(userId: string, bookingId: string, title: string) {
  const { data, error } = await admin
    .from('notifications')
    .select('id, title, data')
    .eq('user_id', userId)
    .eq('type', 'booking')
    .eq('title', title)
    .contains('data', { bookingId })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`missing '${title}' notification for booking ${bookingId}`);
  return data;
}

initSupabase({ url: URL, anonKey: ANON });
console.log(`target: ${URL}`);

const { data: studentRow, error: studentErr } = await admin
  .from('users')
  .select('id')
  .eq('email', 'student@crimson.ua.edu')
  .single();
if (studentErr || !studentRow) throw studentErr ?? new Error('seeded student not found');
const studentId = studentRow.id as string;

await check('auth.signInWithPassword(student)', async () => {
  const r = await auth.signInWithPassword('student@crimson.ua.edu', DEV_PASSWORD);
  if (!r.ok) throw new Error(r.error);
  return r;
});

const tutors = await api.tutors.search();
const tutor = tutors.find((candidate) =>
  candidate.firstName === 'Sara' && candidate.lastName === 'Williams');
const tutorId = tutor?.userId;
console.log(`   using tutorId=${tutorId} (${tutor?.firstName} ${tutor?.lastName})`);
const { data: tutorUser } = await admin.from('users').select('email').eq('id', tutorId!).single();
const tutorEmail = tutorUser!.email as string;
const acceptAsTutor = async (bookingId: string | undefined) => {
  if (!bookingId) throw new Error('booking was not created');
  await auth.signInWithPassword(tutorEmail, DEV_PASSWORD);
  const result = await api.bookings.respond({ bookingId, action: 'accept' });
  await auth.signInWithPassword('student@crimson.ua.edu', DEV_PASSWORD);
  return result;
};

// Start from a clean slate: the server enforces a real double-booking check now, so
// bookings this suite left behind on a previous run would collide with its own slots.
await admin
  .from('bookings')
  .delete()
  .eq('tutor_id', tutorId!)
  .in('status', ['pending', 'confirmed'])
  .gte('scheduled_at', new Date().toISOString());

// The server derives the price from tutor_courses.hourly_rate (T5), so the tutor needs
// charges enabled and we book a course they actually teach.
await admin.from('tutor_profiles').update({ stripe_charges_enabled: true }).eq('user_id', tutorId!);
const { data: tcRow } = await admin
  .from('tutor_courses').select('course_code').eq('tutor_id', tutorId!).limit(1).single();
const courseCode = tcRow!.course_code as string;
const { data: availability, error: availabilityError } = await admin.from('tutor_availability')
  .select('day_of_week,start_time,end_time').eq('tutor_id', tutorId!);
if (availabilityError) throw availabilityError;
const { data: existingBookings, error: bookingsError } = await admin.from('bookings')
  .select('scheduled_at,duration_minutes').eq('tutor_id', tutorId!)
  .in('status', ['pending', 'confirmed']);
if (bookingsError) throw bookingsError;
const chicagoFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const partsAt = (date: Date) => Object.fromEntries(chicagoFormatter.formatToParts(date)
  .map((part) => [part.type, part.value]));
const chicagoSlot = (days: number, minutes: number) => {
  const local = partsAt(new Date());
  const date = new Date(Date.UTC(Number(local.year), Number(local.month) - 1, Number(local.day) + days));
  const target = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(),
    Math.floor(minutes / 60), minutes % 60);
  let instant = target;
  for (let i = 0; i < 4; i++) {
    const parts = partsAt(new Date(instant));
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second));
    const adjusted = instant + target - represented;
    if (adjusted === instant) break;
    instant = adjusted;
  }
  return new Date(instant).toISOString();
};
const weekdayAt = (days: number) => {
  const local = partsAt(new Date());
  return new Date(Date.UTC(Number(local.year), Number(local.month) - 1,
    Number(local.day) + days)).getUTCDay();
};
const minuteOf = (time: string) => {
  const [hour, minute] = time.slice(0, 5).split(':').map(Number);
  return hour * 60 + minute;
};
const selectedSlots: string[] = [];
const future = async (preferredDays: number) => {
  const offsets = [1, 2, 3, 4, 5, 6].sort((a, b) =>
    Math.abs(a - preferredDays) - Math.abs(b - preferredDays));
  for (const days of offsets) {
    for (const window of availability ?? []) {
      if (Number(window.day_of_week) !== weekdayAt(days)) continue;
      for (let minute = minuteOf(window.start_time as string);
        minute + 60 <= minuteOf(window.end_time as string); minute += 60) {
        const candidate = chicagoSlot(days, minute);
        const start = new Date(candidate).getTime();
        const end = start + 60 * 60_000;
        const overlaps = [...(existingBookings ?? []).map((booking) => {
          const bookingStart = new Date(booking.scheduled_at as string).getTime();
          return { start: bookingStart, end: bookingStart + Number(booking.duration_minutes) * 60_000 };
        }), ...selectedSlots.map((slot) => {
          const slotStart = new Date(slot).getTime();
          return { start: slotStart, end: slotStart + 60 * 60_000 };
        })].some((booking) => booking.start < end && start < booking.end);
        if (start > Date.now() + 2 * 60 * 60_000 && start < Date.now() + 6 * 86_400_000 && !overlaps) {
          selectedSlots.push(candidate);
          return candidate;
        }
      }
    }
  }
  throw new Error('Could not find a free hour inside tutor availability and the six-day booking horizon');
};
const futureByDays = new Map<number, string>();
for (const days of [3, 5, 4, 1]) futureByDays.set(days, await future(days));
const scheduledAt = (days: number) => {
  const slot = futureByDays.get(days);
  if (!slot) throw new Error(`No prepared booking slot for day ${days}`);
  return slot;
};

// payment (simulated, no Stripe key). No amount is sent — see verify_pricing.mts.
const pi = await check('createPaymentIntent', () =>
  api.createPaymentIntent({ tutorId: tutorId!, courseCode, durationMinutes: 60, scheduledAt: scheduledAt(3) }));
// confirm-booking requires an authorized hold (T5). No-op on the simulated path.
await authorizeHold(pi?.paymentIntentId ?? '');

/** Hold + authorize in one step, for the bookings created further down. */
const heldIntent = async (scheduledAt: string) => {
  const p = await api.createPaymentIntent({ tutorId: tutorId!, courseCode, durationMinutes: 60, scheduledAt });
  await authorizeHold(p.paymentIntentId);
  return p.paymentIntentId;
};

// confirm a booking → should create a pending row without opening a conversation
const b1 = await check('bookings.confirm', () =>
  api.bookings.confirm({
    tutorId: tutorId!, courseCode, scheduledAt: scheduledAt(3), durationMinutes: 60,
    sessionType: 'in_person', location: 'Gorgas Library, Fl 2',
    message: 'Looking forward to the session!', paymentIntentId: pi?.paymentIntentId,
  }),
);
await check('tutor accepts booking #1', () => acceptAsTutor(b1?.bookingId));

// it should now appear in listUpcoming
await check('listUpcoming contains new booking', async () => {
  const up = await api.listUpcoming();
  const found = up.some((b) => b.id === b1?.bookingId);
  if (!found) throw new Error(`booking ${b1?.bookingId} not in upcoming (${up.length} rows)`);
  return `${up.length} upcoming, new one present`;
});

// rate it (student → tutor)
await admin.from('bookings').update({
  status: 'completed',
  scheduled_at: new Date(Date.now() - 60 * 60_000).toISOString(),
}).eq('id', b1?.bookingId);
await check('reviews.submit', () =>
  api.reviews.submit({ bookingId: b1?.bookingId, rating: 5, comment: 'Super helpful', happened: true }),
);
await admin.from('bookings').update({
  status: 'confirmed',
  scheduled_at: scheduledAt(3),
}).eq('id', b1?.bookingId);

// reschedule propose (student) → accept (TUTOR). Accepting must come from the other
// party (T19) — a proposer accepting their own proposal is a one-sided rewrite of the
// session time, so this suite has to switch identities here.
await check('bookings.reschedule(propose)', () =>
  api.bookings.reschedule({ bookingId: b1?.bookingId, action: 'propose', newScheduledAt: scheduledAt(5) }),
);
await check('reschedule proposal notifies the tutor', () =>
  assertBookingNotification(tutorId!, b1?.bookingId, 'New time proposed'),
);
{
  const { data: tutorRow } = await admin.from('users').select('email').eq('id', tutorId!).single();
  await auth.signInWithPassword(tutorRow!.email as string, DEV_PASSWORD);
  await check('bookings.reschedule(accept, as the tutor)', () =>
    api.bookings.reschedule({ bookingId: b1?.bookingId, action: 'accept' }),
  );
  await check('reschedule acceptance notifies the student', () =>
    assertBookingNotification(studentId, b1?.bookingId, 'Session moved'),
  );
  await auth.signInWithPassword('student@crimson.ua.edu', DEV_PASSWORD);
  await check('bookings.reschedule(propose before decline)', () =>
    api.bookings.reschedule({ bookingId: b1?.bookingId, action: 'propose', newScheduledAt: scheduledAt(4) }),
  );
  await auth.signInWithPassword(tutorRow!.email as string, DEV_PASSWORD);
  await check('bookings.reschedule(decline, as the tutor)', () =>
    api.bookings.reschedule({ bookingId: b1?.bookingId, action: 'decline' }),
  );
  await check('reschedule decline notifies the student', () =>
    assertBookingNotification(studentId, b1?.bookingId, 'New time declined'),
  );
  await auth.signInWithPassword('student@crimson.ua.edu', DEV_PASSWORD);
}

// second booking → cancel (student, >24h → 100% refund)
const pi2 = await heldIntent(scheduledAt(4));
const b2 = await check('bookings.confirm #2', () =>
  api.bookings.confirm({
    tutorId: tutorId!, courseCode, scheduledAt: scheduledAt(4), durationMinutes: 60,
    sessionType: 'in_person', location: 'Gorgas Library', paymentIntentId: pi2,
  }),
);
await check('tutor accepts booking #2', () => acceptAsTutor(b2?.bookingId));
await check('bookings.cancel (expect 100% refund)', async () => {
  const r = await api.bookings.cancel(b2?.bookingId);
  if (r.refundPercent !== 100) throw new Error(`expected 100% got ${r.refundPercent}`);
  return r;
});
await check('confirmed student cancellation records attribution', async () => {
  const { data, error } = await admin.from('bookings')
    .select('cancelled_by_role,cancelled_from_status').eq('id', b2?.bookingId).single();
  if (error || data?.cancelled_by_role !== 'student' || data.cancelled_from_status !== 'confirmed') {
    throw error ?? new Error('confirmed student cancellation attribution was not recorded');
  }
  return data;
});

// third booking → report tutor no-show (student reports → full refund)
const pi3 = await heldIntent(scheduledAt(1));
const b3 = await check('bookings.confirm #3', () =>
  api.bookings.confirm({
    tutorId: tutorId!, courseCode, scheduledAt: scheduledAt(1), durationMinutes: 60,
    sessionType: 'in_person', location: 'Gorgas Library, Fl 2', paymentIntentId: pi3,
  }),
);
await check('tutor accepts booking #3', () => acceptAsTutor(b3?.bookingId));
// A no-show can only be reported once the session is actually over (T17), so backdate it
// rather than asserting the old, unguarded behaviour.
const { error: scheduleError } = await admin
  .from('bookings')
  .update({ scheduled_at: new Date(Date.now() - 6 * 3600_000).toISOString() })
  .eq('id', b3?.bookingId);
if (scheduleError) throw scheduleError;
await check('bookings.reportNoShow(tutor)', async () => {
  const r = await api.bookings.reportNoShow({ bookingId: b3?.bookingId, party: 'tutor' });
  if (r.status !== 'no_show') throw new Error(`expected no_show got ${r.status}`);
  return r;
});
await check('tutor no-show records the party', async () => {
  const { data, error } = await admin.from('bookings').select('no_show_party').eq('id', b3?.bookingId).single();
  if (error || data?.no_show_party !== 'tutor') throw error ?? new Error(`expected tutor, got ${data?.no_show_party}`);
  return data;
});

await auth.signOut();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
