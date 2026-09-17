// Verify server-side pricing and booking eligibility (APP_REVIEW_TICKETS.md T5) against
// the LOCAL stack. Drives the real @noot/core path exactly as apps/mobile/app/b4.tsx does,
// then attacks it directly over HTTP the way a tampered client would.
//
// Needs: supabase start && node supabase/seed_demo.mjs && supabase functions serve
import { initSupabase, api, auth } from '../packages/core/src/index.ts'
import { createClient } from '@supabase/supabase-js'
import { authorizeHold, cancelHold, getPaymentIntent, setPaymentIntentMetadata, stripeTestMode } from './_stripe_test.mts'

const URL = 'http://127.0.0.1:54321'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

let pass = 0
let fail = 0
const step = (n: number | string, ok: boolean, msg: string) => {
  ok ? pass++ : fail++
  console.log(`${n}) ${ok ? 'PASS ✅' : 'FAIL ❌'} — ${msg}`)
}

initSupabase({ url: URL, anonKey: ANON })
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })

// --- setup -----------------------------------------------------------------
const signIn = await auth.signInWithPassword('student@crimson.ua.edu', 'password123')
step(1, signIn.ok, signIn.ok ? 'signed in as the demo student' : `sign-in failed: ${signIn.error}`)

// A second, plain client purely to get a raw access token for the direct-HTTP attacks
// below, which deliberately bypass @noot/core to send fields the typed API no longer has.
const raw = createClient(URL, ANON, { auth: { persistSession: false } })
const { data: rawSess } = await raw.auth.signInWithPassword({
  email: 'student@crimson.ua.edu', password: 'password123',
})
const accessToken = rawSess.session?.access_token ?? ''
const studentId = rawSess.user?.id ?? ''

const tutors = await api.tutors.search()
const tutor = tutors[0]!
step(2, !!tutor?.userId, tutor ? `picked tutor ${tutor.userId}` : 'no tutors found')

// The tutor's real rate for a course they actually teach, read straight from the DB.
const { data: courses } = await admin
  .from('tutor_courses')
  .select('course_code, hourly_rate')
  .eq('tutor_id', tutor.userId)
  .order('course_code')
const course = courses![0]!
const courseCode = course.course_code as string
const rate = Number(course.hourly_rate)
const DURATION = 60
const expectedPrice = Math.round((rate * DURATION / 60) * 100) / 100
const expectedCents = Math.round(expectedPrice * 100)
step(3, rate > 0, `tutor teaches ${courseCode} at $${rate}/hr → expect $${expectedPrice} (${expectedCents}c) for ${DURATION}min`)

// The tutor must be able to take charges, or every booking is correctly refused.
await admin.from('tutor_profiles').update({ stripe_charges_enabled: true }).eq('user_id', tutor.userId)

// Start from a clean slate. The double-booking check is real, so a leftover future
// booking from another suite (verify_mutations reschedules one to +5 days) would make
// these slots collide and look like a pricing failure.
await admin
  .from('bookings')
  .delete()
  .eq('tutor_id', tutor.userId)
  .in('status', ['pending', 'confirmed'])
  .gte('scheduled_at', new Date().toISOString())

const scheduledAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString() // +3 days, inside the 6-day horizon

// --- 4) the honest path still works ----------------------------------------
let paymentIntentId = ''
try {
  const pi = await api.createPaymentIntent({ tutorId: tutor.userId, courseCode, durationMinutes: DURATION, scheduledAt })
  paymentIntentId = pi.paymentIntentId
  step(4, pi.amountCents === expectedCents,
    `create-payment-intent computed ${pi.amountCents}c (expected ${expectedCents}c), simulated=${pi.simulated}`)
} catch (e) {
  step(4, false, `create-payment-intent threw: ${String(e)}`)
}

if (stripeTestMode() && paymentIntentId.startsWith('pi_')) {
  const conf = await authorizeHold(paymentIntentId)
  step('4b', conf.status === 'requires_capture', `authorized the hold → PI status ${conf.status}`)
}

let bookingId = ''
try {
  const res = await api.bookings.confirm({
    tutorId: tutor.userId, courseCode, scheduledAt, durationMinutes: DURATION,
    sessionType: 'in_person', message: 'Looking forward to it!', paymentIntentId,
  })
  bookingId = res.bookingId
  step(5, res.price === expectedPrice, `confirm-booking → booking ${bookingId} at price $${res.price}`)
} catch (e) {
  step(5, false, `confirm-booking threw: ${String(e)}`)
}

// The stored row is what complete-session pays out from — check every money column.
const { data: row } = await admin
  .from('bookings').select('price, platform_fee, tutor_payout_amount, subject').eq('id', bookingId).maybeSingle()
