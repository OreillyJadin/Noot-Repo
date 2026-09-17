// Verify the confirm-booking Edge Function end-to-end against the LOCAL stack,
// driving the real @noot/core path (createPaymentIntent -> bookings.confirm ->
// listUpcoming) exactly as apps/mobile/app/b4.tsx does. Safe to delete after.
import { initSupabase, api, auth } from '../packages/core/src/index.ts'
import { createClient } from '@supabase/supabase-js'
import { authorizeHold } from './_stripe_test.mts'

const URL = 'http://127.0.0.1:54321'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const step = (n: number | string, ok: boolean, msg: string) =>
  console.log(`${n}) ${ok ? 'PASS ✅' : 'FAIL ❌'} — ${msg}`)

initSupabase({ url: URL, anonKey: ANON })
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })

// 1) Sign in as the seeded demo student.
const signIn = await auth.signInWithPassword('student@crimson.ua.edu', 'password123')
step(1, signIn.ok, signIn.ok ? 'signed in as demo student' : `sign-in failed: ${signIn.error}`)

// 2) Pick a real seeded tutor (NOTE: TutorSummary.userId, not .id).
const tutors = await api.tutors.search()
const tutor = tutors[0]
step(2, !!tutor?.userId, tutor ? `found tutor ${tutor.name} (userId ${tutor.userId})` : 'no tutors found')

// The tutor must be able to take charges, and we need a course they actually teach —
// the server now derives the price from tutor_courses.hourly_rate (T5).
await admin.from('tutor_profiles').update({ stripe_charges_enabled: true }).eq('user_id', tutor.userId)
const { data: tc } = await admin
  .from('tutor_courses').select('course_code').eq('tutor_id', tutor.userId).limit(1).single()
const courseCode = tc!.course_code as string

// 3) Hold a (simulated) PaymentIntent — the create-payment-intent Edge Function.
//    Note: no amount is sent. See scripts/verify_pricing.mts for the pricing checks.
let paymentIntentId = ''
const scheduledAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString() // +3 days
try {
  const pi = await api.createPaymentIntent({ tutorId: tutor.userId, courseCode, durationMinutes: 60, scheduledAt })
  paymentIntentId = pi.paymentIntentId
  step(3, !!paymentIntentId, `create-payment-intent → ${paymentIntentId} ($${pi.price}, simulated=${pi.simulated})`)
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
  step(4, !!bookingId && !!res.conversationId, `confirm-booking → booking ${bookingId}, conversation ${res.conversationId}`)
} catch (e) {
  step(4, false, `confirm-booking threw: ${String(e)}`)
}

// 5) listUpcoming (what the app's sessions screen reads) now returns it.
const upcoming = await api.listUpcoming()
const found = upcoming.find((b) => b.id === bookingId)
step(5, !!found, found ? `listUpcoming shows the booking (status=${found.status}, subject=${found.subject})` : `booking not in listUpcoming (${upcoming.length} upcoming)`)

// cleanup
if (bookingId) { await admin.from('bookings').delete().eq('id', bookingId); console.log('   (cleaned up test booking)') }
