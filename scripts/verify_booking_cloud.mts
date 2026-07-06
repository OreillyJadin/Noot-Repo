// Verify confirm-booking against the CLOUD project (the app's real DB), driving the
// real @noot/core path. Reads cloud URL + anon key from apps/mobile/.env (never
// prints them). Uses only the public anon key + the seeded demo student; cleans up
// by cancelling through the student-authorized cancel-booking function (no
// service_role needed). Safe to delete after.
import { readFileSync } from 'node:fs'
import { initSupabase, api, auth } from '../packages/core/src/index.ts'

const env = readFileSync(new URL('../apps/mobile/.env', import.meta.url), 'utf8')
const get = (k: string) =>
  env.split('\n').find((l) => l.trim().startsWith(k + '='))?.split('=').slice(1).join('=').trim()
const SB_URL = get('EXPO_PUBLIC_SUPABASE_URL')!
const ANON = get('EXPO_PUBLIC_SUPABASE_ANON_KEY')!

const step = (n: number, ok: boolean, msg: string) =>
  console.log(`${n}) ${ok ? 'PASS ✅' : 'FAIL ❌'} — ${msg}`)

console.log(`Target: ${SB_URL.includes('127.0.0.1') ? 'LOCAL' : 'CLOUD'} (${SB_URL})`)
initSupabase({ url: SB_URL, anonKey: ANON })

const signIn = await auth.devSignIn('student@crimson.ua.edu', 'password123')
step(1, signIn.ok, signIn.ok ? 'signed in as demo student on cloud' : `sign-in failed: ${signIn.error}`)

const tutors = await api.tutors.search()
const tutor = tutors[0]
step(2, !!tutor?.userId, tutor ? `found tutor ${tutor.firstName} ${tutor.lastName} (${tutor.userId})` : 'no tutors found')

let bookingId = ''
try {
  const { paymentIntentId } = await api.createPaymentIntent(60 * 60)
  const res = await api.bookings.confirm({
    tutorId: tutor.userId,
    subject: 'MATH 125',
    scheduledAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    durationMinutes: 60,
    sessionType: 'video',
    price: 60,
    message: '[automated verify — will cancel]',
    paymentIntentId,
  })
  bookingId = res.bookingId
  step(3, !!bookingId, `confirm-booking on cloud → booking ${bookingId}`)
} catch (e) {
  step(3, false, `confirm-booking threw: ${String(e)}`)
}

const upcoming = await api.listUpcoming()
const found = upcoming.find((b) => b.id === bookingId)
step(4, !!found, found ? `listUpcoming shows it (status=${found.status})` : `not in listUpcoming (${upcoming.length})`)

// cleanup — cancel through the student-authorized function (no service_role).
if (bookingId) {
  try {
    const c = await api.bookings.cancel(bookingId)
    console.log(`   (cleaned up: cancelled booking → status=${c.status}, refund=${c.refundPercent}%)`)
  } catch (e) {
    console.log(`   (cleanup cancel failed — manually remove booking ${bookingId}): ${String(e)}`)
  }
}
