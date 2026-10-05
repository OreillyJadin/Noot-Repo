// Verify admin user search (ERR-021, migration 0046) against the LOCAL stack through
// @noot/core — the same call the User management screen makes — signed in as a real admin
// and as a plain student.
//
// Needs: supabase start (migrations applied) and the demo seed (node supabase/seed_demo.mjs)
//   pnpm dlx tsx scripts/verify_admin_user_search.mts
import { createClient } from '@supabase/supabase-js'
import { initSupabase, auth, api } from '../packages/core/src/index.ts'

const URL = 'http://127.0.0.1:54321'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

let pass = 0, fail = 0, n = 0
const step = (ok: boolean, msg: string) => {
  ok ? pass++ : fail++
  console.log(`${++n}) ${ok ? 'PASS ✅' : 'FAIL ❌'} — ${msg}`)
}

initSupabase({ url: URL, anonKey: ANON })
const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })
const tag = `find${Date.now()}`
const made_ids: string[] = []
const signIn = async (email: string) => {
  const r = await auth.signInWithPassword(email, 'password123')
  if (!r.ok) throw new Error(`sign in as ${email}: ${r.error}`)
}
// A throwaway account with a name only this run uses, so searches for it are exact.
const make = async (name: string, first: string, last: string) => {
  const email = `${tag}_${name}@crimson.ua.edu`
  const made = await svc.auth.admin.createUser({
    email, password: 'password123', email_confirm: true, user_metadata: { first_name: first, last_name: last },
  })
  if (made.error) throw made.error
  made_ids.push(made.data.user!.id)
  return { id: made.data.user!.id, email }
}

try {
  const student = await make('stu', 'Zed', `${tag}son`)
  const tutor = await make('tut', 'Yara', `${tag}son`)
  const banned = await make('ban', 'Xavi', `${tag}son`)
  const gone = await make('gone', 'Wren', `${tag}son`)
  const wild = await make('wild', `100%${tag}`, `under_${tag}`)
  for (const [uid, role] of [[tutor.id, 'tutor'], [banned.id, 'ambassador']] as const) {
    const { error } = await svc.from('user_roles').insert({ user_id: uid, role })
    if (error) throw error
  }
  const ban = await svc.from('users').update({ status: 'banned' }).eq('id', banned.id)
  if (ban.error) throw ban.error
  // What account deletion leaves behind (functions/delete-account, step 3).
  const del = await svc.from('users').update({
    email: `deleted+${gone.id}@removed.invalid`, first_name: 'Deleted', last_name: 'account',
    deleted_at: new Date().toISOString(),
  }).eq('id', gone.id)
  if (del.error) throw del.error

  // ---- who may list ----
  await signIn(student.email)
  const asStudent = await api.admin.listUsers().then(() => null, (e) => e as { code?: string; message?: string })
  step(asStudent?.code === '42501', `a student is refused the account list (${asStudent?.message ?? 'was NOT refused'})`)
  await auth.signOut()
  const asNobody = await api.admin.listUsers().then(() => null, (e) => e as { code?: string; message?: string })
  step(asNobody?.code === '42501', `so is someone who is not signed in (${asNobody?.message ?? 'was NOT refused'})`)

  // ---- as an admin ----
  await signIn('admin@crimson.ua.edu')
  const { count: everyone } = await svc.from('users').select('id', { count: 'exact', head: true })
  const all = await api.admin.listUsers({ limit: 100 })
  step(all.total === everyone, `no filter counts every account (${all.total} of ${everyone})`)

  const family = await api.admin.listUsers({ search: `${tag}son` })
  const ids = (list: { users: { id: string }[] }) => list.users.map((u) => u.id).sort().join()
  step(family.total === 3 && ids(family) === [student.id, tutor.id, banned.id].sort().join(),
    `searching a last name finds the ${family.total} live accounts with it`)

  const byEmail = await api.admin.listUsers({ search: `${tag}_TUT@crimson` })
  step(byEmail.total === 1 && byEmail.users[0]?.id === tutor.id, 'searching part of an email finds that account, whatever its capitalisation')

  const full = await api.admin.listUsers({ search: `  yara ${tag}son ` })
  step(full.total === 1 && full.users[0]?.id === tutor.id, 'searching a full name finds that person')

  // ---- account type ----
  const tutors = await api.admin.listUsers({ search: `${tag}son`, role: 'tutor' })
  step(tutors.total === 1 && tutors.users[0]?.id === tutor.id && tutors.users[0]?.roles.includes('student'),
    'the tutor filter lists only tutors, and still shows all of their roles')
  const students = await api.admin.listUsers({ search: `${tag}son`, role: 'student' })
  step(students.total === 1 && students.users[0]?.id === student.id, 'the student filter lists accounts that are only students')

  // ---- status ----
  const bans = await api.admin.listUsers({ search: `${tag}son`, status: 'banned' })
  step(bans.total === 1 && bans.users[0]?.id === banned.id, 'the banned filter lists the banned account')

  const deleted = await api.admin.listUsers({ status: 'deleted', limit: 100 })
  const goneRow = deleted.users.find((u) => u.id === gone.id)
  step(!!goneRow && goneRow.status === 'deleted' && !!goneRow.deletedAt && deleted.users.every((u) => u.status === 'deleted'),
    'a deleted account is listed as deleted, not active')
  const active = await api.admin.listUsers({ status: 'active', limit: 100 })
  step(active.users.every((u) => u.status === 'active' && !u.deletedAt), 'and the active filter does not include deleted accounts')
  const ghost = await api.admin.listUsers({ search: 'removed.invalid' })
  const ghost2 = await api.admin.listUsers({ search: 'Deleted account' })
  step(ghost.total === 0 && ghost2.total === 0, "a deleted account's placeholder name and email are not searchable")

  // ---- the search is text, not a pattern ----
  const pct = await api.admin.listUsers({ search: `100%${tag}` })
  const under = await api.admin.listUsers({ search: `under_${tag}` })
  // As patterns these would both match "Zed <tag>son"; as text they match nothing.
  const anyChar = await api.admin.listUsers({ search: `${tag}s_n` })
  const anyRun = await api.admin.listUsers({ search: `zed%${tag}` })
  step(pct.total === 1 && pct.users[0]?.id === wild.id && under.total === 1 && anyChar.total === 0 && anyRun.total === 0,
    '% and _ in a search mean themselves; they are not wildcards')

  // ---- paging ----
  const p1 = await api.admin.listUsers({ search: `${tag}son`, limit: 2, offset: 0 })
  const p2 = await api.admin.listUsers({ search: `${tag}son`, limit: 2, offset: 2 })
  const seen = new Set([...p1.users, ...p2.users].map((u) => u.id))
  step(p1.users.length === 2 && p2.users.length === 1 && p1.total === 3 && p2.total === 3 && seen.size === 3,
    'pages do not overlap, and each reports the full count')
  const tiny = await api.admin.listUsers({ search: `${tag}son`, limit: 0, offset: -5 })
  step(tiny.users.length === 1 && tiny.total === 3, 'a nonsense page size or offset is clamped rather than failing')

  const badRole = await api.admin.listUsers({ role: 'owner' as never }).then(() => null, (e) => e as { message?: string })
  step(!!badRole, `an unknown account type is refused (${badRole?.message ?? 'was NOT refused'})`)
} finally {
  await auth.signOut().catch(() => {})
  // By id: the "deleted" account's email no longer carries the tag. public.users no longer
  // cascades from auth.users (0026), so both halves are removed.
  for (const id of made_ids) await svc.auth.admin.deleteUser(id)
  if (made_ids.length) await svc.from('users').delete().in('id', made_ids)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
