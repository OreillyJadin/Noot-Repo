// A session ends exactly one way (QA AMB-02). complete-session, cancel-booking and
// report-no-show each read a confirmed booking and then write its final status; the last
// writer used to win, so a session could end "completed" (tutor paid, inviter rewarded)
// after cancel-booking had already refunded the student and returned their Noot credit.
// Against the LOCAL stack with `supabase functions serve` running; simulated payments.
//   pnpm dlx tsx scripts/verify_session_race.mts
import { createClient } from '@supabase/supabase-js';

const URL = 'http://127.0.0.1:54321';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const PASSWORD = 'Race-Verify-2026!';
const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
}

const created: string[] = [];
async function newUser(tag: string): Promise<{ uid: string; token: string }> {
  const email = `race-${tag.toLowerCase()}-${Date.now()}${Math.floor(Math.random() * 1e4)}@crimson.ua.edu`;
  const { data: u, error } = await svc.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  created.push(u.user!.id);
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: s, error: sErr } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (sErr) throw sErr;
  return { uid: u.user!.id, token: s.session!.access_token };
}
async function call(name: string, token: string, body: unknown) {
  const r = await fetch(`${URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  await r.text();
  return r.status;
}

const student = await newUser('Student');
const tutor = await newUser('Tutor');
let slot = 0;
/** A confirmed, already-finished session paid partly with $5 of Noot credit. */
async function finishedSession(): Promise<string> {
  const scheduledAt = new Date(Date.now() - (3 + slot++ * 1.5) * 3600e3).toISOString();
  const { data, error } = await svc.from('bookings').insert({
    student_id: student.uid, tutor_id: tutor.uid, subject: 'MGT 300', scheduled_at: scheduledAt,
    duration_minutes: 60, price: 28, platform_fee: 4.9, tutor_payout_amount: 23.1, credit_applied: 5,
    status: 'confirmed', session_type: 'in_person', stripe_payment_intent_id: `sim_pi_race_${crypto.randomUUID()}`,
    cancellation_deadline: new Date(Date.parse(scheduledAt) - 864e5).toISOString(),
  }).select('id').single();
  if (error) throw error;
  return data.id as string;
}
const row = async (id: string) =>
  (await svc.from('bookings').select('status, refund_status, cancelled_from_status').eq('id', id).single()).data!;

try {
  if ((await fetch(`${URL}/functions/v1/complete-session`, { method: 'OPTIONS' }).catch(() => null))?.ok !== true) {
    throw new Error('Edge Functions are not being served (supabase functions serve)');
  }

  console.log('— complete-session vs cancel-booking —');
  let both = 0;
  let mixed = 0;
  for (let i = 0; i < 8; i++) {
    const id = await finishedSession();
    const [done, cancelled] = await Promise.all([
      call('complete-session', tutor.token, { bookingId: id }),
      call('cancel-booking', tutor.token, { bookingId: id }),
    ]);
    const b = await row(id);
    if (done === 200 && cancelled === 200) both++;
    if (b.status === 'completed' && b.cancelled_from_status != null) mixed++;
  }
  check('never both completed and cancelled', both === 0, `${both} of 8 races both succeeded`);
  check('a completed session never carries a cancellation refund', mixed === 0, `${mixed} of 8`);

  console.log('— complete-session vs report-no-show —');
  both = 0;
  let overwritten = 0;
  for (let i = 0; i < 6; i++) {
    const id = await finishedSession();
    const [done, noShow] = await Promise.all([
      call('complete-session', tutor.token, { bookingId: id }),
      call('report-no-show', student.token, { bookingId: id, party: 'tutor' }),
    ]);
    const b = await row(id);
    if (done === 200 && noShow === 200) both++;
    if ((done === 200) !== (b.status === 'completed')) overwritten++;
  }
  check('never both completed and a no-show', both === 0, `${both} of 6 races both succeeded`);
  check('the call that reported success is the final status', overwritten === 0, `${overwritten} of 6`);

  console.log('— sequential calls still work —');
  const a = await finishedSession();
  check('complete-session completes a finished session', (await call('complete-session', tutor.token, { bookingId: a })) === 200 && (await row(a)).status === 'completed');
  check('…and a later cancel is refused', (await call('cancel-booking', tutor.token, { bookingId: a })) !== 200 && (await row(a)).status === 'completed');
  const c = await finishedSession();
  check('cancel-booking cancels a confirmed session', (await call('cancel-booking', tutor.token, { bookingId: c })) === 200 && (await row(c)).status === 'cancelled');
  check('…and a later complete is refused', (await call('complete-session', tutor.token, { bookingId: c })) !== 200 && (await row(c)).status === 'cancelled');
} finally {
  for (const id of created) await svc.auth.admin.deleteUser(id);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
