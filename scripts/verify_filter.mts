// Verify the server-side content filter (APP_REVIEW_TICKETS.md T4, Guideline 1.2) against
// the LOCAL stack. The point is that the filter cannot be routed around: the chat RPC, a
// direct client insert, and a service-role insert must all be rejected.
//
// Needs: supabase start && node supabase/seed_demo.mjs
import { initSupabase, api, auth } from '../packages/core/src/index.ts'
import { createClient } from '@supabase/supabase-js'

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

const signIn = await auth.signInWithPassword('student@crimson.ua.edu', 'password123')
step(1, signIn.ok, signIn.ok ? 'signed in as the demo student' : `sign-in failed: ${signIn.error}`)

// A conversation to write into. seed_demo doesn't create one, so make it if absent.
const { data: studentRow } = await admin.from('users').select('id').eq('email', 'student@crimson.ua.edu').single()
const { data: tutorRow } = await admin.from('tutor_profiles').select('user_id').limit(1).single()
const { data: convo } = await admin
  .from('conversations')
  .upsert({ student_id: studentRow!.id, tutor_id: tutorRow!.user_id }, { onConflict: 'student_id,tutor_id' })
  .select('id')
  .single()
step(2, !!convo?.id, convo ? `using conversation ${convo.id}` : 'could not create a conversation')

// Contains "coon" and "fag" as substrings only. The filter is word-boundary matched, so
// this must be ALLOWED — over-blocking innocent text is its own kind of failure.
const INNOCENT = 'Can you help me with the raccoon faggots problem set in my class?'
const OFFENSIVE = 'you are a complete retard'

// 3) A normal message passes, including innocent substring matches.
try {
  const m = await api.chat.sendMessage(convo!.id, INNOCENT)
  step(3, !!m, 'normal message accepted (substring matches like "raccoon" are not blocked)')
} catch (e) {
  step(3, false, `normal message was rejected: ${(e as Error).message}`)
}

// 4) An offensive message is rejected through the real @noot/core path, with copy a user
//    can actually read.
try {
  await api.chat.sendMessage(convo!.id, OFFENSIVE)
  step(4, false, 'offensive message was ACCEPTED — the filter is not working')
} catch (e) {
  const msg = (e as Error).message
  step(4, /community rules/i.test(msg), `offensive message rejected: "${msg}"`)
}

// 5) It can't be routed around by inserting into `messages` directly.
const sb = createClient(URL, ANON, { auth: { persistSession: false } })
const { data: sess } = await sb.auth.signInWithPassword({
  email: 'student@crimson.ua.edu', password: 'password123',
})
const studentId = sess.user!.id
{
  const { error } = await sb.from('messages').insert({
    conversation_id: convo!.id, sender_id: studentId, content: OFFENSIVE,
  })
  step(5, !!error && /community rules/i.test(error.message), `direct client insert rejected: "${error?.message ?? 'ACCEPTED'}"`)
}

// 6) Nor by a SERVICE-ROLE insert, which bypasses RLS entirely. confirm-booking posts its
//    opening message this way, so an RLS-only filter would have left that path open.
{
  const { error } = await admin.from('messages').insert({
    conversation_id: convo!.id, sender_id: studentId, content: OFFENSIVE,
  })
  step(6, !!error && /community rules/i.test(error.message), `service-role insert rejected: "${error?.message ?? 'ACCEPTED'}"`)
}

// 7) Tutor bios — the reply describes tutor profiles as pre-moderated.
{
  const { data: tutor } = await admin.from('tutor_profiles').select('user_id, bio').limit(1).single()
  const { error } = await admin.from('tutor_profiles')
    .update({ bio: `Happy to help. ${OFFENSIVE}` }).eq('user_id', tutor!.user_id)
  step(7, !!error && /community rules/i.test(error.message), `tutor bio rejected: "${error?.message ?? 'ACCEPTED'}"`)
  // and an innocent edit still works
  const { error: ok } = await admin.from('tutor_profiles')
    .update({ bio: tutor!.bio ?? 'Happy to help with coursework.' }).eq('user_id', tutor!.user_id)
  step('7b', !ok, `innocent bio edit still allowed${ok ? `: ${ok.message}` : ''}`)
}

