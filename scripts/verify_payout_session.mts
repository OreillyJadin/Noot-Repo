// Verify the in-app payout setup session (ERR-018) — the { mode: 'session' } path of the
// connect-onboarding-link Edge Function, which hands the app a client secret for Stripe's
// embedded onboarding form instead of a hosted link.
//
// Part A runs against the LOCAL function runtime. With no Stripe key there (the default),
// the function answers "simulated"; what is proven is the contract: who may call it, the
// shape of both modes, and that the link mode older builds use is unchanged.
// Part B talks to Stripe TEST MODE directly, with the same request the function makes, to
// prove Stripe accepts it for an Express account at the function's API version. It needs
// STRIPE_SECRET_KEY=sk_test_... in this script's environment and is skipped without it.
// It opens one short-lived session on an Express account already in the sandbox.
//
// Needs: supabase start + node supabase/seed_demo.mjs
//   pnpm dlx tsx scripts/verify_payout_session.mts
import { createClient } from '@supabase/supabase-js'
import { initSupabase, api, auth } from '../packages/core/src/index.ts'

const URL = 'http://127.0.0.1:54321'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const FN = `${URL}/functions/v1/connect-onboarding-link`

let pass = 0, fail = 0, n = 0
const step = (ok: boolean, msg: string) => {
  ok ? pass++ : fail++
  console.log(`${++n}) ${ok ? 'PASS ✅' : 'FAIL ❌'} — ${msg}`)
}

const call = async (token: string | null, body?: unknown) => {
  const res = await fetch(FN, {
    method: 'POST',
    headers: {
      apikey: ANON,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: res.status, body: await res.json().catch(() => ({})) as Record<string, unknown> }
}

// ===== Part A — the function's contract =====
const anonOnly = await call(ANON, { mode: 'session' })
const none = await call(null, { mode: 'session' })
step(anonOnly.status === 401 && none.status === 401 && !('clientSecret' in anonOnly.body),
  `signed out, a session is refused (${none.status}/${anonOnly.status})`)

const sb = createClient(URL, ANON, { auth: { persistSession: false } })
const { data: sess, error: signInErr } = await sb.auth.signInWithPassword({ email: 'sara@crimson.ua.edu', password: 'password123' })
if (signInErr) throw new Error(`tutor sign-in failed: ${signInErr.message}`)
const token = sess.session!.access_token

const session = await call(token, { mode: 'session' })
const live = typeof session.body.clientSecret === 'string'
step(session.status === 200 && 'clientSecret' in session.body &&
  (live ? /_secret_/.test(session.body.clientSecret as string) && session.body.simulated === false
        : session.body.clientSecret === null && session.body.simulated === true),
  live ? 'signed in as a tutor, session mode returns a client secret'
       : 'signed in as a tutor, session mode answers "simulated" with no secret (no Stripe key in the local runtime)')
step(!live || !('url' in session.body), 'a session answer carries no hosted link')

const link = await call(token)
step(link.status === 200 && 'url' in link.body && (link.body.clientSecret ?? null) === null,
  `with no body — what builds up to 9 send — it still answers in link mode (url: ${JSON.stringify(link.body.url)})`)
const switched: string[] = []
for (const mode of ['link', 'SESSION', '', 7, null, { a: 1 }]) {
  const r = await call(token, { mode })
  if (r.status !== 200 || (r.body.clientSecret ?? null) !== null) switched.push(JSON.stringify(mode))
}
// Only meaningful with a Stripe key in the runtime; simulated answers look alike in both modes.
step(switched.length === 0, `only the exact mode "session" asks for a session${switched.length ? ` — also switched: ${switched.join(', ')}` : live ? '' : ' (weak here: simulated answers are identical)'}`)

initSupabase({ url: URL, anonKey: ANON })
await auth.signInWithPassword('sara@crimson.ua.edu', 'password123')
const viaCore = await api.connect.accountSession()
step(live ? typeof viaCore.clientSecret === 'string' : viaCore.clientSecret === null && viaCore.simulated === true,
  `@noot/core api.connect.accountSession() maps it (${live ? 'secret' : 'null secret, simulated'}) — null is what sends the app to the hosted page`)

// ===== Part B — Stripe accepts the request (test mode only) =====
const KEY = process.env.STRIPE_SECRET_KEY ?? ''
if (!KEY.startsWith('sk_test_')) {
  console.log('—) SKIPPED — Part B needs STRIPE_SECRET_KEY=sk_test_... (the request to Stripe itself is NOT verified)')
} else {
  const stripe = async (method: string, path: string, body?: Record<string, string>) => {
    const res = await fetch(`https://api.stripe.com/v1/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${KEY}`,
        'Stripe-Version': '2024-06-20', // the version the function pins
        ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      ...(body ? { body: new URLSearchParams(body) } : {}),
    })
    return await res.json() as Record<string, any>
  }
  // An Express account that already exists in the sandbox. Not created here: this sandbox
  // refuses POST /v1/accounts ("Stripe no longer recommends Accounts v1 for new Connect
  // integrations"), which is the same call the function makes for a tutor's first setup.
  const list = await stripe('GET', 'accounts?limit=100')
  const acct = ((list.data ?? []) as Record<string, any>[]).find((a) => a.type === 'express')
  if (!acct) {
    console.log(`—) SKIPPED — no Express account in the test sandbox to open a session on (${(list.data ?? []).length} account(s) listed). The request to Stripe is NOT verified.`)
  } else {
    const s = await stripe('POST', 'account_sessions', {
      account: acct.id, 'components[account_onboarding][enabled]': 'true',
    })
    step(typeof s.client_secret === 'string' && s.account === acct.id,
      `Stripe issues an onboarding session for an existing Express account${s.error ? `: ${s.error.message}` : ''}`)
    const enabled = Object.entries(s.components ?? {}).filter(([, v]) => (v as { enabled?: boolean })?.enabled).map(([k]) => k)
    step(enabled.length === 1 && enabled[0] === 'account_onboarding',
      `the session enables onboarding and nothing else (${enabled.join(', ') || 'none'})`)
  }
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
