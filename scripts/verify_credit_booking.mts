// Noot credit through the real booking Edge Functions (0040), against the LOCAL stack with
// `supabase functions serve` running and a Stripe TEST key (sk_test_ only — see
// _stripe_test.mts). Drives the same @noot/core calls as b4.tsx:
//   • credit comes off the hold; the tutor's payout is still computed on the full price
//   • confirm spends it; a tampered PaymentIntent and a double-spend are both refused
//   • cancelling returns it in proportion to the refund
//   • award-referral-bonus credits the inviter, and refuses an end-user token
//   supabase functions serve --env-file <file with STRIPE_SECRET_KEY=sk_test_…>
//   pnpm dlx tsx scripts/verify_credit_booking.mts
import { initSupabase, api, auth } from '../packages/core/src/index.ts';
import { createClient } from '@supabase/supabase-js';
import { authorizeHold, cancelHold, getPaymentIntent, setPaymentIntentMetadata, stripeTestMode } from './_stripe_test.mts';

const URL = 'http://127.0.0.1:54321';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const PASSWORD = 'password123';

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

initSupabase({ url: URL, anonKey: ANON });
const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });

const email = `creditbook+${Date.now()}@crimson.ua.edu`;
const { data: u, error: cErr } = await svc.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
if (cErr) throw cErr;
const uid = u.user!.id;
await svc.from('users').update({ first_name: 'Credit', last_name: 'Booker' }).eq('id', uid);
const signIn = await auth.signInWithPassword(email, PASSWORD);
if (!signIn.ok) throw new Error(String(signIn.error));

const tutors = await api.tutors.search();
const tutorId = tutors[0]!.userId;
await svc.from('tutor_profiles').update({ stripe_charges_enabled: true }).eq('user_id', tutorId);
const { data: tc } = await svc.from('tutor_courses').select('course_code').eq('tutor_id', tutorId).limit(1).single();
const courseCode = tc!.course_code as string;

const grant = (cents: number) => svc.from('credit_ledger').insert({ user_id: uid, amount_cents: cents, kind: 'adjustment' });
const holds: string[] = [];
const bookings: string[] = [];
let slot = 0;
// Distinct times so each test booking is its own slot.
const at = (hoursAhead: number) => new Date(Date.now() + hoursAhead * 3600e3 + slot++ * 60e3).toISOString();

async function hold(scheduledAt: string) {
  const pi = await api.createPaymentIntent({ tutorId, courseCode, durationMinutes: 60, scheduledAt });
  holds.push(pi.paymentIntentId);
  await authorizeHold(pi.paymentIntentId);
  return pi;
}
async function confirm(paymentIntentId: string, scheduledAt: string) {
  const r = await api.bookings.confirm({ tutorId, courseCode, scheduledAt, durationMinutes: 60, sessionType: 'in_person', paymentIntentId });
  bookings.push(r.bookingId);
  return r.bookingId;
}

