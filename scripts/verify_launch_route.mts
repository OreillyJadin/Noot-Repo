// Verify where a signed-in account is sent on launch (ERR-001) against the LOCAL stack: the
// real @noot/core read (api.getMe) feeding the app's routing decision (lib/postAuthRoute.ts).
// The navigation itself needs a device — this covers the data the decision runs on and that
// a failed read can't be mistaken for a new account.
//
// Needs: supabase start && node supabase/seed_demo.mjs
import { initSupabase, api, auth } from '../packages/core/src/index.ts'
import { decidePostAuthRoute, lookupWithRetry } from '../apps/mobile/lib/postAuthRoute.ts'
import { createClient } from '@supabase/supabase-js'

const URL = 'http://127.0.0.1:54321'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const TERMS_VERSION = '2026-08-11'

let pass = 0, fail = 0
const step = (n: number | string, ok: boolean, msg: string) => {
  ok ? pass++ : fail++
  console.log(`${n}) ${ok ? 'PASS ✅' : 'FAIL ❌'} — ${msg}`)
}
const noWait = async () => {}
/** What the app does: read me (with retries), then decide. */
const routeFor = async (entry: 'session' | 'signup_link') => {
  const read = await lookupWithRetry(() => api.getMe(), [1, 1], noWait)
  return decidePostAuthRoute(read.ok ? { ok: true, me: read.value } : { ok: false }, entry)
}

initSupabase({ url: URL, anonKey: ANON })
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })

// 1) Signed out: the read fails, and that is 'unavailable' — never onboarding.
{
  const session = await routeFor('session')
  const link = await routeFor('signup_link')
  step(1, session.kind === 'unavailable' && link.kind === 'unavailable',
    `a failed account read → session: ${session.kind}, sign-up link: ${link.kind} (must not be onboarding)`)
}

const signIn = await auth.signInWithPassword('student@crimson.ua.edu', 'password123')
step(2, signIn.ok, signIn.ok ? 'signed in as the demo student' : `sign-in failed: ${signIn.error}`)
const { data: row } = await admin.from('users').select('id, active_role').eq('email', 'student@crimson.ua.edu').single()
const myId = row!.id

// 3) A new sign-up: no password step yet (terms not accepted) → the link starts onboarding.
await admin.from('users').update({ terms_accepted_at: null, terms_version: null }).eq('id', myId)
{
  const me = await api.getMe()
  const link = await routeFor('signup_link')
  step(3, me?.termsAcceptedAt === null && link.kind === 'onboarding',
    `before the password step: getMe().termsAcceptedAt=${me?.termsAcceptedAt}, sign-up link → ${link.kind}`)
}

// 4) The same account on a normal launch (no link) still goes home, as it did before.
{
  const session = await routeFor('session')
  step(4, session.kind === 'home', `normal launch for an account with a name → ${session.kind}`)
}

// 5) After the real password step's write, getMe() carries the acceptance…
await api.profile.acceptTerms(TERMS_VERSION)
const after = await api.getMe()
step(5, !!after?.termsAcceptedAt, `after acceptTerms(): getMe().termsAcceptedAt=${after?.termsAcceptedAt}`)

// 6) …so the same sign-up link arriving again goes home, not back to "Create your password".
{
  const link = await routeFor('signup_link')
  step(6, link.kind === 'home' && link.route === '/home',
    `replayed sign-up link for a set-up account → ${link.kind}${link.kind === 'home' ? ` ${link.route}` : ''}`)
}

// 7) The home follows the saved mode (the reported account's is ambassador).
{
  await admin.from('user_roles').upsert({ user_id: myId, role: 'ambassador' }, { onConflict: 'user_id,role' })
  await api.profile.setActiveRole('ambassador')
  const link = await routeFor('signup_link')
  const session = await routeFor('session')
  step(7, link.kind === 'home' && link.route === '/ambassador_home' && session.kind === 'home' && session.route === '/ambassador_home',
    `ambassador mode → link: ${link.kind === 'home' ? link.route : link.kind}, launch: ${session.kind === 'home' ? session.route : session.kind}`)
  // Put the demo student back the way the seed left them.
  await api.profile.setActiveRole('student')
  await admin.from('user_roles').delete().eq('user_id', myId).eq('role', 'ambassador')
}

// 8) Signed out again: back to 'unavailable', not onboarding.
await auth.signOut()
{
  const session = await routeFor('session')
  step(8, session.kind === 'unavailable', `after sign-out a read fails → ${session.kind}`)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
