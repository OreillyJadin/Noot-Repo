// Verify tutor interview scheduling (ERR-005, migration 0042) against the LOCAL stack, as
// four people: an admin, the applicant, a plain student (the non-owner), and signed out.
// Drives the real @noot/core calls the screens use. Checks who may schedule, who may read,
// that nobody can write the table directly, and that the tutor is told.
//
// Needs: supabase start && node supabase/seed_demo.mjs
//   pnpm dlx tsx scripts/verify_interviews.mts
import { createClient } from '@supabase/supabase-js'
import { initSupabase, getSupabase, api, auth } from '../packages/core/src/index.ts'
import { nextInterviewSlots } from '../apps/mobile/lib/interviewSlots.ts'

const URL = 'http://127.0.0.1:54321'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const PASSWORD = 'password123'

let pass = 0, fail = 0
const step = (n: number, ok: boolean, msg: string) => {
  ok ? pass++ : fail++
  console.log(`${n}) ${ok ? 'PASS ✅' : 'FAIL ❌'} — ${msg}`)
}
/** Run a call that should be refused; returns the refusal message, or null if it went through. */
const refused = async (fn: () => Promise<unknown>): Promise<string | null> => {
  try { await fn(); return null } catch (e) { return (e as { message?: string }).message ?? String(e) }
}
const as = async (email: string) => {
  await auth.signOut()
  const r = await auth.signInWithPassword(email, PASSWORD)
  if (!r.ok) throw new Error(`sign-in as ${email} failed: ${r.error}`)
}

initSupabase({ url: URL, anonKey: ANON })
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })
const email = `interview-${Date.now()}@crimson.ua.edu`
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString()
let tutorId: string | undefined
let n = 1

