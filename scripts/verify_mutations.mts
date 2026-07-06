// Integration check for the write-side: drives the real @noot/core write methods
// (which invoke the Edge Functions) against a running local stack + `supabase functions serve`.
//   node --experimental-strip-types is not enough (dir imports) — run via tsx:
//   EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 pnpm dlx tsx scripts/verify_mutations.mts
import { initSupabase, api, auth } from '../packages/core/src/index.ts';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

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

await check('auth.devSignIn(student)', async () => {
  const r = await auth.devSignIn('student@crimson.ua.edu', 'password123');
  if (!r.ok) throw new Error(r.error);
  return r;
});

const tutors = await api.tutors.search();
const tutorId = tutors[0]?.userId;
console.log(`   using tutorId=${tutorId} (${tutors[0]?.firstName})`);

const future = (days: number) => new Date(Date.now() + days * 86400_000).toISOString();

// payment (simulated, no Stripe key)
const pi = await check('createPaymentIntent(2800)', () => api.createPaymentIntent(2800));

// confirm a booking → should create a row + conversation
const b1 = await check('bookings.confirm', () =>
  api.bookings.confirm({
    tutorId: tutorId!, subject: 'MGT 300', scheduledAt: future(3), durationMinutes: 60,
    sessionType: 'video', meetingLink: 'https://zoom.us/j/verify', price: 28,
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

// reschedule propose → accept
await check('bookings.reschedule(propose)', () =>
  api.bookings.reschedule({ bookingId: b1?.bookingId, action: 'propose', newScheduledAt: future(5) }),
);
await check('bookings.reschedule(accept)', () =>
  api.bookings.reschedule({ bookingId: b1?.bookingId, action: 'accept' }),
);

// second booking → cancel (student, >24h → 100% refund)
const b2 = await check('bookings.confirm #2', () =>
  api.bookings.confirm({
    tutorId: tutorId!, subject: 'MGT 300', scheduledAt: future(4), durationMinutes: 60,
    sessionType: 'in_person', location: 'Gorgas Library', price: 28,
  }),
);
await check('bookings.cancel (expect 100% refund)', async () => {
  const r = await api.bookings.cancel(b2?.bookingId);
  if (r.refundPercent !== 100) throw new Error(`expected 100% got ${r.refundPercent}`);
  return r;
});

// third booking → report tutor no-show (student reports → full refund)
const b3 = await check('bookings.confirm #3', () =>
  api.bookings.confirm({
    tutorId: tutorId!, subject: 'MGT 300', scheduledAt: future(1), durationMinutes: 60,
    sessionType: 'video', meetingLink: 'https://zoom.us/j/x', price: 28,
  }),
);
await check('bookings.reportNoShow(tutor)', async () => {
  const r = await api.bookings.reportNoShow({ bookingId: b3?.bookingId, party: 'tutor' });
  if (r.status !== 'no_show') throw new Error(`expected no_show got ${r.status}`);
  return r;
});

await auth.signOut();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