try {
  console.log('— credit comes off the hold —');
  await grant(500);
  const t1 = at(30);
  const pi1 = await hold(t1);
  const stripePi1 = await getPaymentIntent(pi1.paymentIntentId);
  check('create-payment-intent applies the $5', pi1.creditCents === 500 && pi1.chargeCents === pi1.amountCents - 500, JSON.stringify({ a: pi1.amountCents, c: pi1.creditCents, ch: pi1.chargeCents }));
  check('the Stripe hold is for the reduced amount', stripePi1.amount === pi1.chargeCents && stripePi1.metadata?.credit_cents === '500');
  const b1 = await confirm(pi1.paymentIntentId, t1);
  const { data: row1 } = await svc.from('bookings').select('price, credit_applied, tutor_payout_amount, platform_fee').eq('id', b1).single();
  check('booking records the credit; payout is still on the full price',
    Number(row1!.credit_applied) === 5 && Math.abs(Number(row1!.tutor_payout_amount) + Number(row1!.platform_fee) - Number(row1!.price)) < 0.001,
    JSON.stringify(row1));
  check('balance is spent', (await api.credits.balance()) === 0);
  const { data: spend } = await svc.from('credit_ledger').select('booking_id').eq('payment_intent_id', pi1.paymentIntentId).eq('kind', 'booking_spend').single();
  check('the spend is linked to the booking', spend?.booking_id === b1);

  console.log('\n— tampering and double-spending —');
  await grant(500);
  const t2 = at(40);
  const pi2 = await hold(t2);
  await setPaymentIntentMetadata(pi2.paymentIntentId, { credit_cents: '0' });
  let refused = false;
  try { await confirm(pi2.paymentIntentId, t2); } catch { refused = true; }
  check('a PaymentIntent whose credit was edited is refused', refused);

  const t3 = at(50);
  const t4 = at(60);
  const piA = await hold(t3);
  const piB = await hold(t4);
  check('two checkouts both see the same $5', piA.creditCents === 500 && piB.creditCents === 500);
  await confirm(piA.paymentIntentId, t3);
  let second = '';
  try { await confirm(piB.paymentIntentId, t4); } catch (e) { second = String(e); }
  check('…but only the first can spend it', /credit changed/i.test(second), second.slice(0, 120));
  const heldB = await getPaymentIntent(piB.paymentIntentId);
  check('…and the second card hold is released', heldB.status === 'canceled', heldB.status);

  console.log('\n— cancelling returns credit —');
  const bal0 = await api.credits.balance();
  const r100 = await api.bookings.cancel(b1);
  check('cancel 30h out: full refund', r100.refundPercent === 100);
  check('…and the full $5 credit comes back', (await api.credits.balance()) === bal0 + 500, String(await api.credits.balance()));

  const t5 = at(10);
  const pi5 = await hold(t5);
  const b5 = await confirm(pi5.paymentIntentId, t5);
  const bal1 = await api.credits.balance();
  const r50 = await api.bookings.cancel(b5);
  const captured = await getPaymentIntent(pi5.paymentIntentId);
  check('cancel 10h out: 50% refund', r50.refundPercent === 50);
  check('…captures half of what the card was charged, not half the price', captured.amount_received === Math.round(pi5.chargeCents / 2), `${captured.amount_received} vs ${pi5.chargeCents}`);
  check('…and half the credit comes back', (await api.credits.balance()) === bal1 + Math.round(pi5.creditCents / 2));

  console.log('\n— earning through the Edge Function —');
  // The test user (signed in through @noot/core) is the inviter.
  const inviter = { id: uid };
  const invCode = { code: await api.credits.myCode() };
  // A fresh invitee with a completed session.
  const fe = `invitee+${Date.now()}@crimson.ua.edu`;
  const { data: f } = await svc.auth.admin.createUser({ email: fe, password: PASSWORD, email_confirm: true });
  const fc = createClient(URL, ANON, { auth: { persistSession: false } });
  await fc.auth.signInWithPassword({ email: fe, password: PASSWORD });
  await fc.rpc('redeem_invite_code', { p_code: invCode.code });
  const { data: done } = await svc.from('bookings').insert({
    student_id: f.user!.id, tutor_id: tutorId, subject: courseCode, scheduled_at: new Date(Date.now() - 864e5).toISOString(),
    duration_minutes: 60, price: 28, platform_fee: 4.9, tutor_payout_amount: 23.1, status: 'completed', session_type: 'in_person',
    cancellation_deadline: new Date(Date.now() - 2 * 864e5).toISOString(),
  }).select('id').single();
  const { data: { session } } = await fc.auth.getSession();
  const asUser = await fetch(`${URL}/functions/v1/award-referral-bonus`, {
    method: 'POST', headers: { Authorization: `Bearer ${session!.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingId: done!.id }),
  });
  check('award-referral-bonus refuses an end-user token', asUser.status === 403, String(asUser.status));
  const asSvc = await fetch(`${URL}/functions/v1/award-referral-bonus`, {
    method: 'POST', headers: { Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingId: done!.id }),
  });
  const body = await asSvc.json();
  check('award-referral-bonus credits the inviter', body.awarded === true, JSON.stringify(body));
  const { data: reward } = await svc.from('credit_ledger').select('amount_cents').eq('user_id', inviter.id).eq('booking_id', done!.id).eq('kind', 'invite_reward').single();
  check('…$5', reward?.amount_cents === 500);
  await svc.from('credit_ledger').delete().eq('booking_id', done!.id);
  await svc.from('bookings').delete().eq('id', done!.id);
  await svc.auth.admin.deleteUser(f.user!.id);
} finally {
  for (const pi of holds) await cancelHold(pi).catch(() => {});
  await svc.from('credit_ledger').delete().eq('user_id', uid);
  for (const b of bookings) await svc.from('bookings').delete().eq('id', b);
  await svc.auth.admin.deleteUser(uid);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