try {
  // A throwaway applicant with a SUBMITTED application and some weekly availability.
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
  tutorId = created.data.user!.id
  await admin.from('users').update({ first_name: 'Ivy', last_name: 'Applicant', password_set_at: new Date().toISOString() }).eq('id', tutorId)
  await admin.from('tutor_profiles').upsert({ user_id: tutorId, submitted_at: new Date().toISOString() }, { onConflict: 'user_id' })
  await admin.from('tutor_availability').insert([
    { tutor_id: tutorId, day_of_week: 2, start_time: '15:00', end_time: '17:00' },
    { tutor_id: tutorId, day_of_week: 4, start_time: '09:30', end_time: '11:00' },
  ])
  const { data: student } = await admin.from('users').select('id').eq('email', 'student@crimson.ua.edu').single()

  // --- signed out ---
  await auth.signOut()
  {
    const why = await refused(() => api.admin.scheduleInterview(tutorId!, inDays(3)))
    step(n++, !!why, `DENY signed out scheduling → ${why ?? 'WENT THROUGH'}`)
  }

  // --- a plain student (non-owner, non-admin) ---
  await as('student@crimson.ua.edu')
  {
    const why = await refused(() => api.admin.scheduleInterview(tutorId!, inDays(3), 'student-made'))
    step(n++, !!why && /admin/i.test(why), `DENY a student scheduling someone’s interview → ${why ?? 'WENT THROUGH'}`)
  }
  {
    const { error } = await getSupabase().from('tutor_interviews').insert({ tutor_id: tutorId, scheduled_at: inDays(3) })
    const { count } = await admin.from('tutor_interviews').select('id', { count: 'exact', head: true }).eq('tutor_id', tutorId)
    step(n++, !!error && count === 0, `DENY a student inserting a row directly → ${error?.message ?? 'INSERTED'}`)
  }

  // --- the applicant ---
  await as(email)
  {
    const why = await refused(() => api.admin.scheduleInterview(tutorId!, inDays(3), 'self-made'))
    step(n++, !!why && /admin/i.test(why), `DENY the tutor scheduling their own interview → ${why ?? 'WENT THROUGH'}`)
  }
  {
    const mine = await api.profile.getMyInterview()
    step(n++, mine === null, 'the tutor has no interview yet')
  }

  // --- the admin ---
  await as('admin@crimson.ua.edu')
  {
    const why = await refused(() => api.admin.scheduleInterview(tutorId!, inDays(-1)))
    step(n++, !!why && /future/i.test(why), `DENY a time in the past → ${why ?? 'WENT THROUGH'}`)
  }
  {
    const why = await refused(() => api.admin.scheduleInterview(tutorId!, inDays(90)))
    step(n++, !!why && /60 days/i.test(why), `DENY a time more than 60 days out → ${why ?? 'WENT THROUGH'}`)
  }
  {
    const why = await refused(() => api.admin.scheduleInterview(student!.id, inDays(3)))
    step(n++, !!why && /application/i.test(why), `DENY an interview for someone who never applied → ${why ?? 'WENT THROUGH'}`)
  }

  // The times offered come from the applicant's own availability and are all ahead.
  const windows = await api.tutors.getAvailability(tutorId)
  const offered = nextInterviewSlots(windows, new Date())
  step(n++, offered.length > 0 && offered.every((at) => at.getTime() > Date.now() && [2, 4].includes(at.getDay())),
    `${offered.length} times offered from their availability, all on their Tue/Thu windows`)

  const first = offered[0]!.toISOString()
  const saved = await api.admin.scheduleInterview(tutorId, first, '  Gorgas Library lobby  ')
  {
    const set = await api.admin.listInterviews([tutorId])
    step(n++, set[tutorId]?.id === saved.id && set[tutorId]?.details === 'Gorgas Library lobby',
      `ALLOW admin schedules → ${set[tutorId]?.scheduledAt} · "${set[tutorId]?.details}"`)
  }
  {
    const { data: notes } = await admin.from('notifications').select('title, body').eq('user_id', tutorId).order('created_at', { ascending: false })
    step(n++, notes?.[0]?.title === 'Your noot interview is scheduled' && /Gorgas Library lobby/.test(notes[0].body) && / CT/.test(notes[0].body),
      `the tutor is notified → "${notes?.[0]?.title}: ${notes?.[0]?.body}"`)
  }

  // Moving it leaves exactly one live interview.
  const second = offered[1]!.toISOString()
  await api.admin.scheduleInterview(tutorId, second, 'Zoom')
  {
    const { data: rows } = await admin.from('tutor_interviews').select('scheduled_at, cancelled_at').eq('tutor_id', tutorId)
    const live = (rows ?? []).filter((r) => !r.cancelled_at)
    step(n++, rows?.length === 2 && live.length === 1 && new Date(live[0]!.scheduled_at).getTime() === new Date(second).getTime(),
      `rescheduling keeps one live interview (${rows?.length} rows, ${live.length} live)`)
  }

  // --- the applicant again: can read theirs, cannot change it ---
  await as(email)
  {
    const mine = await api.profile.getMyInterview()
    step(n++, !!mine && new Date(mine.scheduledAt).getTime() === new Date(second).getTime() && mine.details === 'Zoom',
      `the tutor sees their interview → ${mine?.scheduledAt} · "${mine?.details}"`)
  }
  {
    await getSupabase().from('tutor_interviews').update({ scheduled_at: inDays(30), details: 'moved by tutor' }).eq('tutor_id', tutorId)
    await getSupabase().from('tutor_interviews').delete().eq('tutor_id', tutorId)
    const { data: rows } = await admin.from('tutor_interviews').select('details, cancelled_at').eq('tutor_id', tutorId)
    const live = (rows ?? []).filter((r) => !r.cancelled_at)
    step(n++, rows?.length === 2 && live.length === 1 && live[0]!.details === 'Zoom', 'DENY the tutor editing or deleting their interview → unchanged')
  }
  {
    const why = await refused(() => api.admin.cancelInterview(tutorId!))
    step(n++, !!why && /admin/i.test(why), `DENY the tutor cancelling through the admin call → ${why ?? 'WENT THROUGH'}`)
  }

  // --- the student: cannot see anyone's interview ---
  await as('student@crimson.ua.edu')
  {
    const seen = await api.admin.listInterviews([tutorId])
    const { data: raw } = await getSupabase().from('tutor_interviews').select('id')
    step(n++, Object.keys(seen).length === 0 && (raw ?? []).length === 0, `DENY a student reading interviews → ${(raw ?? []).length} rows visible`)
  }

  // --- admin cancels ---
  await as('admin@crimson.ua.edu')
  await api.admin.cancelInterview(tutorId)
  {
    const set = await api.admin.listInterviews([tutorId])
    const { data: notes } = await admin.from('notifications').select('title').eq('user_id', tutorId).order('created_at', { ascending: false })
    step(n++, !set[tutorId] && notes?.[0]?.title === 'Your noot interview was cancelled',
      `ALLOW admin cancels → no live interview; tutor told "${notes?.[0]?.title}"`)
  }
  await as(email)
  step(n++, (await api.profile.getMyInterview()) === null, 'the tutor no longer has an interview')
} finally {
  await auth.signOut()
  if (tutorId) {
    await admin.auth.admin.deleteUser(tutorId)
    // The app row no longer cascades from auth.users (0026); its own FKs cascade from here.
    await admin.from('users').delete().eq('id', tutorId)
  }
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
