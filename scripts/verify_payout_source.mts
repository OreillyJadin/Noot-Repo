// Tutor payouts are funded from the booking's own charge (ISSUES_2026-10-03.md §3.2):
// every tutor transfer created by complete-session, report-no-show and a late cancel in
// cancel-booking carries `source_transaction` = the captured charge, so it can never fail
// because Noot's platform balance is short. A Noot-credit booking whose payout is larger
// than what the card paid gets two transfers: the card-funded part from the charge, the
// credit-funded remainder from the platform balance (see _shared/payouts.ts).
//
// Creates its own student and tutor and removes both afterwards. Fixture times stay within
// campus-day availability and their intended cancellation tier, independent of test order.
//
// Runs against the LOCAL stack with `supabase functions serve --env-file <STRIPE_SECRET_KEY=sk_test_…>`
// and needs a test-mode connected account whose transfers capability is active. It uses
// NOOT_VERIFY_CONNECT_ACCOUNT=acct_… when set, otherwise the first active account under the
// key. To make one: run connect-onboarding-link (verify_payout_session creates one), open the
// hosted onboarding link and use Stripe's test-mode "skip this form" button.
//   pnpm dlx tsx scripts/verify_payout_source.mts
import { initSupabase, auth } from '../packages/core/src/index.ts';
import { createClient } from '@supabase/supabase-js';
import { authorizeHold, getPaymentIntent, stripeTestMode } from './_stripe_test.mts';
import { chargeAvailableCents, splitPayoutFunding } from '../supabase/functions/_shared/payouts.ts';
import { lateCancelTutorPayoutCents } from '../supabase/functions/_shared/cancellation.ts';
import { bookingTime } from './_booking_test.mts';

const URL = 'http://127.0.0.1:54321';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const PASSWORD = 'Payout-Source-Verify-2026!';
const KEY = process.env.STRIPE_SECRET_KEY ?? '';

if (!stripeTestMode()) {
  console.error('STRIPE_SECRET_KEY must be an sk_test_ key (source scripts/dev-env.sh).');
  process.exit(1);
}

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
}

