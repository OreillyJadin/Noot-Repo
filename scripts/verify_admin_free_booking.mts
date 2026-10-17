// TUT-4 (Jadin, 2026-10): "Let's allow admins to pay $0 to book sessions." The server prices a
// booking whose student is an admin (public.is_admin() on the caller's JWT) at $0 — no
// student fee, no PaymentIntent or Stripe Customer, no Noot credit, no tutor payout, no
// platform fee — and every later step (accept, chat, complete, cancel, no-show) works on
// that row. A non-admin still pays the normal price, and no client input gets them to $0.
//
// Needs: supabase start, supabase functions serve, and STRIPE_SECRET_KEY=sk_test_… in the
// functions env file (the "no hold → refused" checks need the real-Stripe branch). Creates
// its own admin, student and tutor and removes them afterwards. Locally
// app_settings.require_admin_mfa is false, so a TOTP-less admin is an admin at aal1; in
// prod the same call needs an aal2 session (0059).
//   pnpm dlx tsx scripts/verify_admin_free_booking.mts
import { createClient } from '@supabase/supabase-js';
import { stripeTestMode } from './_stripe_test.mts';

const URL = 'http://127.0.0.1:54321';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const PASSWORD = 'Admin-Free-Verify-2026!';
const KEY = process.env.STRIPE_SECRET_KEY ?? '';

if (!stripeTestMode()) {
  console.error('STRIPE_SECRET_KEY must be an sk_test_ key (and be in the functions env file).');
  process.exit(1);
}

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
}
type Json = Record<string, any>;

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });
const tag = Date.now();
const created: string[] = [];

async function mkUser(kind: 'admin' | 'student' | 'tutor') {
  const email = `adminfree-${kind}+${tag}@crimson.ua.edu`;
  const { data, error } = await svc.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  const id = data.user!.id;
  created.push(id);
  const now = new Date().toISOString();
  await svc.from('users').update({
    first_name: kind, last_name: 'Verify', password_set_at: now,
    terms_accepted_at: now, terms_version: '2026-09-17', guidelines_accepted_at: now, guidelines_version: '2026-10-13',
  }).eq('id', id);
  const raw = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: s, error: sErr } = await raw.auth.signInWithPassword({ email, password: PASSWORD });
  if (sErr) throw sErr;
  return { id, email, token: s.session!.access_token, client: raw };
}

const admin = await mkUser('admin');
await svc.from('user_roles').upsert({ user_id: admin.id, role: 'admin' }, { onConflict: 'user_id,role' });
// Re-sign so the token exists after the role grant (is_admin reads the table, not the JWT).
const student = await mkUser('student');
const tutor = await mkUser('tutor');
{
  const now = new Date().toISOString();
  await svc.from('user_roles').upsert({ user_id: tutor.id, role: 'tutor' }, { onConflict: 'user_id,role' });
  const { error } = await svc.from('tutor_profiles').upsert({
    user_id: tutor.id, bio: 'verify_admin_free_booking tutor', approval_status: 'approved', grades_verified_at: null,
    stripe_connect_account_id: 'acct_verify_admin_free', stripe_charges_enabled: true, stripe_payouts_enabled: true, stripe_onboarded_at: now,
  }, { onConflict: 'user_id' });
  if (error) throw error;
  await svc.from('tutor_availability').insert(
    [0, 1, 2, 3, 4, 5, 6].map((d) => ({ tutor_id: tutor.id, day_of_week: d, start_time: '00:00', end_time: '23:59' })),
  );
}
const { data: anyCourse } = await svc.from('courses').select('course_code').eq('is_active', true).order('course_code').limit(1).single();
const courseCode = anyCourse!.course_code as string;
{
  const { error } = await svc.from('tutor_courses').insert({ tutor_id: tutor.id, course_code: courseCode, grade: 'A', hourly_rate: 28 });
  if (error) throw error;
}
const { data: adminFlag } = await admin.client.rpc('is_admin');
check('fixture: a fresh admin, student and $28/hr tutor; is_admin() is true for the admin only',
  adminFlag === true && (await student.client.rpc('is_admin')).data === false);

