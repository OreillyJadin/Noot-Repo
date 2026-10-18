// Verify "Become an ambassador" saves the mode (ISSUES_2026-10-03 §3.1) against the LOCAL
// stack: the real @noot/core writes the Profile button makes (addRole, then setActiveRole via
// useRoleSwitch.switchTo with the role passed as just granted), then the launch-routing
// decision a cold start makes from api.getMe. Creates its own throwaway account.
//
// Needs: supabase start
//   pnpm dlx tsx scripts/verify_become_ambassador.mts
import { initSupabase, api, auth } from '../packages/core/src/index.ts'
import { decidePostAuthRoute } from '../apps/mobile/lib/postAuthRoute.ts'
import { isPreviewSwitch } from '../apps/mobile/lib/roleTabs.ts'
import { createClient } from '@supabase/supabase-js'

const URL = 'http://127.0.0.1:54321'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

let pass = 0, fail = 0, n = 0
const step = (ok: boolean, msg: string) => {
  ok ? pass++ : fail++
  console.log(`${++n}) ${ok ? 'PASS ✅' : 'FAIL ❌'} — ${msg}`)
}

initSupabase({ url: URL, anonKey: ANON })
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })
const email = `become-amb-${Date.now()}@crimson.ua.edu`
const password = 'Amb-verify-2026!x'
let uid: string | undefined

const launch = async () => {
  const me = await api.getMe()
  if (!me) return 'no account'
  const r = decidePostAuthRoute({
    ok: true,
    account: {
      hasPassword: me.passwordSetAt != null,
      acceptedTerms: me.termsAcceptedAt != null,
      acceptedGuidelines: me.guidelinesAcceptedAt != null,
      activeRole: me.activeRole,
    },
  })
  return r.kind === 'home' ? r.route : r.kind
}

try {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  uid = data.user!.id
  const now = new Date().toISOString()
  await admin.from('users').update({ password_set_at: now, terms_accepted_at: now, guidelines_accepted_at: now }).eq('id', uid)
  const signIn = await auth.signInWithPassword(email, password)
  step(signIn.ok, 'the throwaway student signs in')

  const before = await api.getMe()
  const staleRoles = (before?.roles ?? []) as ('student' | 'tutor' | 'ambassador')[]
  step(before?.activeRole === 'student' && !staleRoles.includes('ambassador'), `starts as a student without the ambassador role (roles: ${staleRoles.join(',')})`)
  step(await launch() === '/home', 'a cold launch opens student home')

  // The bug: the roles the screen loaded before the tap don't include ambassador yet.
  step(isPreviewSwitch(staleRoles, 'ambassador') === true, 'without the grant, the stale roles make it a preview (the old behaviour)')
  step(isPreviewSwitch(staleRoles, 'ambassador', ['ambassador']) === false, 'with the role passed as just granted, the switch is saved')

  await api.profile.addRole('ambassador')
  await api.profile.setActiveRole('ambassador')
  const after = await api.getMe()
  step(after?.roles.includes('ambassador') === true && after?.activeRole === 'ambassador', `users.active_role is saved as ambassador (now ${after?.activeRole})`)
  step(await launch() === '/ambassador_home', 'a cold launch now opens ambassador home')

  let rejected = false
  try { await api.profile.setActiveRole('tutor') } catch { rejected = true }
  const still = await api.getMe()
  step(rejected && still?.activeRole === 'ambassador', 'a role the account does not hold (tutor) still cannot be saved as active_role')
} catch (e) {
  step(false, `unexpected error: ${(e as Error).message}`)
} finally {
  await auth.signOut().catch(() => undefined)
  if (uid) await admin.auth.admin.deleteUser(uid).catch(() => undefined)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