type Json = Record<string, any>;
async function stripe(path: string, body?: Record<string, string>): Promise<Json> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${KEY}`,
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    ...(body ? { body: new URLSearchParams(body) } : {}),
  });
  return await res.json();
}
const transfersFor = async (bookingId: string): Promise<Json[]> =>
  ((await stripe(`transfers?transfer_group=${bookingId}&limit=10`)).data ?? []) as Json[];

console.log('— pure split rules —');
check('payout fully covered by the charge → one source-linked transfer',
  JSON.stringify(splitPayoutFunding(2310, 3276)) === JSON.stringify({ fromCharge: 2310, fromBalance: 0 }));
check('$1 card charge + credit → $1 from the charge, the rest from the balance',
  JSON.stringify(splitPayoutFunding(2310, 100)) === JSON.stringify({ fromCharge: 100, fromBalance: 2210 }));
check('a fully refunded charge funds nothing; everything from the balance',
  JSON.stringify(splitPayoutFunding(2310, 0)) === JSON.stringify({ fromCharge: 0, fromBalance: 2310 }));
check('a zero payout moves nothing',
  JSON.stringify(splitPayoutFunding(0, 5000)) === JSON.stringify({ fromCharge: 0, fromBalance: 0 }));
check('a full capture with no refunds is all available',
  chargeAvailableCents({ amount: 3276, amount_captured: 3276, amount_refunded: 0 }) === 3276 && chargeAvailableCents(null) === 0);
check('a partial capture counts only what was captured, not the authorized total',
  chargeAvailableCents({ amount: 4000, amount_captured: 2000, amount_refunded: 0 }) === 2000);
check('refunds since the capture come off the available amount',
  chargeAvailableCents({ amount: 3276, amount_captured: 3276, amount_refunded: 500 }) === 2776 &&
    chargeAvailableCents({ amount: 4000, amount_captured: 2000, amount_refunded: 2500 }) === 1500);

// --- a connected account that can receive transfers --------------------------------------
let acct = process.env.NOOT_VERIFY_CONNECT_ACCOUNT ?? '';
if (!acct) {
  const list = await stripe('accounts?limit=100');
  const ready = (list.data ?? []).find((a: Json) => a.capabilities?.transfers === 'active' && a.payouts_enabled);
  acct = ready?.id ?? '';
}
if (!acct) {
  console.error('No test-mode connected account with transfers active. Set NOOT_VERIFY_CONNECT_ACCOUNT=acct_… (see header).');
  process.exit(1);
}
const acctInfo = await stripe(`accounts/${acct}`);
check(`connected account ${acct} can receive transfers`, acctInfo.capabilities?.transfers === 'active' && acctInfo.payouts_enabled === true,
  JSON.stringify({ transfers: acctInfo.capabilities?.transfers, payouts_enabled: acctInfo.payouts_enabled }));

// Test mode only: `pm_card_bypassPending` settles instantly, so the credit-funded remainder
// has a platform balance to come from (a real charge is pending for ~2 days).
{
  const topUp = await stripe('payment_intents', {
    amount: '20000', currency: 'usd', payment_method: 'pm_card_bypassPending', confirm: 'true',
    'automatic_payment_methods[enabled]': 'true', 'automatic_payment_methods[allow_redirects]': 'never',
    'metadata[purpose]': 'verify_payout_source balance top-up',
  });
  check('platform balance topped up for the credit-funded remainder', topUp.status === 'succeeded', topUp.error?.message);
}

// --- local users ------------------------------------------------------------------------
initSupabase({ url: URL, anonKey: ANON });
const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });
const email = `payoutsrc+${Date.now()}@crimson.ua.edu`;
const { data: created, error: cErr } = await svc.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
if (cErr) throw cErr;
const studentId = created.user!.id;
await svc.from('users').update({
  first_name: 'Payout',
  last_name: 'Source',
  date_of_birth: '2000-01-15',
}).eq('id', studentId);

const raw = createClient(URL, ANON, { auth: { persistSession: false } });
const asStudent = await raw.auth.signInWithPassword({ email, password: PASSWORD });
const studentToken = asStudent.data.session!.access_token;
await auth.signInWithPassword(email, PASSWORD);

// Its own tutor, so nothing here touches anyone else's bookings: approved, bookable,
// available all week, paid out to the connected account above.
const tutorEmail = `payoutsrc-tutor+${Date.now()}@crimson.ua.edu`;
const { data: createdTutor, error: tErr } = await svc.auth.admin.createUser({ email: tutorEmail, password: PASSWORD, email_confirm: true });
if (tErr) throw tErr;
const tutorId = createdTutor.user!.id;
{
  const now = new Date().toISOString();
  await svc.from('users').update({
    first_name: 'Payout', last_name: 'Tutor', date_of_birth: '2000-01-15', password_set_at: now,
    terms_accepted_at: now, terms_version: '2026-09-17', guidelines_accepted_at: now, guidelines_version: '2026-10-13',
  }).eq('id', tutorId);
  await svc.from('user_roles').upsert({ user_id: tutorId, role: 'tutor' }, { onConflict: 'user_id,role' });
  const { error: pErr } = await svc.from('tutor_profiles').upsert({
    user_id: tutorId, bio: 'verify_payout_source tutor', approval_status: 'approved', grades_verified_at: null,
    stripe_connect_account_id: acct, stripe_charges_enabled: true, stripe_payouts_enabled: true, stripe_onboarded_at: now,
  }, { onConflict: 'user_id' });
  if (pErr) throw pErr;
  await svc.from('tutor_availability').insert(
    [0, 1, 2, 3, 4, 5, 6].map((d) => ({ tutor_id: tutorId, day_of_week: d, start_time: '00:00', end_time: '23:59' })),
  );
}
const { data: anyCourse } = await svc.from('courses').select('course_code').eq('is_active', true).order('course_code').limit(1).single();
const courseCode = anyCourse!.course_code as string;
{
  const { error: cErr2 } = await svc.from('tutor_courses').insert({ tutor_id: tutorId, course_code: courseCode, grade: 'A', hourly_rate: 28 });
  if (cErr2) throw cErr2;
}
const asTutor = await raw.auth.signInWithPassword({ email: tutorEmail, password: PASSWORD });
const tutorToken = asTutor.data.session?.access_token ?? '';
check('signed in as a fresh student and a fresh tutor at $28/hr', !!studentToken && !!tutorToken);

const call = async (fn: string, body: unknown, token = studentToken) => {
  const res = await fetch(`${URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Json };
};

const grant = (cents: number) => svc.from('credit_ledger').insert({ user_id: studentId, amount_cents: cents, kind: 'adjustment' });
const bookings: string[] = [];
const at = (hoursAhead: number) => bookingTime(hoursAhead);