const call = async (fn: string, body: unknown, token: string) => {
  const res = await fetch(`${URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Json };
};
const stripeGet = async (path: string): Promise<Json> =>
  (await fetch(`https://api.stripe.com/v1/${path}`, { headers: { Authorization: `Bearer ${KEY}` } })).json();

let slot = 0;
const at = (hoursAhead: number) => new Date(Date.now() + hoursAhead * 3600e3 + slot++ * 15 * 60e3).toISOString();
const base = { tutorId: tutor.id, courseCode, durationMinutes: 60 };
const bookingRow = async (id: string) => (await svc.from('bookings')
  .select('status, price, student_fee, platform_fee, tutor_payout_amount, credit_applied, stripe_payment_intent_id, stripe_charge_id, stripe_transfer_id, payout_failed_at, refund_percent, refund_status, no_show_party')
  .eq('id', id).single()).data as Json;
const bookings: string[] = [];
const holds: string[] = [];

async function adminBooking(hoursAhead: number) {
  const scheduledAt = at(hoursAhead);
  const pi = await call('create-payment-intent', { ...base, scheduledAt }, admin.token);
  const r = await call('confirm-booking', { ...base, scheduledAt, sessionType: 'in_person', paymentIntentId: pi.body.paymentIntentId }, admin.token);
  if (r.status !== 200) throw new Error(`admin confirm-booking ${r.status} ${r.body.error ?? ''}`);
  bookings.push(r.body.bookingId);
  return { pi, r, bookingId: r.body.bookingId as string };
}

try {
  console.log('— admin: priced at $0, no Stripe objects —');
  await svc.from('credit_ledger').insert({ user_id: admin.id, amount_cents: 5000, kind: 'adjustment' });
  const { pi, r, bookingId } = await adminBooking(72);
  check('create-payment-intent answers $0 with no PaymentIntent for an admin',
    pi.status === 200 && pi.body.free === true && pi.body.paymentIntentId === null && pi.body.paymentIntentClientSecret === null &&
      pi.body.amountCents === 0 && pi.body.studentFeeCents === 0 && pi.body.creditCents === 0 && pi.body.chargeCents === 0 && pi.body.price === 0,
    JSON.stringify(pi.body));
  const { data: adminUser } = await svc.from('users').select('stripe_customer_id').eq('id', admin.id).single();
  check('…and created no Stripe Customer', adminUser?.stripe_customer_id === null);
  const row = await bookingRow(bookingId);
  check('confirm-booking stores a $0 booking: no fee, payout, platform fee, credit or PaymentIntent',
    r.body.free === true && r.body.price === 0 && r.body.studentFee === 0 && row.status === 'pending' &&
      Number(row.price) === 0 && Number(row.student_fee) === 0 && Number(row.platform_fee) === 0 &&
      Number(row.tutor_payout_amount) === 0 && Number(row.credit_applied) === 0 && row.stripe_payment_intent_id === null,
    JSON.stringify(row));
  const { data: adminBal } = await svc.rpc('credit_balance_cents', { p_user: admin.id });
  check('the admin’s Noot credit is untouched', Number(adminBal) === 5000, String(adminBal));
  const { data: convo } = await svc.from('conversations').select('id').eq('student_id', admin.id).eq('tutor_id', tutor.id).maybeSingle();
  const { data: msgs } = await svc.from('messages').select('id').eq('conversation_id', convo?.id ?? '00000000-0000-0000-0000-000000000000');
  check('the chat opened like any booking', !!convo && (msgs?.length ?? 0) >= 1);

  console.log('\n— admin booking: accept → complete, cancel, no-show all work with nothing to charge —');
  const accepted = await call('respond-booking-request', { bookingId, action: 'accept' }, tutor.token);
  check('tutor accepts the request', accepted.status === 200 && (await bookingRow(bookingId)).status === 'confirmed', JSON.stringify(accepted.body));
  await svc.from('bookings').update({ scheduled_at: new Date(Date.now() - 3 * 3600e3).toISOString() }).eq('id', bookingId);
  const done = await call('complete-session', { bookingId }, tutor.token);
  const doneRow = await bookingRow(bookingId);
  check('complete-session completes it with no capture and no transfer',
    done.status === 200 && done.body.captured === false && done.body.transferId === null && doneRow.status === 'completed' &&
      doneRow.stripe_charge_id === null && doneRow.stripe_transfer_id === null && doneRow.payout_failed_at === null,
    `${done.status} ${JSON.stringify(done.body)}`);

  const c = await adminBooking(10);
  await call('respond-booking-request', { bookingId: c.bookingId, action: 'accept' }, tutor.token);
  const cancelled = await call('cancel-booking', { bookingId: c.bookingId }, admin.token);
  const cRow = await bookingRow(c.bookingId);
  check('cancel-booking inside the 50% window cancels cleanly: nothing captured, nothing owed',
    cancelled.status === 200 && cancelled.body.refundPercent === 50 && cancelled.body.payoutFailed === false && cRow.status === 'cancelled' &&
      cRow.stripe_charge_id === null && cRow.stripe_transfer_id === null && cRow.payout_failed_at === null,
    `${cancelled.status} ${JSON.stringify(cancelled.body)}`);

  const n = await adminBooking(72);
  await call('respond-booking-request', { bookingId: n.bookingId, action: 'accept' }, tutor.token);
  await svc.from('bookings').update({ scheduled_at: new Date(Date.now() - 3 * 3600e3).toISOString() }).eq('id', n.bookingId);
  const noShow = await call('report-no-show', { bookingId: n.bookingId, party: 'student' }, tutor.token);
  const nRow = await bookingRow(n.bookingId);
  check('report-no-show (student) records the no-show with no capture or transfer',
    noShow.status === 200 && nRow.status === 'no_show' && nRow.no_show_party === 'student' && nRow.stripe_transfer_id === null && nRow.payout_failed_at === null,
    `${noShow.status} ${JSON.stringify(noShow.body)}`);

  const p = await adminBooking(72);
  const declined = await call('respond-booking-request', { bookingId: p.bookingId, action: 'decline' }, tutor.token);
  check('a declined admin request is just cancelled', declined.status === 200 && (await bookingRow(p.bookingId)).status === 'cancelled', JSON.stringify(declined.body));

  console.log('\n— non-admin: the normal price, and no way to $0 —');
  const sAt = at(72);
  const sPi = await call('create-payment-intent', { ...base, scheduledAt: sAt, free: true, amountCents: 0, price: 0, isAdmin: true }, student.token);
  if (sPi.body.paymentIntentId) holds.push(sPi.body.paymentIntentId);
  check('create-payment-intent prices a student at $28 + 17% with a real hold, whatever the body claims',
    sPi.status === 200 && sPi.body.free === false && sPi.body.amountCents === 3276 && sPi.body.studentFeeCents === 476 &&
      typeof sPi.body.paymentIntentId === 'string' && sPi.body.paymentIntentId.startsWith('pi_'),
    JSON.stringify(sPi.body));
  const onStripe = await stripeGet(`payment_intents/${sPi.body.paymentIntentId}`);
  check('…and the hold on Stripe is for that amount', onStripe.amount === 3276 && onStripe.capture_method === 'manual', String(onStripe.amount));

  for (const [label, pid] of [['no paymentIntentId', undefined], ['paymentIntentId: null', null], ['a made-up id', 'free']] as const) {
    const r2 = await call('confirm-booking', { ...base, scheduledAt: sAt, sessionType: 'in_person', paymentIntentId: pid, price: 0, free: true }, student.token);
    check(`confirm-booking refuses a student with ${label}`, r2.status === 400 && /completed payment is required/i.test(r2.body.error ?? ''),
      `${r2.status} ${JSON.stringify(r2.body)}`);
  }
  const r3 = await call('confirm-booking', { ...base, scheduledAt: sAt, sessionType: 'in_person', paymentIntentId: sPi.body.paymentIntentId }, student.token);
  check('…and an unauthorized hold is refused too (nothing booked)', r3.status === 400 && /not been authorized/i.test(r3.body.error ?? ''),
    `${r3.status} ${JSON.stringify(r3.body)}`);
  const { count } = await svc.from('bookings').select('id', { count: 'exact', head: true }).eq('student_id', student.id);
  check('the student has no booking', count === 0, String(count));

  console.log('\n— admin role without is_admin() → normal price —');
  // An admin whose MFA is required but not satisfied is not an admin to the server (0059).
  await svc.from('app_settings').update({ value: 'true' }).eq('key', 'require_admin_mfa');
  const gated = await call('create-payment-intent', { ...base, scheduledAt: at(80) }, admin.token);
  if (gated.body.paymentIntentId) holds.push(gated.body.paymentIntentId);
  check('with require_admin_mfa on and an aal1 session, the admin is priced like anyone else',
    gated.status === 200 && gated.body.free === false && gated.body.amountCents === 3276, JSON.stringify(gated.body));
} finally {
  await svc.from('app_settings').update({ value: 'false' }).eq('key', 'require_admin_mfa');
  for (const h of holds) {
    await fetch(`https://api.stripe.com/v1/payment_intents/${h}/cancel`, { method: 'POST', headers: { Authorization: `Bearer ${KEY}` } }).catch(() => {});
  }
  await svc.from('bookings').delete().in('id', bookings);
  await svc.from('credit_ledger').delete().eq('user_id', admin.id);
  await svc.from('conversations').delete().eq('student_id', admin.id);
  for (const id of created) await svc.auth.admin.deleteUser(id);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
