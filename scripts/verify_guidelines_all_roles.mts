// Verify that every account accepts the Community Guidelines once, whatever its role, against
// the LOCAL stack: the real @noot/core reads and writes feeding the app's routing decision
// (lib/postAuthRoute.ts). Covers student-, tutor-, ambassador- and admin-only accounts that
// predate the change, role switching and becoming an ambassador after accepting, a
// GUIDELINES_VERSION bump, and that one account can't record acceptance for another.
//
// Self-contained: creates its own users (strong password) and deletes them afterwards.
// Needs: supabase start
//   pnpm dlx tsx scripts/verify_guidelines_all_roles.mts
import { createClient } from '@supabase/supabase-js'
import { initSupabase, api, auth } from '../packages/core/src/index.ts'
import { accountStateFrom, decidePostAuthRoute, lookupWithRetry } from '../apps/mobile/lib/postAuthRoute.ts'
import { GUIDELINES_VERSION } from '../apps/mobile/lib/guidelines.ts'

const URL = 'http://127.0.0.1:54321'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const PASSWORD = 'Guidelines!Verify42'

let pass = 0, fail = 0, n = 0
const step = (ok: boolean, msg: string) => {
  ok ? pass++ : fail++
  console.log(`${++n}) ${ok ? 'PASS ✅' : 'FAIL ❌'} — ${msg}`)
}

initSupabase({ url: URL, anonKey: ANON })
const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })
const tag = `guide_${Date.now()}`
const made: string[] = []

type Role = 'student' | 'tutor' | 'ambassador' | 'admin'
/** An account set up before this change: password and Terms done, guidelines never asked. */
const makeUser = async (name: string, roles: Role[], activeRole: 'student' | 'tutor' | 'ambassador') => {
  const email = `${tag}_${name}@crimson.ua.edu`
  const { data, error } = await svc.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
  if (error || !data.user) throw error ?? new Error(`createUser ${email}`)
  const id = data.user.id
  made.push(id)
  const { error: rolesError } = await svc.from('user_roles').upsert(roles.map((role) => ({ user_id: id, role })))
  if (rolesError) throw rolesError
  if (!roles.includes('student')) await svc.from('user_roles').delete().eq('user_id', id).eq('role', 'student')
  const { error: rowError } = await svc.from('users').update({
    first_name: 'Gia', last_name: 'Guide', active_role: activeRole,
    password_set_at: new Date().toISOString(),
    terms_accepted_at: new Date().toISOString(), terms_version: '2026-09-17',
    guidelines_accepted_at: null, guidelines_version: null,
  }).eq('id', id)
  if (rowError) throw rowError
  return { id, email }
}

/** What the app does after any sign-in or launch (lib/postAuth.ts): read, then decide. */
const route = async () => {
  const read = await lookupWithRetry(async () => {
    const me = await api.getMe()
    return me ? accountStateFrom(me) : null
  }, [1, 1], async () => {})
  const r = decidePostAuthRoute(read.ok ? { ok: true, account: read.value } : { ok: false })
  return r.kind === 'home' ? `home ${r.route}` : r.kind
}
const signIn = async (email: string) => {
  const res = await auth.signInWithPassword(email, PASSWORD)
  if (!res.ok) throw new Error(`sign in ${email}: ${res.error}`)
}

try {
  // ---- accounts that were exempt (or never asked) are held once, in every mode ----
  const cases: [string, Role[], 'student' | 'tutor' | 'ambassador', string][] = [
    ['student', ['student'], 'student', 'home /home'],
    ['tutor', ['tutor'], 'tutor', 'home /tutor_home'],
    ['ambassador', ['ambassador'], 'ambassador', 'home /ambassador_home'],
    ['admin', ['student', 'admin'], 'student', 'home /home'],
  ]
  for (const [name, roles, activeRole, home] of cases) {
    const u = await makeUser(name, roles, activeRole)
    await signIn(u.email)
    const before = await route()
    step(before === 'guidelines', `${/^[aeiou]/.test(name) ? 'an' : 'a'} ${name} account that never accepted is sent to the guidelines (got ${before})`)
    await api.profile.acceptGuidelines(GUIDELINES_VERSION)
    const after = await route()
    step(after === home, `after accepting, the ${name} account goes to ${home} (got ${after})`)
    await auth.signOut()
  }

  // ---- one acceptance carries over: switching modes, becoming an ambassador ----
  const dual = await makeUser('dual', ['student', 'tutor'], 'student')
  await signIn(dual.email)
  step((await route()) === 'guidelines', 'a student+tutor account is asked once')
  await api.profile.acceptGuidelines(GUIDELINES_VERSION)
  step((await route()) === 'home /home', 'accepted in student mode → student home')
  await api.profile.setActiveRole('tutor')
  const asTutor = await route()
  step(asTutor === 'home /tutor_home', `switched to tutor mode → tutor home, not asked again (got ${asTutor})`)
  await api.profile.addRole('ambassador')
  await api.profile.setActiveRole('ambassador')
  const asAmb = await route()
  step(asAmb === 'home /ambassador_home', `became an ambassador → ambassador home, not asked again (got ${asAmb})`)

  // ---- a GUIDELINES_VERSION bump asks again, once ----
  await svc.from('users').update({ guidelines_version: '2026-10-13' }).eq('id', dual.id)
  const stale = await route()
  step(stale === 'guidelines', `an acceptance of an older version asks again (got ${stale})`)
  await api.profile.acceptGuidelines(GUIDELINES_VERSION)
  const { data: row } = await svc.from('users').select('guidelines_version').eq('id', dual.id).single()
  const again = await route()
  step(row?.guidelines_version === GUIDELINES_VERSION && again === 'home /ambassador_home',
    `re-accepting records ${GUIDELINES_VERSION} and goes home (version=${row?.guidelines_version}, got ${again})`)
  await auth.signOut()

  // ---- nobody can record (or clear) acceptance for someone else ----
  const victim = await makeUser('victim', ['student'], 'student')
  const other = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error: otherSignIn } = await other.auth.signInWithPassword({ email: dual.email, password: PASSWORD })
  if (otherSignIn) throw otherSignIn
  const { data: forged, error: forgeError } = await other.from('users')
    .update({ guidelines_accepted_at: new Date().toISOString(), guidelines_version: GUIDELINES_VERSION })
    .eq('id', victim.id).select('id')
  const { data: victimRow } = await svc.from('users').select('guidelines_accepted_at').eq('id', victim.id).single()
  step(!forgeError && forged?.length === 0 && victimRow?.guidelines_accepted_at === null,
    'another account cannot record acceptance for someone else (self-only RLS)')
  await other.auth.signOut()
} catch (error) {
  step(false, `verification completed without an unexpected error: ${String(error)}`)
} finally {
  await auth.signOut().catch(() => {})
  for (const id of made) {
    const { error } = await svc.auth.admin.deleteUser(id)
    if (error) console.log(`cleanup: could not delete ${id}: ${error.message}`)
  }
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
