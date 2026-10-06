// Verify ERR-026 (migration 0049) against the LOCAL stack: ordinary bad language is BLOCKED
// in published text (bio, review, name) and, in chat, SENT but flagged into the admin
// moderation queue. The zero-tolerance list from 0029 is still blocked in chat. Writes are
// made as the real student and tutor through the public API wherever a user could make
// them, so what is proven is the database's behaviour, not the app's.
//
// Needs: supabase start (0049 applied) + node supabase/seed_demo.mjs
//   pnpm dlx tsx scripts/verify_bad_language.mts
import { createClient } from '@supabase/supabase-js'
import { initSupabase, api, auth } from '../packages/core/src/index.ts'

const URL = 'http://127.0.0.1:54321'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

let pass = 0, fail = 0, n = 0
const step = (ok: boolean, msg: string) => {
  ok ? pass++ : fail++
  console.log(`${++n}) ${ok ? 'PASS ✅' : 'FAIL ❌'} — ${msg}`)
}
const RULES = /community rules/i

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })
const as = async (email: string) => {
  const c = createClient(URL, ANON, { auth: { persistSession: false } })
  const { data, error } = await c.auth.signInWithPassword({ email, password: 'password123' })
  if (error) throw new Error(`sign-in as ${email} failed: ${error.message}`)
  return { c, id: data.user!.id }
}

const student = await as('student@crimson.ua.edu')
const tutor = await as('sara@crimson.ua.edu')
const tag = `badlang_${Date.now()}`
const SWEAR = `this problem set is fucking impossible ${tag}`
const CLEAN = `Can we go over the class assignment on Scunthorpe? ${tag}`
const messageIds: string[] = []
let bioBefore: string | null = null
const startedAt = new Date().toISOString()
const flagsFor = async (messageId: string) =>
  (await svc.from('content_reports').select('*').eq('target_message_id', messageId)).data ?? []

initSupabase({ url: URL, anonKey: ANON })
await auth.signInWithPassword('student@crimson.ua.edu', 'password123')
const { data: convo } = await svc.from('conversations')
  .upsert({ student_id: student.id, tutor_id: tutor.id }, { onConflict: 'student_id,tutor_id' })
  .select('id').single()

