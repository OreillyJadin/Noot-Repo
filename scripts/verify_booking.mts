// Verify the confirm-booking Edge Function end-to-end against the LOCAL stack,
// driving the real @noot/core path (createPaymentIntent -> bookings.confirm ->
// listUpcoming) exactly as apps/mobile/app/b4.tsx does. Pending requests remain
// chat-free until the tutor accepts. Safe to delete after.
import { DEV_PASSWORD } from './_devPassword.mjs'
import { initSupabase, api, auth } from '../packages/core/src/index.ts'
import { createClient } from '@supabase/supabase-js'
import { authorizeHold, cancelHold } from './_stripe_test.mts'

const URL = 'http://127.0.0.1:54321'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const step = (n: number | string, ok: boolean, msg: string) =>
  console.log(`${n}) ${ok ? 'PASS ✅' : 'FAIL ❌'} — ${msg}`)

initSupabase({ url: URL, anonKey: ANON })
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })

// 1) Sign in as the seeded demo student.
const signIn = await auth.signInWithPassword('student@crimson.ua.edu', DEV_PASSWORD)
step(1, signIn.ok, signIn.ok ? 'signed in as demo student' : `sign-in failed: ${signIn.error}`)

// 2) Pick a real seeded tutor (NOTE: TutorSummary.userId, not .id).
const tutors = await api.tutors.search()
const tutor = tutors.find((candidate) =>
  candidate.firstName === 'Sara' && candidate.lastName === 'Williams')
step(2, !!tutor?.userId, tutor ? `found tutor ${tutor.firstName} ${tutor.lastName} (userId ${tutor.userId})` : 'no tutors found')

// The tutor must be able to take charges, and we need a course they actually teach —
// the server now derives the price from tutor_courses.hourly_rate (T5).
await admin.from('tutor_profiles').update({ stripe_charges_enabled: true }).eq('user_id', tutor.userId)
const { data: tc } = await admin
  .from('tutor_courses').select('course_code').eq('tutor_id', tutor.userId).limit(1).single()
const courseCode = tc!.course_code as string

const { data: availability } = await admin.from('tutor_availability')
  .select('day_of_week,start_time,end_time').eq('tutor_id', tutor.userId)
const { data: existingBookings } = await admin.from('bookings')
  .select('scheduled_at,duration_minutes').eq('tutor_id', tutor.userId)
  .in('status', ['pending', 'confirmed'])
const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})
const partsAt = (date: Date) => Object.fromEntries(formatter.formatToParts(date)
  .map((part) => [part.type, part.value]))
const chicagoSlot = (days: number, minutes: number) => {
  const local = partsAt(new Date())
  const date = new Date(Date.UTC(Number(local.year), Number(local.month) - 1, Number(local.day) + days))
  const target = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(),
    Math.floor(minutes / 60), minutes % 60)
  let instant = target
  for (let i = 0; i < 4; i++) {
    const parts = partsAt(new Date(instant))
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second))
    const adjusted = instant + target - represented
    if (adjusted === instant) break
    instant = adjusted
  }
  return new Date(instant).toISOString()
}
const weekdayAt = (days: number) => {
  const local = partsAt(new Date())
  return new Date(Date.UTC(Number(local.year), Number(local.month) - 1,
    Number(local.day) + days)).getUTCDay()
}
const minuteOf = (time: string) => {
  const [hour, minute] = time.slice(0, 5).split(':').map(Number)
  return hour * 60 + minute
}
let scheduledAt = ''
for (let days = 1; days <= 6 && !scheduledAt; days++) {
  for (const window of availability ?? []) {
    if (Number(window.day_of_week) !== weekdayAt(days)) continue
    for (let minute = minuteOf(window.start_time as string);
      minute + 60 <= minuteOf(window.end_time as string); minute += 60) {
      const candidate = chicagoSlot(days, minute)
      const start = new Date(candidate).getTime()
      const end = start + 60 * 60_000
      const overlaps = (existingBookings ?? []).some((booking) => {
        const bookingStart = new Date(booking.scheduled_at as string).getTime()
        return bookingStart < end && start < bookingStart + Number(booking.duration_minutes) * 60_000
      })
      if (start > Date.now() + 2 * 60 * 60_000 && start < Date.now() + 6 * 86_400_000 && !overlaps) {
        scheduledAt = candidate
        break
      }
    }
    if (scheduledAt) break
  }
}
if (!scheduledAt) throw new Error('No free hour inside the tutor availability and six-day horizon')

