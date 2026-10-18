// Verify the "forced sign-out" half of STU-07 against the LOCAL stack: when the server refuses
// to refresh a session (the account was banned, or deleted elsewhere), the real @noot/core
// reports 'signed_out' and the device holds no session — the event lib/SignedOutGuard.tsx
// listens for to clear the back stack. Also checks the app's route allowlist
// (lib/signedOutRoutes.ts) protects every screen in apps/mobile/app except the public ones.
//
// Needs: supabase start. Creates and removes its own accounts.
//   pnpm dlx tsx scripts/verify_forced_sign_out.mts
import { readdirSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { initSupabase, getSupabase, auth } from '../packages/core/src/index.ts'
import { needsSignedOutRedirect, SIGNED_OUT_ROUTES } from '../apps/mobile/lib/signedOutRoutes.ts'

const URL = 'http://127.0.0.1:54321'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
  ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

let pass = 0, fail = 0, n = 0
const step = (ok: boolean, msg: string) => {
  ok ? pass++ : fail++
  console.log(`${++n}) ${ok ? 'PASS ✅' : 'FAIL ❌'} — ${msg}`)
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
initSupabase({ url: URL, anonKey: ANON })
const signedOuts: number[] = []
const off = auth.onAuthChange((change) => { if (change === 'signed_out') signedOuts.push(Date.now()) })

const PASSWORD = 'Forced-Out-9!'
const created: string[] = []
async function freshAccount(tag: string): Promise<string> {
  const email = `forced.${tag}.${Date.now()}@crimson.ua.edu`
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
  if (error || !data.user) throw new Error(`create ${tag}: ${error?.message}`)
  created.push(data.user.id)
  const r = await auth.signInWithPassword(email, PASSWORD)
  if (!r.ok) throw new Error(`sign in ${tag}: ${r.error}`)
  return data.user.id
}
// What supabase-js does once the access token has run out: ask for a new one. supabase-js keeps
// the session after a refused refresh while the access token is still valid, so the clock is
// moved past its expiry (local tokens last an hour) for the call.
async function refreshAfterExpiry() {
  const realNow = Date.now
  Date.now = () => realNow() + 2 * 60 * 60 * 1000
  try {
    await getSupabase().auth.refreshSession().catch(() => undefined)
  } finally {
    Date.now = realNow
  }
}
const settle = () => new Promise((r) => setTimeout(r, 300))

try {
  // ---- banned ----
  const banned = await freshAccount('banned')
  step((await auth.getSessionUserId()) === banned, 'a fresh account signs in')
  await admin.auth.admin.updateUserById(banned, { ban_duration: '24h' })
  const before = signedOuts.length
  await refreshAfterExpiry(); await settle()
  step(signedOuts.length === before + 1 && (await auth.getSessionUserId()) === null,
    "banned: the refused refresh drops the session and the app is told 'signed_out'")

  // ---- deleted elsewhere ----
  const deleted = await freshAccount('deleted')
  step((await auth.getSessionUserId()) === deleted, 'a second account signs in')
  await admin.auth.admin.deleteUser(deleted)
  created.splice(created.indexOf(deleted), 1)
  const before2 = signedOuts.length
  await refreshAfterExpiry(); await settle()
  step(signedOuts.length === before2 + 1 && (await auth.getSessionUserId()) === null,
    "deleted: the refused refresh drops the session and the app is told 'signed_out'")
} finally {
  off()
  for (const id of created) await admin.auth.admin.deleteUser(id).catch(() => undefined)
}

// ---- every app screen but the public ones needs a session ----
const screens = readdirSync(new globalThis.URL('../apps/mobile/app', import.meta.url))
  .filter((f) => f.endsWith('.tsx') && !f.startsWith('_') && !f.startsWith('+'))
  .map((f) => f.replace(/\.tsx$/, ''))
const pathFor = (s: string) => (s === 'index' ? '/' : `/${s}`)
const open = screens.filter((s) => !needsSignedOutRedirect(pathFor(s), false))
const expected = SIGNED_OUT_ROUTES.map((r) => (r === '' ? 'index' : r)).sort()
step(JSON.stringify(open.sort()) === JSON.stringify(expected),
  `of ${screens.length} screens only the public ones open without a session: ${open.join(', ')}`)
step(screens.every((s) => !needsSignedOutRedirect(pathFor(s), true)), 'with a session no screen is redirected')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