/** A real confirmed booking with an authorized hold (optionally paid partly with credit). */
async function makeBooking(hoursAhead: number, creditCents = 0) {
  const scheduledAt = at(hoursAhead);
  if (creditCents > 0) await grant(creditCents);
  const pi = await call('create-payment-intent', { tutorId, courseCode, durationMinutes: 60, scheduledAt });
  if (pi.status !== 200) throw new Error(`create-payment-intent ${pi.status} ${pi.body.error ?? ''}`);
  await authorizeHold(pi.body.paymentIntentId);
  const res = await call('confirm-booking', {
    tutorId, courseCode, scheduledAt, durationMinutes: 60, sessionType: 'in_person', paymentIntentId: pi.body.paymentIntentId,
  });
  if (res.status !== 200) throw new Error(`confirm-booking ${res.status} ${res.body.error ?? ''}`);
  const bookingId = res.body.bookingId as string;
  bookings.push(bookingId);
  const accepted = await call('respond-booking-request', { bookingId, action: 'accept' }, tutorToken);
  if (accepted.status !== 200) throw new Error(`accept ${accepted.status} ${accepted.body.error ?? ''}`);
  return { bookingId, pi: pi.body.paymentIntentId as string, chargeCents: pi.body.chargeCents as number, creditCents: pi.body.creditCents as number };
}
const backdate = (bookingId: string) =>
  svc.from('bookings').update({ scheduled_at: new Date(Date.now() - 3 * 3600e3).toISOString() }).eq('id', bookingId);
const row = async (bookingId: string) => (await svc.from('bookings')
  .select('status, stripe_charge_id, stripe_transfer_id, payout_failed_at, tutor_payout_amount, refund_percent')
  .eq('id', bookingId).single()).data!;
const payoutCents = (r: Json) => Math.round(Number(r.tutor_payout_amount) * 100);

