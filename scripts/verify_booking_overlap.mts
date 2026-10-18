// Verify migration 0063 against the LOCAL stack: the database refuses two live bookings
// for one tutor at once, and the Edge Functions turn a lost slot race into a 409 that
// releases the losing card hold.
//
// Needs: supabase start && node supabase/seed_demo.mjs &&
//        supabase functions serve --env-file <file with STRIPE_SECRET_KEY=sk_test_…>
//   pnpm dlx tsx scripts/verify_booking_overlap.mts
import { DEV_PASSWORD } from './_devPassword.mjs';
import { createClient } from '@supabase/supabase-js';
import { authorizeHold, cancelHold, getPaymentIntent, stripeTestMode } from './_stripe_test.mts';

const URL = 'http://127.0.0.1:54321';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const PASSWORD = DEV_PASSWORD;
const SLOT_TAKEN = 'Someone just booked that time, so you weren’t charged. Please pick another time.';
const RESCHED_TAKEN = 'That time was booked after it was suggested. Decline it and suggest another time.';

let pass = 0;
let fail = 0;
const step = (n: number | string, ok: boolean, msg: string, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`${n}) ${ok ? 'PASS ✅' : 'FAIL ❌'} — ${msg}${detail ? ` — ${detail}` : ''}`);
};

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });
const login = async (email: string) => {
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !data.session) throw error ?? new Error(`No session for ${email}`);
  return { client, token: data.session.access_token, id: data.user.id };
};
const call = async (name: string, body: unknown, token: string) => {
  const res = await fetch(`${URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, any> };
};

const { data: sara } = await svc.from('users').select('id').eq('email', 'sara@crimson.ua.edu').single();
const { data: devon } = await svc.from('users').select('id').eq('email', 'devon@crimson.ua.edu').single();
const { data: seeded } = await svc.from('users').select('id').eq('email', 'student@crimson.ua.edu').single();
if (!sara || !devon || !seeded) throw new Error('seeded users not found — run node supabase/seed_demo.mjs');
const T1 = sara.id as string;
const T2 = devon.id as string;
await svc.from('tutor_profiles').update({ stripe_charges_enabled: true }).in('user_id', [T1, T2]);
const { data: c1 } = await svc.from('tutor_courses').select('course_code').eq('tutor_id', T1).limit(1).single();
const { data: c2 } = await svc.from('tutor_courses').select('course_code').eq('tutor_id', T2).limit(1).single();
const COURSE1 = c1!.course_code as string;
const COURSE2 = c2!.course_code as string;

// Two fresh students, distinct from anything another suite left behind.
const tag = Date.now();
const studentIds: string[] = [];
const emails = [`olp-a-${tag}@crimson.ua.edu`, `olp-b-${tag}@crimson.ua.edu`];
for (const email of emails) {
  const { data, error } = await svc.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error || !data.user) throw error ?? new Error(`createUser ${email}`);
  studentIds.push(data.user.id);
}
const [SA, SB] = studentIds as [string, string];
const sA = await login(emails[0]!);
const sB = await login(emails[1]!);
const tutorLogin = await login('sara@crimson.ua.edu');

// Odd minute offsets inside the 6-day horizon, so the suite never trips over bookings
// other scripts made at whole-hour marks.
const base = Date.now() + 100 * 3600e3;
let slotN = 0;
// 90-minute spacing: slots for the same tutor must not overlap each other's 60-minute
// sessions (that is exactly what the constraint under test forbids).
const slot = () => new Date(base + slotN++ * 90 * 60e3 + 7 * 60e3).toISOString();

const bookingIds: string[] = [];
const pis: string[] = [];
const mkBooking = (over: Record<string, unknown>) => ({
  student_id: SA,
  tutor_id: T1,
  subject: COURSE1,
  scheduled_at: '',
  duration_minutes: 60,
  price: 28,
  platform_fee: 4.9,
  tutor_payout_amount: 23.1,
  session_type: 'in_person',
  status: 'pending',
  cancellation_deadline: new Date(Date.now() + 72 * 3600e3).toISOString(),
  refund_status: 'not_applicable',
  ...over,
});
const insert = async (over: Record<string, unknown>) => {
  const row = mkBooking(over);
  // Only draw a fresh slot when the caller didn't pick one — each slot() call consumes
  // 90 minutes of the 6-day horizon.
  if (!over.scheduled_at) row.scheduled_at = slot();
  return svc.from('bookings').insert(row).select('id').single();
};

try {
  // ---------- database ----------
  console.log('— concurrent inserts —');
  for (let round = 1; round <= 10; round++) {
    const at = slot();
    const [a, b] = await Promise.all([
      insert({ student_id: SA, scheduled_at: at }),
      insert({ student_id: SB, scheduled_at: at }),
    ]);
    const winner = a.error ? b : a;
    if (winner.data?.id) bookingIds.push(winner.data.id as string);
    const loser = a.error ? a : b;
    // The loser can be aborted two ways: 23P01 (exclusion violation) or 40P01 — the
    // deadlock detector kills one txn when both wait on each other's constraint tuple.
    const loserCode = (loser.error as { code?: string } | null)?.code;
    const { data: live } = await svc.from('bookings').select('id')
      .eq('tutor_id', T1).eq('scheduled_at', at).in('status', ['pending', 'confirmed']);
    for (const row of live ?? []) if (!bookingIds.includes(row.id)) bookingIds.push(row.id);
    step(1, !!winner.data && (loserCode === '23P01' || loserCode === '40P01') && (live ?? []).length === 1,
      `round ${round}: exactly one of two overlapping pending inserts succeeds`,
      `loser code ${loserCode ?? 'none'}, live rows ${(live ?? []).length}`);
  }

  const t = slot();
  const endBack = await insert({ scheduled_at: t });
  const endBack2 = await insert({
    scheduled_at: new Date(new Date(t).getTime() + 60 * 60e3).toISOString(),
  });
  for (const r of [endBack, endBack2]) if (r.data?.id) bookingIds.push(r.data.id as string);
  step(2, !endBack.error && !endBack2.error, 'back-to-back sessions (one ends when the next starts) both book',
    `${endBack.error?.message ?? 'ok'} / ${endBack2.error?.message ?? 'ok'}`);

  slot(); // the back-to-back pair reaches 2h into the grid — skip the slot it covers
  const t3 = slot();
  const cancelled = await insert({ scheduled_at: t3, status: 'cancelled', cancelled_at: new Date().toISOString() });
  const completed = await insert({ scheduled_at: t3, status: 'completed' });
  const pending3 = await insert({ scheduled_at: t3 });
  for (const r of [cancelled, completed, pending3]) if (r.data?.id) bookingIds.push(r.data.id as string);
  step(3, !cancelled.error && !completed.error && !pending3.error,
    'cancelled and completed bookings do not hold the slot',
    `${cancelled.error?.message ?? 'ok'} / ${completed.error?.message ?? 'ok'} / ${pending3.error?.message ?? 'ok'}`);

  const t4 = slot();
  const twoTutors = await Promise.all([
    insert({ student_id: SA, tutor_id: T1, subject: COURSE1, scheduled_at: t4 }),
    insert({ student_id: SA, tutor_id: T2, subject: COURSE2, scheduled_at: t4 }),
  ]);
  for (const r of twoTutors) if (r.data?.id) bookingIds.push(r.data.id as string);
  step(4, twoTutors.every((r) => !r.error),
    'one student may overlap across two different tutors (constraint is per tutor only)',
    twoTutors.map((r) => r.error?.message ?? 'ok').join(' / '));

  console.log('\n— scheduled_end trigger —');
  const t5 = slot();
  const bogusEnd = new Date(new Date(t5).getTime() + 12 * 3600e3).toISOString();
  const trig = await insert({ scheduled_at: t5, scheduled_end: bogusEnd });
  if (trig.data?.id) bookingIds.push(trig.data.id as string);
  const { data: stored } = await svc.from('bookings').select('scheduled_end').eq('id', trig.data!.id).single();
  const expected = new Date(new Date(t5).getTime() + 60 * 60e3).getTime();
  step(5, !trig.error && Math.abs(new Date(stored!.scheduled_end as string).getTime() - expected) < 2000,
    'trigger recomputes scheduled_end from scheduled_at + duration on insert',
    `stored ${stored?.scheduled_end}`);

  // A ends 60 min after start; B starts 2h after A — no overlap until A stretches.
  const tA = slot();
  const neighbour = await insert({ scheduled_at: new Date(new Date(tA).getTime() + 120 * 60e3).toISOString() });
  const grow = await insert({ scheduled_at: tA });
  for (const r of [neighbour, grow]) if (r.data?.id) bookingIds.push(r.data.id as string);
  const stretch = await svc.from('bookings').update({ duration_minutes: 150 }).eq('id', grow.data!.id);
  step('5b', (stretch.error as { code?: string } | null)?.code === '23P01',
    'widening duration_minutes into a neighbour is refused (trigger recomputes end)',
    `code ${(stretch.error as { code?: string } | null)?.code ?? stretch.error?.message ?? 'no error'}`);

  slot(); // `neighbour` at tA+2h overlaps the next grid slot — use the one after
  const mover = await insert({});
  if (mover.data?.id) bookingIds.push(mover.data.id as string);
  const move = await svc.from('bookings').update({ scheduled_at: tA }).eq('id', mover.data!.id);
  step('5c', (move.error as { code?: string } | null)?.code === '23P01',
    'moving scheduled_at into an occupied slot is refused',
    `code ${(move.error as { code?: string } | null)?.code ?? move.error?.message ?? 'no error'}`);

  const t6 = slot();
  const live = await insert({ scheduled_at: t6 });
  const ghost = await insert({ scheduled_at: t6, status: 'cancelled', cancelled_at: new Date().toISOString() });
  for (const r of [live, ghost]) if (r.data?.id) bookingIds.push(r.data.id as string);
  const revive = await svc.from('bookings').update({ status: 'confirmed', cancelled_at: null }).eq('id', ghost.data!.id);
  step('5d', (revive.error as { code?: string } | null)?.code === '23P01',
    'flipping a cancelled booking back to confirmed on a taken slot is refused',
    `code ${(revive.error as { code?: string } | null)?.code ?? revive.error?.message ?? 'no error'}`);

  // ---------- edge functions ----------
  console.log('\n— confirm-booking races (functions + test Stripe) —');
  if (!stripeTestMode()) {
    step(6, false, 'STRIPE_SECRET_KEY is not an sk_test_ key — function checks cannot run');
  } else {
    const prep = async (student: { token: string }, at: string, course = COURSE1) => {
      const res = await call('create-payment-intent',
        { tutorId: T1, courseCode: course, durationMinutes: 60, scheduledAt: at }, student.token);
      const pi = res.body?.paymentIntentId as string | undefined;
      if (!pi) throw new Error(`create-payment-intent ${res.status}: ${JSON.stringify(res.body)}`);
      pis.push(pi);
      await authorizeHold(pi);
      // chargeCents = amountCents (price + student fee) - credit; the whole hold is released.
      return { pi, chargeCents: res.body?.chargeCents as number };
    };
    const confirm = (student: { token: string }, at: string, pi: string, course = COURSE1) =>
      call('confirm-booking', {
        tutorId: T1, courseCode: course, scheduledAt: at, durationMinutes: 60,
        sessionType: 'in_person', paymentIntentId: pi,
      }, student.token);
    const liveRows = async (at: string) =>
      (await svc.from('bookings').select('id,stripe_payment_intent_id')
        .eq('tutor_id', T1).eq('scheduled_at', at).in('status', ['pending', 'confirmed'])).data ?? [];

    for (let round = 1; round <= 3; round++) {
      const at = slot();
      const piA = await prep(sA, at);
      const piB = await prep(sB, at);
      const [rA, rB] = await Promise.all([confirm(sA, at, piA.pi), confirm(sB, at, piB.pi)]);
      const results = [
        { r: rA, ...piA, who: 'A' },
        { r: rB, ...piB, who: 'B' },
      ];
      const winner = results.find((x) => x.r.status === 200);
      const loser = results.find((x) => x.r.status !== 200);
      if (winner?.r.body?.bookingId) bookingIds.push(winner.r.body.bookingId as string);
      const loserPi = loser ? await getPaymentIntent(loser.pi) : null;
      const rows = await liveRows(at);
      for (const row of rows) if (!bookingIds.includes(row.id)) bookingIds.push(row.id);
      step(`6.${round}`, !!winner && !!loser && loser!.r.status === 409 && loser!.r.body?.error === SLOT_TAKEN
          && loserPi?.status === 'canceled' && loserPi?.amount === loser!.chargeCents && rows.length === 1,
        `race ${round}: one 200, one 409 + full hold released + one booking row`,
        `statuses ${rA.status}/${rB.status}, loser pi ${loserPi?.status} amt ${loserPi?.amount} vs ${loser?.chargeCents}, rows ${rows.length}`);
    }

    // Sequential: the slot is already taken when the loser's request is read.
    const at7 = slot();
    const pi7 = await prep(sB, at7);
    const blocker = await insert({ student_id: SA, scheduled_at: at7 });
    if (blocker.data?.id) bookingIds.push(blocker.data.id as string);
    const r7 = await confirm(sB, at7, pi7.pi);
    const pi7After = await getPaymentIntent(pi7.pi);
    step(7, r7.status === 409 && r7.body?.error === SLOT_TAKEN
        && pi7After.status === 'canceled' && pi7After.amount === pi7.chargeCents,
      'confirm on an already-taken slot returns the not-charged message and releases the full hold',
      `status ${r7.status} "${r7.body?.error}", pi ${pi7After.status} amt ${pi7After.amount} vs ${pi7.chargeCents}`);

    // Same race, but the loser carries Noot credit — it must be untouched afterwards.
    const at8 = slot();
    await svc.from('credit_ledger').insert([
      { user_id: SA, amount_cents: 500, kind: 'adjustment' },
      { user_id: SB, amount_cents: 500, kind: 'adjustment' },
    ]);
    const balA0 = (await svc.rpc('credit_balance_cents', { p_user: SA })).data as number;
    const balB0 = (await svc.rpc('credit_balance_cents', { p_user: SB })).data as number;
    const piA8 = await prep(sA, at8);
    const piB8 = await prep(sB, at8);
    const [r8A, r8B] = await Promise.all([confirm(sA, at8, piA8.pi), confirm(sB, at8, piB8.pi)]);
    const loser8 = r8A.status === 200 ? { r: r8B, ...piB8, id: SB, bal0: balB0, who: 'B' }
      : { r: r8A, ...piA8, id: SA, bal0: balA0, who: 'A' };
    const winner8body = r8A.status === 200 ? r8A.body : r8B.body;
    if (winner8body?.bookingId) bookingIds.push(winner8body.bookingId as string);
    const balAfter = (await svc.rpc('credit_balance_cents', { p_user: loser8.id })).data as number;
    const pi8After = await getPaymentIntent(loser8.pi);
    step(8, loser8.r.status === 409 && loser8.r.body?.error === SLOT_TAKEN
        && balAfter === loser8.bal0 && pi8After.status === 'canceled' && pi8After.amount === loser8.chargeCents,
      `lost slot race leaves the loser's credit balance and card hold untouched`,
      `loser ${loser8.who}: status ${loser8.r.status}, balance ${balAfter} vs ${loser8.bal0}, pi ${pi8After.status} amt ${pi8After.amount} vs ${loser8.chargeCents}`);

    // Reschedule accept: the proposed slot was free, then taken.
    const at9a = slot();
    const proposed = slot();
    const target = await insert({ scheduled_at: at9a, status: 'confirmed', accepted_at: new Date().toISOString() });
    if (target.data?.id) bookingIds.push(target.data.id as string);
    const propose = await call('reschedule-booking',
      { bookingId: target.data!.id, action: 'propose', newScheduledAt: proposed }, sA.token);
    const squatter = await insert({ student_id: SB, scheduled_at: proposed });
    if (squatter.data?.id) bookingIds.push(squatter.data.id as string);
    const accept = await call('reschedule-booking',
      { bookingId: target.data!.id, action: 'accept' }, tutorLogin.token);
    const { data: after } = await svc.from('bookings').select('scheduled_at').eq('id', target.data!.id).single();
    step(9, propose.status === 200 && accept.status === 409 && accept.body?.error === RESCHED_TAKEN
        && Math.abs(new Date(after!.scheduled_at as string).getTime() - new Date(at9a).getTime()) < 2000,
      'reschedule accept on a since-taken slot returns 409 and keeps the old time',
      `propose ${propose.status}, accept ${accept.status} "${accept.body?.error}", at ${after?.scheduled_at} vs ${at9a}`);
  }
} finally {
  for (const id of bookingIds) {
    await svc.from('notifications').delete().contains('data', { bookingId: id });
    await svc.from('credit_ledger').delete().eq('booking_id', id);
    await svc.from('bookings').delete().eq('id', id);
  }
  for (const uid of studentIds) await svc.from('credit_ledger').delete().eq('user_id', uid);
  for (const pi of pis) if (pi?.startsWith('pi_')) await cancelHold(pi).catch(() => {});
  for (const uid of studentIds) await svc.auth.admin.deleteUser(uid);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
