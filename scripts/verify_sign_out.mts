// Verify that signing out ends the session on the device (the tutor profile's "Sign out"
// goes through auth.signOut, like the student profile's) — including when the server can't
// be reached, which used to leave the account signed in. LOCAL stack, real @noot/core.
//
// Needs: supabase start && node supabase/seed_demo.mjs
//   pnpm dlx tsx scripts/verify_sign_out.mts
import { initSupabase, auth, api } from '../packages/core/src/index.ts'

const URL = 'http://127.0.0.1:54321'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

let pass = 0, fail = 0, n = 0
const step = (ok: boolean, msg: string) => {
  ok ? pass++ : fail++
  console.log(`${++n}) ${ok ? 'PASS ✅' : 'FAIL ❌'} — ${msg}`)
}

initSupabase({ url: URL, anonKey: ANON })
const signIn = async () => {
  const r = await auth.signInWithPassword('sara@crimson.ua.edu', 'password123')
  if (!r.ok) throw new Error(`sign in: ${r.error}`)
}
const signedOuts: string[] = []
const off = auth.onAuthChange((change) => { if (change === 'signed_out') signedOuts.push(change) })

// ---- online ----
await signIn()
step(!!(await auth.getSessionUserId()) && !!(await api.getMe()), 'the demo tutor signs in')
await auth.signOut()
const gone = await api.getMe().then(() => false, () => true)
step((await auth.getSessionUserId()) === null && gone && signedOuts.length === 1,
  'signing out ends the session, and the app is told so')

// ---- the server can't be reached ----
await signIn()
const realFetch = globalThis.fetch
let attempts = 0
globalThis.fetch = (async () => { attempts++; throw new TypeError('Network request failed') }) as typeof fetch
try {
  await auth.signOut()
} finally {
  globalThis.fetch = realFetch
}
step(attempts > 0 && (await auth.getSessionUserId()) === null && signedOuts.length === 2,
  `with the network down the device is still signed out (the server was tried ${attempts} time${attempts === 1 ? '' : 's'} first)`)

// ---- nothing to sign out of ----
const twice = await auth.signOut().then(() => true, () => false)
step(twice && (await auth.getSessionUserId()) === null, 'signing out again (a double tap) is harmless')

off()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