try {
  console.log('\n— complete-session: payout funded from the session charge —');
  {
    const b = await makeBooking(72);
    await backdate(b.bookingId);
    const r = await call('complete-session', { bookingId: b.bookingId }, tutorToken);
    const bk = await row(b.bookingId);
    const ts = await transfersFor(b.bookingId);
    const pi = await getPaymentIntent(b.pi);
    check('complete-session succeeds and records the transfer', r.status === 200 && r.body.transferId === bk.stripe_transfer_id && !bk.payout_failed_at,
      `${r.status} ${JSON.stringify(r.body)}`);
    check('exactly one transfer, for the full payout', ts.length === 1 && ts[0]!.amount === payoutCents(bk), JSON.stringify(ts.map((t) => t.amount)));
    check('…with source_transaction = the captured charge', ts[0]?.source_transaction === bk.stripe_charge_id && ts[0]?.source_transaction === pi.latest_charge,
      `${ts[0]?.source_transaction} vs ${bk.stripe_charge_id}`);
    check('…to the tutor’s connected account, tagged as charge-funded', ts[0]?.destination === acct && ts[0]?.metadata?.funding === 'session_charge');
    check('the charge was captured for price + fee (card ≥ payout here)', pi.amount_received === b.chargeCents && b.chargeCents >= payoutCents(bk),
      `${pi.amount_received}c charged, ${payoutCents(bk)}c payout`);
    const again = await call('complete-session', { bookingId: b.bookingId }, tutorToken);
    check('a retried complete-session is a no-op: still one transfer', again.body.alreadyComplete === true && (await transfersFor(b.bookingId)).length === 1);
  }

  console.log('\n— complete-session: Noot credit leaves a $1 card charge smaller than the payout —');
  {
    const probe = await call('create-payment-intent', { tutorId, courseCode, durationMinutes: 60, scheduledAt: at(90) });
    const amountCents = probe.body.amountCents as number;
    await stripe(`payment_intents/${probe.body.paymentIntentId}/cancel`, {});
    const b = await makeBooking(72, amountCents); // more credit than the total → card still pays $1
    check('the card is held for exactly $1', b.chargeCents === 100 && b.creditCents === amountCents - 100, `${b.chargeCents}c card, ${b.creditCents}c credit`);
    await backdate(b.bookingId);
    const r = await call('complete-session', { bookingId: b.bookingId }, tutorToken);
    const bk = await row(b.bookingId);
    const ts = await transfersFor(b.bookingId);
    const src = ts.find((t) => t.source_transaction);
    const bal = ts.find((t) => !t.source_transaction);
    check('complete-session succeeds, nothing flagged', r.status === 200 && !bk.payout_failed_at, `${r.status} ${JSON.stringify(r.body)}`);
    check('two transfers that add up to the payout', ts.length === 2 && ts.reduce((s, t) => s + t.amount, 0) === payoutCents(bk),
      JSON.stringify(ts.map((t) => [t.amount, t.source_transaction ?? 'balance'])));
    check('$1 comes from the charge (source_transaction)', src?.amount === 100 && src?.source_transaction === bk.stripe_charge_id && src?.metadata?.funding === 'session_charge');
    check('the credit-funded remainder comes from the platform balance', bal?.amount === payoutCents(bk) - 100 && bal?.metadata?.funding === 'platform_balance'
      && bal?.metadata?.credit_funded_cents === String(payoutCents(bk) - 100));
    check('the booking records the charge-funded transfer', bk.stripe_transfer_id === src?.id);
  }

  console.log('\n— report-no-show (student): payout funded from the charge —');
  {
    const b = await makeBooking(72);
    await backdate(b.bookingId);
    const r = await call('report-no-show', { bookingId: b.bookingId, party: 'student' }, tutorToken);
    const bk = await row(b.bookingId);
    const ts = await transfersFor(b.bookingId);
    check('no-show recorded and the tutor paid', r.status === 200 && bk.status === 'no_show' && bk.stripe_transfer_id === ts[0]?.id && !bk.payout_failed_at,
      `${r.status} ${JSON.stringify(r.body)}`);
    check('one transfer for the full payout, from the captured charge', ts.length === 1 && ts[0]!.amount === payoutCents(bk) && ts[0]!.source_transaction === bk.stripe_charge_id,
      JSON.stringify(ts.map((t) => [t.amount, t.source_transaction])));
  }

  console.log('\n— cancel-booking 50% tier: half captured, tutor’s half funded from that capture —');
  {
    const b = await makeBooking(10); // 2h < 10h < 12h → 50% refund
    const r = await call('cancel-booking', { bookingId: b.bookingId });
    const bk = await row(b.bookingId);
    const ts = await transfersFor(b.bookingId);
    const charge = await stripe(`charges/${bk.stripe_charge_id}`);
    const expected = lateCancelTutorPayoutCents(Number(bk.tutor_payout_amount), 50);
    check('student cancels 10h out → 50% refund, booking cancelled', r.status === 200 && r.body.refundPercent === 50 && bk.status === 'cancelled' && !bk.payout_failed_at,
      `${r.status} ${JSON.stringify(r.body)}`);
    check('half the card hold was captured; the rest released', charge.amount_captured === Math.round(b.chargeCents / 2) && chargeAvailableCents(charge) === charge.amount_captured,
      `amount=${charge.amount} captured=${charge.amount_captured} refunded=${charge.amount_refunded}`);
    check('one transfer for half the payout, with source_transaction = the partial capture',
      ts.length === 1 && ts[0]!.amount === expected && ts[0]!.source_transaction === bk.stripe_charge_id && ts[0]!.metadata?.reason === 'late_cancel',
      JSON.stringify(ts.map((t) => [t.amount, t.source_transaction])));
    check('…and it fits inside what was kept from the charge', expected <= chargeAvailableCents(charge), `${expected}c ≤ ${chargeAvailableCents(charge)}c`);
  }

  console.log('\n— cancel-booking 0% tier with credit: $1 charge + credit-funded remainder —');
  {
    const probe = await call('create-payment-intent', { tutorId, courseCode, durationMinutes: 60, scheduledAt: at(95) });
    const amountCents = probe.body.amountCents as number;
    await stripe(`payment_intents/${probe.body.paymentIntentId}/cancel`, {});
    const b = await makeBooking(1, amountCents); // < 2h → no refund
    const r = await call('cancel-booking', { bookingId: b.bookingId });
    const bk = await row(b.bookingId);
    const ts = await transfersFor(b.bookingId);
    const src = ts.find((t) => t.source_transaction);
    const bal = ts.find((t) => !t.source_transaction);
    check('student cancels 1h out → 0% refund, full $1 captured', r.status === 200 && r.body.refundPercent === 0 && bk.status === 'cancelled' && !bk.payout_failed_at,
      `${r.status} ${JSON.stringify(r.body)}`);
    check('$1 from the charge, remainder from the balance, totalling the full payout',
      ts.length === 2 && src?.amount === 100 && src?.source_transaction === bk.stripe_charge_id && bal?.amount === payoutCents(bk) - 100,
      JSON.stringify(ts.map((t) => [t.amount, t.source_transaction ?? 'balance'])));
  }
} finally {
  // Put the test account back: reverse the test transfers, release stray holds, restore the tutor.
  for (const id of bookings) {
    for (const t of await transfersFor(id)) {
      if (!t.reversed) await stripe(`transfers/${t.id}/reversals`, {});
    }
    const { data: bk } = await svc.from('bookings').select('stripe_payment_intent_id, status').eq('id', id).maybeSingle();
    if (bk?.status === 'confirmed' && bk.stripe_payment_intent_id) await stripe(`payment_intents/${bk.stripe_payment_intent_id}/cancel`, {});
  }
  await svc.from('credit_ledger').delete().eq('user_id', studentId);
  await svc.from('bookings').delete().in('id', bookings);
  await svc.auth.admin.deleteUser(studentId);
  await svc.auth.admin.deleteUser(tutorId);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
