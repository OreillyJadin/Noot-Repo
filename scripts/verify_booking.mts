// Verify the confirm-booking Edge Function end-to-end against the LOCAL stack,
// driving the real @noot/core path (createPaymentIntent -> bookings.confirm ->
// listUpcoming) exactly as apps/mobile/app/b4.tsx does. Safe to delete after.
import { initSupabase, api, auth } from '../packages/core/src/index.ts'
import { createClient } from '@supabase/supabase-js'

const URL = 'http://127.0.0.1:54321'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const step = (n: number, ok: boolean, msg: string) =>
  console.log(`${n}) ${ok ? 'PASS ✅' : 'FAIL ❌'} — ${msg}`)

initSupabase({ url: URL, anonKey: ANON })
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })

// 1) Sign in as the seeded demo student.
const signIn = await auth.devSignIn('student@crimson.ua.edu', 'password123')
step(1, signIn.ok, signIn.ok ? 'signed in as demo student' : `sign-in failed: ${signIn.error}`)

// 2) Pick a real seeded tutor (NOTE: TutorSummary.userId, not .id).
const tutors = await api.tutors.search()
const tutor = tutors[0]
step(2, !!tutor?.userId, tutor ? `found tutor ${tutor.name} (userId ${tutor.userId})` : 'no tutors found')

// 3) Hold a (simulated) PaymentIntent — the create-payment-intent Edge Function.
let paymentIntentId = ''
try {
  const pi = await api.createPaymentIntent(60 * 60) // $60/hr → cents
  paymentIntentId = pi.paymentIntentId
  step(3, !!paymentIntentId, `create-payment-intent → ${paymentIntentId} (simulated=${pi.simulated})`)
} catch (e) {
  step(3, false, `create-payment-intent threw: ${String(e)}`)
}

// 4) Confirm the booking — the confirm-booking Edge Function.
let bookingId = ''
const scheduledAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString() // +3 days
try {
  const res = await api.bookings.confirm({
    tutorId: tutor.userId,
    subject: 'MATH 125',
    scheduledAt,
    durationMinutes: 60,
    sessionType: 'video',
    price: 60,
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
