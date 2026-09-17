// Integration check for the write-side: drives the real @noot/core write methods
// (which invoke the Edge Functions) against a running local stack + `supabase functions serve`.
//   node --experimental-strip-types is not enough (dir imports) — run via tsx:
//   EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 pnpm dlx tsx scripts/verify_mutations.mts
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

initSupabase({ url: URL, anonKey: ANON });
console.log(`target: ${URL}`);

await check('auth.signInWithPassword(student)', async () => {
  const r = await auth.signInWithPassword('student@crimson.ua.edu', 'password123');
  if (!r.ok) throw new Error(r.error);
  return r;
});

const tutors = await api.tutors.search();
const tutorId = tutors[0]?.userId;
console.log(`   using tutorId=${tutorId} (${tutors[0]?.firstName})`);

const future = (days: number) => new Date(Date.now() + days * 86400_000).toISOString();

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

// payment (simulated, no Stripe key). No amount is sent — see verify_pricing.mts.
const pi = await check('createPaymentIntent', () =>
  api.createPaymentIntent({ tutorId: tutorId!, courseCode, durationMinutes: 60, scheduledAt: future(3) }));
// confirm-booking requires an authorized hold (T5). No-op on the simulated path.
await authorizeHold(pi?.paymentIntentId ?? '');

/** Hold + authorize in one step, for the bookings created further down. */
const heldIntent = async (scheduledAt: string) => {
  const p = await api.createPaymentIntent({ tutorId: tutorId!, courseCode, durationMinutes: 60, scheduledAt });
  await authorizeHold(p.paymentIntentId);
  return p.paymentIntentId;
};

// confirm a booking → should create a row + conversation
const b1 = await check('bookings.confirm', () =>
  api.bookings.confirm({
    tutorId: tutorId!, courseCode, scheduledAt: future(3), durationMinutes: 60,
    sessionType: 'in_person', location: 'Gorgas Library, Fl 2',
    message: 'Looking forward to the session!', paymentIntentId: pi?.paymentIntentId,
  }),
);

// it should now appear in listUpcoming
await check('listUpcoming contains new booking', async () => {
  const up = await api.listUpcoming();
  const found = up.some((b) => b.id === b1?.bookingId);
  if (!found) throw new Error(`booking ${b1?.bookingId} not in upcoming (${up.length} rows)`);
  return `${up.length} upcoming, new one present`;
});

// rate it (student → tutor)
await check('reviews.submit', () =>
  api.reviews.submit({ bookingId: b1?.bookingId, rating: 5, comment: 'Super helpful', happened: true }),
);

// reschedule propose (student) → accept (TUTOR). Accepting must come from the other
// party (T19) — a proposer accepting their own proposal is a one-sided rewrite of the
// session time, so this suite has to switch identities here.
await check('bookings.reschedule(propose)', () =>
  api.bookings.reschedule({ bookingId: b1?.bookingId, action: 'propose', newScheduledAt: future(5) }),
);
{
  const { data: tutorRow } = await admin.from('users').select('email').eq('id', tutorId!).single();
  await auth.signInWithPassword(tutorRow!.email as string, 'password123');
  await check('bookings.reschedule(accept, as the tutor)', () =>
    api.bookings.reschedule({ bookingId: b1?.bookingId, action: 'accept' }),
  );
  await auth.signInWithPassword('student@crimson.ua.edu', 'password123');
}

// second booking → cancel (student, >24h → 100% refund)
const pi2 = await heldIntent(future(4));
const b2 = await check('bookings.confirm #2', () =>
  api.bookings.confirm({
    tutorId: tutorId!, courseCode, scheduledAt: future(4), durationMinutes: 60,
    sessionType: 'in_person', location: 'Gorgas Library', paymentIntentId: pi2,
  }),
);
await check('bookings.cancel (expect 100% refund)', async () => {
  const r = await api.bookings.cancel(b2?.bookingId);
  if (r.refundPercent !== 100) throw new Error(`expected 100% got ${r.refundPercent}`);
  return r;
});

// third booking → report tutor no-show (student reports → full refund)
const pi3 = await heldIntent(future(1));
const b3 = await check('bookings.confirm #3', () =>
  api.bookings.confirm({
    tutorId: tutorId!, courseCode, scheduledAt: future(1), durationMinutes: 60,
    sessionType: 'in_person', location: 'Gorgas Library, Fl 2', paymentIntentId: pi3,
  }),
);
// A no-show can only be reported once the session is actually over (T17), so backdate it
// rather than asserting the old, unguarded behaviour.
await admin
  .from('bookings')
  .update({ scheduled_at: new Date(Date.now() - 3 * 3600_000).toISOString() })
  .eq('id', b3?.bookingId);
await check('bookings.reportNoShow(tutor)', async () => {
  const r = await api.bookings.reportNoShow({ bookingId: b3?.bookingId, party: 'tutor' });
  if (r.status !== 'no_show') throw new Error(`expected no_show got ${r.status}`);
  return r;
});

await auth.signOut();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