// 8) Review comments. Nothing is seeded, so make a completed booking to hang one off —
//    /terms calls reviews user-generated content, so this path has to be covered.
{
  const { data: tutorRow } = await admin.from('tutor_profiles').select('user_id').limit(1).single()
  const { data: booking, error: bErr } = await admin.from('bookings').insert({
    student_id: studentId, tutor_id: tutorRow!.user_id, subject: 'MGT 300',
    scheduled_at: new Date(Date.now() - 7 * 864e5).toISOString(), duration_minutes: 60,
    price: 25, platform_fee: 4.38, tutor_payout_amount: 20.62, session_type: 'in_person',
    status: 'completed', refund_status: 'not_applicable', stripe_payment_intent_id: 'sim_pi_review_test',
    cancellation_deadline: new Date(Date.now() - 8 * 864e5).toISOString(),
  }).select('id').single()
  if (bErr) throw new Error(`could not create the review's booking: ${bErr.message}`)

  const { error: blocked } = await admin.from('reviews').insert({
    booking_id: booking!.id, reviewer_id: studentId, subject_user_id: tutorRow!.user_id,
    rating: 1, comment: OFFENSIVE,
  })
  step(8, !!blocked && /community rules/i.test(blocked.message),
    `review comment rejected on insert: "${blocked?.message ?? 'ACCEPTED'}"`)

  const { error: allowed } = await admin.from('reviews').insert({
    booking_id: booking!.id, reviewer_id: studentId, subject_user_id: tutorRow!.user_id,
    rating: 5, comment: 'Really clear explanations, thanks!',
  })
  step('8b', !allowed, `an ordinary review still posts${allowed ? `: ${allowed.message}` : ''}`)

  await admin.from('bookings').delete().eq('id', booking!.id) // cascades the review
}

// 9) Display names — a slur here is MORE visible than in chat (search results, tutor
//    cards, chat headers, admin), and 0029 missed it.
{
  const { error: first } = await sb.from('users').update({ first_name: 'retard' }).eq('id', studentId)
  const { error: last } = await sb.from('users').update({ last_name: 'faggot' }).eq('id', studentId)
  const { error: major } = await sb.from('users').update({ major: 'kike studies' }).eq('id', studentId)
  step(9, !!first && !!last && !!major,
    `first_name/last_name/major rejected: ${[first, last, major].map((e) => (e ? 'blocked' : 'ACCEPTED')).join('/')}`)
  const { data: row } = await admin.from('users').select('first_name, last_name').eq('id', studentId).single()
  step('9b', row!.first_name !== 'retard' && row!.last_name !== 'faggot',
    `...and nothing was stored (name is "${row!.first_name} ${row!.last_name}")`)
  // An innocent name change still works.
  const { error: ok } = await sb.from('users').update({ first_name: 'Sam', major: 'Finance' }).eq('id', studentId)
  step('9c', !ok, `innocent name/major change still allowed${ok ? `: ${ok.message}` : ''}`)
}

// 10) bookings.location — confirm-booking inserts it from the request body as service role.
{
  const { data: tutorRow } = await admin.from('tutor_profiles').select('user_id').limit(1).single()
  const { error } = await admin.from('bookings').insert({
    student_id: studentId, tutor_id: tutorRow!.user_id, subject: 'MGT 300',
    scheduled_at: new Date(Date.now() + 3 * 864e5).toISOString(), duration_minutes: 60,
    price: 25, platform_fee: 4.38, tutor_payout_amount: 20.62, session_type: 'in_person',
    location: 'meet me you retard', status: 'confirmed', refund_status: 'not_applicable',
    stripe_payment_intent_id: 'sim_pi_filter_test',
    cancellation_deadline: new Date(Date.now() + 2 * 864e5).toISOString(),
  })
  step(10, !!error && /community rules/i.test(error.message),
    `booking location rejected: "${error?.message ?? 'ACCEPTED'}"`)
}

// 11) The list itself must not be readable by a normal user — it's an evasion roadmap.
{
  const { data } = await sb.from('blocked_terms').select('term')
  step(11, (data ?? []).length === 0, `student reading blocked_terms → ${(data ?? []).length} rows visible`)
}

// 12) ...but an admin can manage it, so the list is maintainable without a migration.
{
  const adminSb = createClient(URL, ANON, { auth: { persistSession: false } })
  await adminSb.auth.signInWithPassword({ email: 'admin@crimson.ua.edu', password: 'password123' })
  const { data } = await adminSb.from('blocked_terms').select('term')
  step(12, (data ?? []).length > 0, `admin reading blocked_terms → ${(data ?? []).length} terms`)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
