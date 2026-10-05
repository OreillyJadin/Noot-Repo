// Verify where a signed-in account is sent on launch (ERR-001) against the LOCAL stack: the
// real @noot/core read (api.getMe, carrying users.password_set_at — 0041) feeding the app's
// routing decision (lib/postAuthRoute.ts), on a real passwordless sign-up that then creates
// its password — plus that the stamp is the server's and can't be forged for someone else. The navigation itself needs a device. "A failed read" is exercised here as
// "no session" (the reads throw) — a network failure takes the same branch.
//
// Needs: supabase start && node supabase/seed_demo.mjs
import { initSupabase, api, auth } from '../packages/core/src/index.ts'
import { decidePostAuthRoute, lookupWithRetry } from '../apps/mobile/lib/postAuthRoute.ts'
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
const noWait = async () => {}
/** What the app does (lib/postAuth.ts): read the account with retries, then decide. */
const route = async () => {
  const read = await lookupWithRetry(async () => {
    const me = await api.getMe()
    return me
      ? { hasPassword: me.passwordSetAt != null, acceptedTerms: me.termsAcceptedAt != null, activeRole: me.activeRole }
      : null
  }, [1, 1], noWait)
  return decidePostAuthRoute(read.ok ? { ok: true, account: read.value } : { ok: false })
}
const show = (r: Awaited<ReturnType<typeof route>>) => (r.kind === 'home' ? `home ${r.route}` : r.kind)

initSupabase({ url: URL, anonKey: ANON })
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })
/** A second, separate signed-in user: the plain demo student, as "someone else". */
const other = createClient(URL, ANON, { auth: { persistSession: false } })
const stampOf = async (id: string) =>
  (await admin.from('users').select('password_set_at').eq('id', id).single()).data?.password_set_at ?? null
const email = `launch-${Date.now()}@crimson.ua.edu`
let newId: string | undefined

try {
  // 1) No session: the reads fail, and that is 'unavailable' — never onboarding.
  {
    const r = await route()
    step(1, r.kind === 'unavailable', `a failed account read → ${show(r)} (must not be onboarding)`)
  }

  // 3) A real passwordless sign-up (the emailed link, as the app's sign-up sends it).
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  const tokenHash = link.data.properties?.hashed_token
  newId = link.data.user?.id
  // GoTrue issues a 'signup' token for an address it has not seen, 'magiclink' otherwise.
  const linkUrl = `noot://auth-callback?token_hash=${tokenHash}&type=${link.data.properties?.verification_type}`
  const done = await auth.completeAuthFromUrl(linkUrl)
  step(2, done.ok && !!newId, done.ok ? `new account ${email} signed in from its link` : `link failed: ${done.error ?? link.error?.message}`)
  if (!done.ok) throw new Error('cannot continue without the new account\'s session')

  // 3) No password chosen yet → nothing is stamped, and the account starts onboarding.
  {
    const stamp = await stampOf(newId!)
    const r = await route()
    step(3, stamp === null && r.kind === 'onboarding', `before the password step: password_set_at=${stamp} → ${show(r)}`)
  }

  // 4) Another signed-in student can't stamp it for them (RLS: your own row only).
  {
    const s = await other.auth.signInWithPassword({ email: 'student@crimson.ua.edu', password: 'password123' })
    await other.from('users').update({ password_set_at: new Date().toISOString() }).eq('id', newId!)
    const stamp = await stampOf(newId!)
    step(4, !s.error && stamp === null, `a different student writing this account's password_set_at → ${stamp === null ? 'no effect' : 'FORGED'}`)
    await other.auth.signOut()
  }

  // 5) The real password step, then the same link arriving again (session already live):
  //    it reports success without exchanging — and the account is past onboarding. It has
  //    not accepted the Terms yet, so it is held there rather than sent home.
  {
    const set = await auth.setPassword('a-new-password-1')
    const replay = await auth.completeAuthFromUrl(linkUrl)
    const stamp = await stampOf(newId!)
    const r = await route()
    step(5, set.ok && replay.ok && !!stamp && r.kind === 'terms',
      `after setPassword, link replayed: password_set_at=${stamp} (server-stamped) → ${show(r)} (must not be onboarding, nor home)`)
  }

  // 5b) Accepting the Terms — what onboarding does next, on the same screen — opens the door.
  {
    await api.profile.acceptTerms('verify_launch_route')
    const r = await route()
    step('5b', r.kind === 'home' && r.route === '/home', `after accepting the Terms → ${show(r)}`)
  }

  // 6) A relaunch with only the stored session (no link) lands the same way.
  {
    const r = await route()
    step(6, r.kind === 'home', `plain relaunch → ${show(r)}`)
  }
  await auth.signOut()

  // 7) An existing account that signs in with its password goes home. (The seed gives demo
  //    accounts an accepted Terms record; an older local database may predate that.)
  {
    await admin.from('users').update({ terms_accepted_at: new Date().toISOString(), terms_version: 'seed' })
      .eq('email', 'student@crimson.ua.edu').is('terms_accepted_at', null)
    const signIn = await auth.signInWithPassword('student@crimson.ua.edu', 'password123')
    const r = await route()
    step(7, signIn.ok && r.kind === 'home' && r.route === '/home', `demo student after password sign-in → ${show(r)}`)
  }

  // 8) Home follows the saved mode (the reported account's is ambassador).
  {
    const { data: me } = await admin.from('users').select('id').eq('email', 'student@crimson.ua.edu').single()
    await admin.from('user_roles').upsert({ user_id: me!.id, role: 'ambassador' }, { onConflict: 'user_id,role' })
    try {
      await api.profile.setActiveRole('ambassador')
      const r = await route()
      step(8, r.kind === 'home' && r.route === '/ambassador_home', `ambassador mode → ${show(r)}`)
    } finally {
      // Put the demo student back the way the seed left them.
      await api.profile.setActiveRole('student').catch(() => {})
      await admin.from('user_roles').delete().eq('user_id', me!.id).eq('role', 'ambassador')
    }
  }

  // 9) Signed out again: 'unavailable', not onboarding.
  await auth.signOut()
  {
    const r = await route()
    step(9, r.kind === 'unavailable', `after sign-out → ${show(r)}`)
  }
} finally {
  // The app row no longer cascades from auth.users (0026), so remove both.
  if (newId) {
    await admin.auth.admin.deleteUser(newId)
    await admin.from('users').delete().eq('id', newId)
  }
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
