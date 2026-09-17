// Verify the payout guards (APP_REVIEW_TICKETS.md T17-T19) against the LOCAL stack.
//
// These reproduce three attacks an adversarial audit proved live on 2026-09-10, each a way
// to move real money for a session that never happened:
//   T17  report-no-show captured the full hold days before the session (one tap, from the
//        Upcoming tab) because it checked neither status nor the clock.
//   T18  capture happened before the Connect destination was known good, with no rollback:
//        student charged, tutor unpaid, booking still 'confirmed', nothing flagged.
//   T19  reschedule-booking had no future/horizon/clash check and let a proposer accept
//        their OWN proposal — move a session to yesterday, self-accept, cancel, keep 100%.
//
// Needs: supabase start && node supabase/seed_demo.mjs && supabase functions serve
//        (with STRIPE_SECRET_KEY=sk_test_... for the capture paths)
import { initSupabase, api, auth } from '../packages/core/src/index.ts'
import { createClient } from '@supabase/supabase-js'
import { authorizeHold, cancelHold, getPaymentIntent, stripeTestMode } from './_stripe_test.mts'

const URL = 'http://127.0.0.1:54321'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

let pass = 0, fail = 0
const step = (n: number | string, ok: boolean, msg: string) => {
  ok ? pass++ : fail++
  console.log(`${n}) ${ok ? 'PASS ✅' : 'FAIL ❌'} — ${msg}`)
}

initSupabase({ url: URL, anonKey: ANON })
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })

// --- setup: a real confirmed booking with an authorized hold ---------------
const raw = createClient(URL, ANON, { auth: { persistSession: false } })
const asStudent = await raw.auth.signInWithPassword({ email: 'student@crimson.ua.edu', password: 'password123' })
const studentId = asStudent.data.user!.id
const studentToken = asStudent.data.session!.access_token
step(1, !!studentToken, 'signed in as the demo student')

await auth.signInWithPassword('student@crimson.ua.edu', 'password123')
const tutors = await api.tutors.search()
const tutor = tutors[0]!
await admin.from('tutor_profiles').update({ stripe_charges_enabled: true }).eq('user_id', tutor.userId)
const { data: tc } = await admin.from('tutor_courses').select('course_code').eq('tutor_id', tutor.userId).limit(1).single()
const courseCode = tc!.course_code as string

// A tutor token, for the calls only a tutor may make.
const { data: tutorUser } = await admin.from('users').select('email').eq('id', tutor.userId).single()
const asTutor = await raw.auth.signInWithPassword({ email: tutorUser!.email as string, password: 'password123' })
const tutorToken = asTutor.data.session?.access_token ?? ''
step(2, !!tutorToken, `signed in as the tutor (${tutorUser!.email})`)