const expFee = Math.round(expectedPrice * 0.175 * 100) / 100
const expPayout = Math.round((expectedPrice - expFee) * 100) / 100
step(6, Number(row?.price) === expectedPrice && Number(row?.platform_fee) === expFee && Number(row?.tutor_payout_amount) === expPayout,
  `stored row: price $${row?.price}, fee $${row?.platform_fee} (expect $${expFee}), payout $${row?.tutor_payout_amount} (expect $${expPayout})`)

// --- the attacks: call the functions directly, as a tampered client would ---
const call = async (fn: string, body: unknown) => {
  const res = await fetch(`${URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

const base = { tutorId: tutor.userId, courseCode, durationMinutes: DURATION, scheduledAt }

// 7) An inflated amountCents is simply ignored — the field no longer exists.
{
  const r = await call('create-payment-intent', {
    ...base, amountCents: 99_999_00, price: 99_999,
    scheduledAt: new Date(Date.now() + 5 * 864e5).toISOString(), // its own slot — step 5 took `scheduledAt`
  })
  step(7, r.status === 200 && r.body.amountCents === expectedCents,
    `amountCents=9999900 ignored → server returned ${r.body.amountCents}c (status ${r.status})`)
}

// 8) An inflated price on confirm-booking is ignored too. This is the cash-out attempt:
//    before T5 this wrote tutor_payout_amount = $82,499.18.
{
  const attackSlot = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString()
  const pi = await call('create-payment-intent', { ...base, scheduledAt: attackSlot })
  if (stripeTestMode()) await authorizeHold(pi.body.paymentIntentId)
  const r = await call('confirm-booking', {
    ...base, sessionType: 'in_person', price: 99_999,
    scheduledAt: attackSlot,
    paymentIntentId: pi.body.paymentIntentId,
  })
  const { data: attacked } = await admin
    .from('bookings').select('price, tutor_payout_amount').eq('id', r.body.bookingId).maybeSingle()
  step(8, r.status === 200 && Number(attacked?.price) === expectedPrice,
    `price=99999 ignored → stored price $${attacked?.price}, payout $${attacked?.tutor_payout_amount} (status ${r.status})`)
  await admin.from('bookings').delete().eq('id', r.body.bookingId)
}

// 9) A course the tutor doesn't teach has no rate, so there's nothing to charge.
{
  const r = await call('create-payment-intent', { ...base, courseCode: 'ZZZ 999' })
  step(9, r.status === 400 && /does not teach/i.test(r.body.error ?? ''),
    `unknown course → ${r.status} "${r.body.error}"`)
}

// 10) Beyond the 6-day horizon, because a manual-capture hold lapses at ~7 days (T6).
{
  const r = await call('create-payment-intent', { ...base, scheduledAt: new Date(Date.now() + 10 * 864e5).toISOString() })
  step(10, r.status === 400 && /days ahead/i.test(r.body.error ?? ''), `+10 days → ${r.status} "${r.body.error}"`)
}

// 11) In the past.
{
  const r = await call('create-payment-intent', { ...base, scheduledAt: new Date(Date.now() - 864e5).toISOString() })
  step(11, r.status === 400 && /in the past/i.test(r.body.error ?? ''), `yesterday → ${r.status} "${r.body.error}"`)
}

// 12) A tutor who can't take charges must fail cleanly, not silently book.
{
  await admin.from('tutor_profiles').update({ stripe_charges_enabled: false }).eq('user_id', tutor.userId)
  const r = await call('create-payment-intent', base)
  step(12, r.status === 409 && /payouts/i.test(r.body.error ?? ''), `charges disabled → ${r.status} "${r.body.error}"`)
  await admin.from('tutor_profiles').update({ stripe_charges_enabled: true }).eq('user_id', tutor.userId)
}

// 13) A deleted tutor can't be booked by direct id (T2's booking half).
{
  await admin.from('users').update({ deleted_at: new Date().toISOString() }).eq('id', tutor.userId)
  const r = await call('create-payment-intent', base)
  step(13, r.status === 404, `deleted tutor → ${r.status} "${r.body.error}"`)
  await admin.from('users').update({ deleted_at: null }).eq('id', tutor.userId)
}

// 14) A blocked pair can't book each other, in either direction (T3's booking half).
{
  // tutor blocked the student — the direction RLS hides from the student entirely
  const ins = await admin.from('user_blocks').insert({ blocker_id: tutor.userId, blocked_id: studentId })
  const r = await call('create-payment-intent', base)
  step(14, r.status === 404 && !ins.error, `tutor-blocked-student → ${r.status} "${r.body.error}"`)
  await admin.from('user_blocks').delete().eq('blocker_id', tutor.userId).eq('blocked_id', studentId)
}

// 15) Booking yourself.
{
  const r = await call('create-payment-intent', { ...base, tutorId: studentId })
  step(15, r.status === 400 && /yourself/i.test(r.body.error ?? ''), `self-booking → ${r.status} "${r.body.error}"`)
}

// 16) Double-booking the slot we already took in step 5.
{
  const r = await call('create-payment-intent', { ...base, scheduledAt })
  step(16, r.status === 409 && /just booked/i.test(r.body.error ?? ''), `same slot again → ${r.status} "${r.body.error}"`)
}

// --- PaymentIntent verification (only meaningful with a Stripe key) -------
if (!stripeTestMode()) {
  console.log('\n17-21) SKIPPED — no sk_test_ STRIPE_SECRET_KEY in the function runtime, so')
  console.log('        confirm-booking took its simulated branch. Re-run with')
  console.log('        `supabase functions serve --env-file` carrying STRIPE_SECRET_KEY')
  console.log('        to cover the PaymentIntent checks.')
} else {
  // Each case needs its own slot or the double-booking check (correctly) rejects it.
  // Starts at +36h and steps 2h, staying clear of the +3d/+4d/+5d slots used above and
  // inside the 6-day horizon.
  let slotCursor = 36
  const freshSlot = () => {
    slotCursor += 2
    return new Date(Date.now() + slotCursor * 3600e3).toISOString()
  }

  // 17) A hold that was never authorized can't be booked against.
  {
    const slot = freshSlot()
    const pi = await call('create-payment-intent', { ...base, scheduledAt: slot })
    const r = await call('confirm-booking', { ...base, scheduledAt: slot, sessionType: 'in_person', paymentIntentId: pi.body.paymentIntentId })
    step(17, r.status === 400 && /not been authorized/i.test(r.body.error ?? ''), `unauthorized hold → ${r.status} "${r.body.error}"`)
  }

  // 18) A hold for a DIFFERENT course can't be reused for a pricier one. This is the
  //     attack the metadata check exists for: authorize $34, book something else.
  {
    const other = courses!.find((c) => c.course_code !== courseCode)
    if (!other) {
      console.log('18) SKIPPED — this tutor only teaches one course')
    } else {
      const slot = freshSlot()
      const pi = await call('create-payment-intent', { ...base, courseCode, scheduledAt: slot })
      await authorizeHold(pi.body.paymentIntentId)
      const r = await call('confirm-booking', {
        ...base, courseCode: other.course_code, scheduledAt: slot, sessionType: 'in_person',
        paymentIntentId: pi.body.paymentIntentId,
      })
      const mismatch = Number(other.hourly_rate) !== rate
      step(18, r.status === 400 || !mismatch,
        `hold for ${courseCode} ($${rate}) reused for ${other.course_code} ($${other.hourly_rate}) → ${r.status} "${r.body.error ?? 'allowed'}"`)
      await cancelHold(pi.body.paymentIntentId)
    }
  }

  // 19) The happy path with a real, authorized hold — and the hold amount must equal
  //     the server's price, which is the whole point of T5.
  let realBookingId = ''
  let realPi = ''
  {
    const slot = freshSlot()
    const pi = await call('create-payment-intent', { ...base, scheduledAt: slot })
    realPi = pi.body.paymentIntentId
    await authorizeHold(realPi)
    const onStripe = await getPaymentIntent(realPi)
    const r = await call('confirm-booking', { ...base, scheduledAt: slot, sessionType: 'in_person', paymentIntentId: realPi })
    realBookingId = r.body.bookingId ?? ''
    step(19, r.status === 200 && onStripe.amount === expectedCents && onStripe.capture_method === 'manual',
      `real hold ${onStripe.amount}c (manual=${onStripe.capture_method === 'manual'}) → booking ${realBookingId || r.body.error}`)
  }

  // 20) One hold, one booking.
  {
    const r = await call('confirm-booking', { ...base, scheduledAt: freshSlot(), sessionType: 'in_person', paymentIntentId: realPi })
    step(20, r.status === 409 && /already been used/i.test(r.body.error ?? ''), `reusing the same hold → ${r.status} "${r.body.error}"`)
  }

  // 21) Someone else's hold.
  {
    const slot = freshSlot()
    const pi = await call('create-payment-intent', { ...base, scheduledAt: slot })
    await authorizeHold(pi.body.paymentIntentId)
    // Rewrite the PI's owner metadata to a stranger, then try to spend it.
    await setPaymentIntentMetadata(pi.body.paymentIntentId, { user_id: '00000000-0000-4000-8000-000000000000' })
    const r = await call('confirm-booking', { ...base, scheduledAt: slot, sessionType: 'in_person', paymentIntentId: pi.body.paymentIntentId })
    step(21, r.status === 403 && /someone else/i.test(r.body.error ?? ''), `another user's hold → ${r.status} "${r.body.error}"`)
    await cancelHold(pi.body.paymentIntentId)
  }

  // Release the held funds we authorized, so nothing sits open in the test account.
  await cancelHold(realPi)
  if (realBookingId) await admin.from('bookings').delete().eq('id', realBookingId)
}

// cleanup
await admin.from('bookings').delete().eq('id', bookingId)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