// 3) Hold a (simulated) PaymentIntent — the create-payment-intent Edge Function.
//    Note: no amount is sent. See scripts/verify_pricing.mts for the pricing checks.
let paymentIntentId = ''
let expectedStudentFeeCents = 0
try {
  const pi = await api.createPaymentIntent({ tutorId: tutor.userId, courseCode, durationMinutes: 60, scheduledAt })
  paymentIntentId = pi.paymentIntentId
  expectedStudentFeeCents = pi.studentFeeCents
  step(3, !!paymentIntentId && pi.amountCents === Math.round(pi.price * 100) + pi.studentFeeCents,
    `create-payment-intent → ${paymentIntentId} ($${pi.price} session + ${pi.studentFeeCents}c service fee = ${pi.amountCents}c, simulated=${pi.simulated})`)
} catch (e) {
  step(3, false, `create-payment-intent threw: ${String(e)}`)
}

// 3b) Authorize the hold. In the app the native PaymentSheet does this; confirm-booking
//     now requires status `requires_capture` (T5), so a script has to do it explicitly.
//     Skipped on the simulated path, where there is no real PaymentIntent.
if (paymentIntentId.startsWith('pi_')) {
  const held = await authorizeHold(paymentIntentId)
  step('3b', held?.status === 'requires_capture', `authorized the hold → ${held?.status}`)
}

// 4) Confirm the booking — the confirm-booking Edge Function.
let bookingId = ''
try {
  const res = await api.bookings.confirm({
    tutorId: tutor.userId,
    courseCode,
    scheduledAt,
    durationMinutes: 60,
    sessionType: 'in_person',
    message: 'Looking forward to it!',
    paymentIntentId,
  })
  bookingId = res.bookingId
  step(4, !!bookingId && !('conversationId' in res) && !!res.acceptBy &&
    Math.round(res.studentFee * 100) === expectedStudentFeeCents,
    `confirm-booking → pending request ${bookingId} without a conversation id, service fee $${res.studentFee}, accept by ${res.acceptBy}`)
} catch (e) {
  step(4, false, `confirm-booking threw: ${String(e)}`)
}

// 5) listUpcoming (what the app's sessions screen reads) now returns it.
const upcoming = await api.listUpcoming()
const found = upcoming.find((b) => b.id === bookingId)
step(5, !!found && found.status === 'pending' && found.studentFee > 0,
  found ? `listUpcoming shows the request (status=${found.status}, subject=${found.subject}, service fee=$${found.studentFee})` : `booking not in listUpcoming (${upcoming.length} upcoming)`)

if (bookingId) {
  const { data: tutorUser } = await admin.from('users').select('email').eq('id', tutor.userId).single()
  await auth.signInWithPassword(tutorUser!.email as string, DEV_PASSWORD)
  const accepted = await api.bookings.respond({ bookingId, action: 'accept' })
  step('5b', accepted.status === 'confirmed', 'tutor accepts the request')
  await auth.signInWithPassword('student@crimson.ua.edu', DEV_PASSWORD)
}

// cleanup
if (bookingId) { await admin.from('bookings').delete().eq('id', bookingId); console.log('   (cleaned up test booking)') }
if (paymentIntentId.startsWith('pi_')) {
  const released = await cancelHold(paymentIntentId)
  step(6, released?.status === 'canceled', `released the test hold → ${released?.status}`)
}