try {
  // ---- chat: sent, and flagged ----
  let sworn: { id: string } | null = null
  try { sworn = await api.chat.sendMessage(convo!.id, SWEAR) } catch (e) { console.log(`   (${(e as Error).message})`) }
  step(!!sworn, 'a chat message with swearing is SENT, through the app\'s own send path')
  if (sworn) messageIds.push(sworn.id)
  const flags = sworn ? await flagsFor(sworn.id) : []
  step(flags.length === 1 && flags[0].auto_flagged === true && flags[0].reporter_id === null && flags[0].status === 'open',
    `it is flagged once into the moderation queue, with no reporter (${flags.length} row(s))`)
  step(flags.length === 1 && !/fucking/i.test(flags[0].detail ?? ''), 'the flag does not store the matched word')

  const clean = await api.chat.sendMessage(convo!.id, CLEAN)
  messageIds.push(clean.id)
  step((await flagsFor(clean.id)).length === 0, 'an ordinary message is not flagged ("class assignment", "Scunthorpe")')

  let slurErr = ''
  try { const m = await api.chat.sendMessage(convo!.id, 'you are a complete retard'); messageIds.push(m.id) } catch (e) { slurErr = (e as Error).message }
  step(RULES.test(slurErr), `the zero-tolerance list is still BLOCKED in chat: "${slurErr || 'ACCEPTED'}"`)

  // A direct insert, skipping the app, is flagged just the same.
  const direct = await student.c.from('messages')
    .insert({ conversation_id: convo!.id, sender_id: student.id, content: `oh shit ${tag}` }).select('id').single()
  if (direct.data) messageIds.push(direct.data.id)
  step(!direct.error && (await flagsFor(direct.data!.id)).length === 0 && (await flagsFor(sworn!.id)).length === 1,
    'a direct client insert goes through the same trigger (sent; covered by the open flag)')

  // A second sweary message from the same person in the same chat does not add a card.
  const again = await api.chat.sendMessage(convo!.id, `and this one is shit too ${tag}`)
  messageIds.push(again.id)
  step((await flagsFor(again.id)).length === 0 && (await flagsFor(direct.data!.id)).length === 0,
    'while a flag is open, more swearing from the same sender in the same chat adds no new flag')
  // The other person swearing is a different sender, so it does.
  const reply = await tutor.c.from('messages')
    .insert({ conversation_id: convo!.id, sender_id: tutor.id, content: `no shit ${tag}` }).select('id').single()
  if (reply.data) messageIds.push(reply.data.id)
  step(!reply.error && (await flagsFor(reply.data!.id)).length === 1, 'the other person in the chat is flagged separately')
  const accepted: string[] = []
  for (const w of ['fuckers', 'motherfucking', 'shithead', 'Bitchy', 'CUNTS', 'pussies']) {
    const r = await student.c.from('users').update({ major: `${w} studies` }).eq('id', student.id)
    if (!RULES.test(r.error?.message ?? '')) accepted.push(w)
  }
  step(accepted.length === 0, `plurals and other forms of listed words are BLOCKED in a major${accepted.length ? ` — ACCEPTED: ${accepted.join(', ')}` : ''}`)

  // Changing the text again does not queue the same message twice.
  if (sworn) await svc.from('messages').update({ content: `still bullshit ${tag}` }).eq('id', sworn.id)
  step(sworn !== null && (await flagsFor(sworn.id)).length === 1, 'editing a flagged message does not create a second open flag')

  // ---- what a user can and cannot do with flags ----
  const seen = await student.c.from('content_reports').select('id').in('target_message_id', messageIds)
  step(!seen.error && (seen.data ?? []).length === 0, `the sender cannot see that they were flagged (${(seen.data ?? []).length} rows visible)`)
  const seenByOther = await tutor.c.from('content_reports').select('id').in('target_message_id', messageIds)
  step(!seenByOther.error && (seenByOther.data ?? []).length === 0, 'nor can the other person in the chat')

  const forged = await tutor.c.from('content_reports').insert({
    reporter_id: null, auto_flagged: true, target_kind: 'message', target_message_id: clean.id, reason: 'inappropriate',
  })
  step(/row-level security/i.test(forged.error?.message ?? ''), `a user cannot forge an automatic flag: "${forged.error?.message ?? 'ACCEPTED'}"`)
  const halfForged = await tutor.c.from('content_reports').insert({
    reporter_id: tutor.id, auto_flagged: true, target_kind: 'message', target_message_id: clean.id, reason: 'inappropriate',
  })
  step(/content_reports_reporter_or_auto/.test(halfForged.error?.message ?? ''), `nor mark their own report as automatic: "${halfForged.error?.message ?? 'ACCEPTED'}"`)
  const real = await tutor.c.from('content_reports').insert({
    reporter_id: tutor.id, target_kind: 'message', target_message_id: sworn?.id ?? clean.id, reason: 'harassment',
  })
  step(real.error === null, `an ordinary report by a person still works, alongside the flag${real.error ? `: ${real.error.message}` : ''}`)

  const signedOut = createClient(URL, ANON, { auth: { persistSession: false } })
  for (const fn of ['contains_blocked_term', 'contains_profanity', 'contains_zero_tolerance_term']) {
    for (const [who, c] of [['a signed-in user', student.c], ['a signed-out caller', signedOut]] as const) {
      const r = await c.rpc(fn, { p_text: 'shit retard' })
      step(/permission denied/i.test(r.error?.message ?? '') && r.data == null,
        `${who} cannot call ${fn}() to probe the list: "${r.error?.message ?? `returned ${JSON.stringify(r.data)}`}"`)
    }
  }
  const lastName = await student.c.from('users').update({ last_name: 'Shithead' }).eq('id', student.id)
  step(RULES.test(lastName.error?.message ?? ''), 'writes still reach the filter with the list locked away (a last name is BLOCKED)')

  // ---- the admin queue ----
  await auth.signOut()
  await auth.signInWithPassword('admin@crimson.ua.edu', 'password123')
  const queue = await api.admin.listReports()
  const mine = queue.find((r) => r.autoFlagged && r.targetMessageId === sworn?.id)
  step(!!mine && mine.reporterId === null && /bullshit/.test(mine.messageContent ?? '') && !!mine.messageSenderName,
    `an admin sees the flag in the queue, with the message and who sent it${mine ? ` ("${mine.messageSenderName}")` : ''}`)
  if (mine) {
    await api.admin.resolveReport(mine.id, 'dismissed')
    const after = (await flagsFor(sworn!.id)).find((f) => f.auto_flagged)
    step(after?.status === 'dismissed', 'an admin can dismiss it')
  } else step(false, 'an admin can dismiss it (no flag to dismiss)')

  // The admin team room is not policed.
  const { data: room } = await svc.from('conversations').select('id').eq('kind', 'admin').single()
  const { data: adminRow } = await svc.from('users').select('id').eq('email', 'admin@crimson.ua.edu').single()
  const inRoom = await svc.from('messages')
    .insert({ conversation_id: room!.id, sender_id: adminRow!.id, content: `what a shitty report ${tag}` }).select('id').single()
  if (inRoom.data) messageIds.push(inRoom.data.id)
  step(!inRoom.error && (await flagsFor(inRoom.data!.id)).length === 0, 'a message in the admin team room is not flagged')

  // ---- published text: blocked ----
  bioBefore = (await svc.from('tutor_profiles').select('bio').eq('user_id', tutor.id).single()).data!.bio
  const before = bioBefore
  const bio = await tutor.c.from('tutor_profiles').update({ bio: 'I make accounting less shitty.' }).eq('user_id', tutor.id)
  const bioNow = (await svc.from('tutor_profiles').select('bio').eq('user_id', tutor.id).single()).data!.bio
  step(RULES.test(bio.error?.message ?? '') && bioNow === before, `a tutor bio with swearing is BLOCKED: "${bio.error?.message ?? 'ACCEPTED'}"`)
  const okBio = await tutor.c.from('tutor_profiles').update({ bio: 'I assess each class assignment with you. Cockburn Hall tutor.' }).eq('user_id', tutor.id)
  step(okBio.error === null, `an innocent bio still saves ("assess", "class", "Cockburn")${okBio.error ? `: ${okBio.error.message}` : ''}`)

  const name = await student.c.from('users').update({ first_name: 'Bitch' }).eq('id', student.id)
  const major = await student.c.from('users').update({ major: 'Bullshit Studies' }).eq('id', student.id)
  step(RULES.test(name.error?.message ?? '') && RULES.test(major.error?.message ?? ''),
    `a name and a major with swearing are BLOCKED: ${[name, major].map((r) => (r.error ? 'blocked' : 'ACCEPTED')).join('/')}`)

  const { data: booking, error: bErr } = await svc.from('bookings').insert({
    student_id: student.id, tutor_id: tutor.id, subject: 'MGT 300',
    scheduled_at: new Date(Date.now() - 7 * 864e5).toISOString(), duration_minutes: 60,
    price: 25, platform_fee: 4.38, tutor_payout_amount: 20.62, session_type: 'in_person',
    status: 'completed', refund_status: 'not_applicable', stripe_payment_intent_id: `sim_pi_${tag}`,
    cancellation_deadline: new Date(Date.now() - 8 * 864e5).toISOString(),
  }).select('id').single()
  if (bErr) throw new Error(`could not create the review's booking: ${bErr.message}`)
  const review = await svc.from('reviews').insert({
    booking_id: booking!.id, reviewer_id: student.id, subject_user_id: tutor.id, rating: 1, comment: 'what a fucking waste',
  })
  step(RULES.test(review.error?.message ?? ''), `a review comment with swearing is BLOCKED: "${review.error?.message ?? 'ACCEPTED'}"`)
  const okReview = await svc.from('reviews').insert({
    booking_id: booking!.id, reviewer_id: student.id, subject_user_id: tutor.id, rating: 5, comment: 'Really clear explanations, thanks!',
  })
  step(okReview.error === null, `an ordinary review still posts${okReview.error ? `: ${okReview.error.message}` : ''}`)
  await svc.from('bookings').delete().eq('id', booking!.id) // cascades the review
} finally {
  if (bioBefore !== null) await svc.from('tutor_profiles').update({ bio: bioBefore }).eq('user_id', tutor.id)
  // Each message and the booking notified the other person; those rows carry the test text.
  await svc.from('notifications').delete().in('user_id', [student.id, tutor.id]).gte('created_at', startedAt)
  await svc.from('content_reports').delete().in('target_message_id', messageIds)
  await svc.from('messages').delete().in('id', messageIds)
  await svc.from('bookings').delete().eq('stripe_payment_intent_id', `sim_pi_${tag}`)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
