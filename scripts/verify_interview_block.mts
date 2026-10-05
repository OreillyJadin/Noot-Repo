// Verify that a tutor's interview with the noot team blocks their time for booking (ERR-032)
// against the LOCAL stack, through @noot/core exactly as the app books and reschedules.
//
// The demo tutor (sara) is approved AND given an interview here, which the admin screen
// never does (it only schedules applicants, who can't be booked) but the database allows.
//
// Leaves behind on the LOCAL stack: sara's interview notifications, the conversation and
// message confirm-booking creates, and stripe_charges_enabled = true on sara. A live
// interview sara already had is replaced, then removed.
//
// Needs: supabase start && node supabase/seed_demo.mjs && supabase functions serve
//        --env-file <file with STRIPE_SECRET_KEY=sk_test_…>, and the same key in this shell.
//   pnpm dlx tsx scripts/verify_interview_block.mts
import { createClient } from '@supabase/supabase-js'
import { initSupabase, api, auth } from '../packages/core/src/index.ts'
import { authorizeHold, cancelHold, stripeTestMode } from './_stripe_test.mts'

const URL = 'http://127.0.0.1:54321'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
// The same words as a slot another student took: an interview is not a student's business.
const BUSY = 'That time was just booked. Please pick another slot.'
const BUSY_MOVE = 'That time is already booked. Please pick another.'

if (!stripeTestMode()) {
  console.error('Refusing to run: STRIPE_SECRET_KEY is not a test key (sk_test_…).')
  process.exit(1)
}

let pass = 0, fail = 0, n = 0
const step = (ok: boolean, msg: string) => {
  ok ? pass++ : fail++
  console.log(`${++n}) ${ok ? 'PASS ✅' : 'FAIL ❌'} — ${msg}`)
}

initSupabase({ url: URL, anonKey: ANON })
const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })
const signIn = async (email: string) => {
  const r = await auth.signInWithPassword(email, 'password123')
  if (!r.ok) throw new Error(`sign in as ${email}: ${r.error}`)
}
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e))

const { data: tutor } = await svc.from('users').select('id').eq('email', 'sara@crimson.ua.edu').single()
const tutorId = tutor!.id as string
const { data: tc } = await svc.from('tutor_courses').select('course_code').eq('tutor_id', tutorId).limit(1).single()
const courseCode = tc!.course_code as string
await svc.from('tutor_profiles').update({ stripe_charges_enabled: true }).eq('user_id', tutorId)

// 5:00 AM four days out: inside the booking horizon, and an hour nobody's seed data uses.
const d = new Date(); d.setDate(d.getDate() + 4); d.setHours(5, 0, 0, 0)
const T = d.getTime()
const iso = (offsetMin: number) => new Date(T + offsetMin * 60 * 1000).toISOString()
const holds: string[] = []
/** Ask to book the tutor for an hour starting `offsetMin` from the interview. Null if accepted. */
const tryBook = async (offsetMin: number, durationMinutes = 60): Promise<string | null> => {
  try {
    const pi = await api.createPaymentIntent({ tutorId, courseCode, durationMinutes, scheduledAt: iso(offsetMin) })
    holds.push(pi.paymentIntentId)
    return null
  } catch (e) {
    return errMsg(e)
  }
}
let bookingId = ''

try {
  // The seeded tutor may already have a live interview; this run replaces and then removes it.
  await signIn('admin@crimson.ua.edu')
  const interview = await api.admin.scheduleInterview(tutorId, iso(0), 'verify_interview_block')
  step(!!interview.id, 'an admin schedules an interview with the tutor')

  await signIn('student@crimson.ua.edu')
  const during = await tryBook(0)
  step(during === BUSY, `a student cannot book the interview's hour, and is told only that it is taken: "${during}"`)
  const into = await tryBook(-30)
  step(into === BUSY, 'nor a session that runs into it')
  const outOf = await tryBook(30)
  step(outOf === BUSY, 'nor one that starts before it ends')
  const around = await tryBook(-60, 180)
  step(around === BUSY, 'nor a long session that contains it')

  const before = await tryBook(-60)
  const after = await tryBook(60)
  step(before === null && after === null, `the hour before and the hour after are still bookable${before || after ? `: ${before ?? after}` : ''}`)

  // ---- moving an existing session onto the interview ----
  const pi = holds[holds.length - 1]!
  if (pi.startsWith('pi_')) await authorizeHold(pi)
  const confirmed = await api.bookings.confirm({
    tutorId, courseCode, scheduledAt: iso(60), durationMinutes: 60, sessionType: 'in_person',
    message: 'verify_interview_block', paymentIntentId: pi,
  })
  bookingId = confirmed.bookingId
  const move = await api.bookings.reschedule({ bookingId, action: 'propose', newScheduledAt: iso(0) }).then(() => null, errMsg)
  step(move === BUSY_MOVE, `an existing session cannot be moved onto the interview: "${move}"`)
  const moveOk = await api.bookings.reschedule({ bookingId, action: 'propose', newScheduledAt: iso(180) }).then(() => null, errMsg)
  step(moveOk === null, `but it can be moved to a free time${moveOk ? `: ${moveOk}` : ''}`)

  // ---- once the interview is off, the hour is free again ----
  await signIn('admin@crimson.ua.edu')
  await api.admin.cancelInterview(tutorId)
  await signIn('student@crimson.ua.edu')
  const freed = await tryBook(0)
  step(freed === null, `cancelling the interview frees its hour${freed ? `: ${freed}` : ''}`)
} finally {
  await auth.signOut().catch(() => {})
  await svc.from('tutor_interviews').delete().eq('tutor_id', tutorId).eq('details', 'verify_interview_block')
  for (const id of holds) if (id.startsWith('pi_')) await cancelHold(id).catch(() => {})
  if (bookingId) {
    await svc.from('bookings').delete().eq('id', bookingId)
  }
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