const call = async (fn: string, body: unknown, token = studentToken) => {
  const res = await fetch(`${URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

await admin.from('bookings').delete().eq('tutor_id', tutor.userId).in('status', ['pending', 'confirmed'])

/** Book a real, future, confirmed session with an authorized hold. */
const makeBooking = async (hoursAhead: number) => {
  const scheduledAt = new Date(Date.now() + hoursAhead * 3600e3).toISOString()
  const pi = await call('create-payment-intent', { tutorId: tutor.userId, courseCode, durationMinutes: 60, scheduledAt })
  await authorizeHold(pi.body.paymentIntentId)
  const res = await call('confirm-booking', {
    tutorId: tutor.userId, courseCode, scheduledAt, durationMinutes: 60, sessionType: 'in_person',
    paymentIntentId: pi.body.paymentIntentId,
  })
  return { bookingId: res.body.bookingId as string, pi: pi.body.paymentIntentId as string, scheduledAt }
}

// ===== T17 — no-show on a session that hasn't happened =====================
{
  const b = await makeBooking(72) // 3 days out
  const r = await call('report-no-show', { bookingId: b.bookingId, party: 'student' }, tutorToken)
  const onStripe = stripeTestMode() ? await getPaymentIntent(b.pi) : { status: 'n/a', amount_received: 0 }
  step(3, r.status === 409 && /hasn't finished/i.test(r.body.error ?? ''),
    `tutor reports no-show 3 days early → ${r.status} "${r.body.error}"`)
  step(4, onStripe.amount_received === 0,
    `...and nothing was captured (PI status=${onStripe.status}, amount_received=${onStripe.amount_received})`)
  await cancelHold(b.pi)
  await admin.from('bookings').delete().eq('id', b.bookingId)
}

// 5) The same guard on complete-session.
{
  const b = await makeBooking(72)
  const r = await call('complete-session', { bookingId: b.bookingId }, tutorToken)
  const onStripe = stripeTestMode() ? await getPaymentIntent(b.pi) : { amount_received: 0 }
  step(5, r.status === 409 && /hasn't finished/i.test(r.body.error ?? '') && onStripe.amount_received === 0,
    `tutor completes a session 3 days early → ${r.status} "${r.body.error}", captured=${onStripe.amount_received}`)
  await cancelHold(b.pi)
  await admin.from('bookings').delete().eq('id', b.bookingId)
}

// 6) A no-show on a session that HAS finished still works — the guard must not block the
//    legitimate case. Backdate the row directly, since we can't wait an hour.
{
  const b = await makeBooking(72)
  await admin.from('bookings')
    .update({ scheduled_at: new Date(Date.now() - 3 * 3600e3).toISOString() })
    .eq('id', b.bookingId)
  const r = await call('report-no-show', { bookingId: b.bookingId, party: 'tutor' }, studentToken)
  step(6, r.status === 200 && r.body.refundPercent === 100,
    `student reports a tutor no-show after the session → ${r.status} refund ${r.body.refundPercent}%`)
  await admin.from('bookings').delete().eq('id', b.bookingId)
}

// 7) But not months later — a stale booking shouldn't become a payout.
{
  const b = await makeBooking(72)
  await admin.from('bookings')
    .update({ scheduled_at: new Date(Date.now() - 60 * 24 * 3600e3).toISOString() })
    .eq('id', b.bookingId)
  const r = await call('report-no-show', { bookingId: b.bookingId, party: 'student' }, tutorToken)
  step(7, r.status === 409 && /within 48 hours/i.test(r.body.error ?? ''),
    `no-show reported 60 days later → ${r.status} "${r.body.error}"`)
  await cancelHold(b.pi)
  await admin.from('bookings').delete().eq('id', b.bookingId)
}

// ===== T18 — a bad Connect destination must not cost the student money =====
if (!stripeTestMode()) {
  console.log('8) SKIPPED — needs a sk_test_ key in the function runtime')
} else {
  const b = await makeBooking(72)
  await admin.from('bookings')
    .update({ scheduled_at: new Date(Date.now() - 3 * 3600e3).toISOString() })
    .eq('id', b.bookingId)
  // Exactly T10's scenario: a Connect id that doesn't exist under these keys.
  const { data: prof } = await admin.from('tutor_profiles').select('stripe_connect_account_id').eq('user_id', tutor.userId).single()
  await admin.from('tutor_profiles').update({ stripe_connect_account_id: 'acct_fake_for_verify' }).eq('user_id', tutor.userId)

  const r = await call('complete-session', { bookingId: b.bookingId }, tutorToken)
  const onStripe = await getPaymentIntent(b.pi)
  const { data: row } = await admin.from('bookings').select('status, payout_failed_at').eq('id', b.bookingId).single()
  step(8, onStripe.amount_received === 0,
    `stale Connect id → nothing captured (amount_received=${onStripe.amount_received}, status ${r.status} "${r.body.error}")`)
  step(9, row!.status === 'confirmed' && row!.payout_failed_at === null,
    `...and the booking is untouched and not falsely flagged (status=${row!.status})`)

  await admin.from('tutor_profiles')
    .update({ stripe_connect_account_id: prof!.stripe_connect_account_id }).eq('user_id', tutor.userId)
  await cancelHold(b.pi)
  await admin.from('bookings').delete().eq('id', b.bookingId)
}

// ===== T19 — reschedule can't be used to rewrite the session one-sidedly ===
{
  const b = await makeBooking(72)

  // 10) A proposer can't accept their own proposal.
  await call('reschedule-booking', {
    bookingId: b.bookingId, action: 'propose',
    newScheduledAt: new Date(Date.now() + 96 * 3600e3).toISOString(),
  }, studentToken)
  const self = await call('reschedule-booking', { bookingId: b.bookingId, action: 'accept' }, studentToken)
  step(10, self.status === 403 && /other person/i.test(self.body.error ?? ''),
    `student accepts their own proposal → ${self.status} "${self.body.error}"`)

  // 11) The counterparty still can.
  const other = await call('reschedule-booking', { bookingId: b.bookingId, action: 'accept' }, tutorToken)
  step(11, other.status === 200, `tutor accepts the student's proposal → ${other.status}`)

  // 12) A time in the past is refused — this was the "late cancel for 0% refund" attack.
  const past = await call('reschedule-booking', {
    bookingId: b.bookingId, action: 'propose', newScheduledAt: new Date(Date.now() - 864e5).toISOString(),
  }, studentToken)
  step(12, past.status === 400 && /in the future/i.test(past.body.error ?? ''),
    `propose yesterday → ${past.status} "${past.body.error}"`)

  // 13) Beyond the hold's life is refused — this was the "tutor never gets paid" attack.
  const far = await call('reschedule-booking', {
    bookingId: b.bookingId, action: 'propose', newScheduledAt: new Date(Date.now() + 60 * 24 * 3600e3).toISOString(),
  }, studentToken)
  step(13, far.status === 400 && /days ahead/i.test(far.body.error ?? ''),
    `propose +60 days → ${far.status} "${far.body.error}"`)

  await cancelHold(b.pi)
  await admin.from('bookings').delete().eq('id', b.bookingId)
}

await admin.from('bookings').delete().eq('tutor_id', tutor.userId).in('status', ['pending', 'confirmed'])
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
