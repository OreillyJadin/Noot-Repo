// Verify the magic-link deep-link flow against the LOCAL stack, driving the real
// @noot/core auth functions (sendMagicLink + completeAuthFromUrl) — the same code
// the app runs. Reproduces what a browser does: send → read email → follow verify
// link → exchange ?code= for a session. Safe to delete after.
import { initSupabase, auth, api } from '../packages/core/src/index.ts'
import { createClient } from '@supabase/supabase-js'

const URL = 'http://127.0.0.1:54321'
const MAILPIT = 'http://127.0.0.1:54324'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
// Service role only used to delete the throwaway test user at the end. Defaults to
// the fixed local-demo key (printed by `supabase status`); override via env.
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const step = (n: number, ok: boolean, msg: string) =>
  console.log(`${n}) ${ok ? 'PASS ✅' : 'FAIL ❌'} — ${msg}`)

// The app's real client (PKCE flow, no storage = in-memory verifier).
initSupabase({ url: URL, anonKey: ANON })
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })
const email = `magic-${Date.now()}@crimson.ua.edu`
const redirectTo = 'http://localhost:8081/auth-callback'

// 1) Send the magic link (our sendMagicLink, with emailRedirectTo).
const sent = await auth.sendMagicLink(email, redirectTo)
step(1, sent.ok, sent.ok ? `magic link sent to ${email}` : `send failed: ${sent.error}`)

// 2) Pull it out of Mailpit and dig out the GoTrue verify URL.
await new Promise((r) => setTimeout(r, 800)) // let the mail land
const list = await (await fetch(`${MAILPIT}/api/v1/search?query=to:${encodeURIComponent(email)}`)).json()
const id = list.messages?.[0]?.ID
// Mailpit's JSON body is already quoted-printable-decoded (the raw MIME soft-wraps
// long links and would split the &type=/&redirect_to= off the URL).
const msg = id ? await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json() : {}
const body = `${msg.HTML ?? ''}\n${msg.Text ?? ''}`
const verifyUrl = body.match(/http:\/\/127\.0\.0\.1:54321\/auth\/v1\/verify[^"'\s\\<>]*/)?.[0]?.replace(/&amp;/g, '&')
step(2, !!verifyUrl, verifyUrl ? 'email arrived with a verify link' : 'no verify link in Mailpit')

// 3) Follow the verify link WITHOUT auto-redirect — GoTrue 302s to our redirect_to
//    with the PKCE ?code= (exactly what the browser receives).
let callbackUrl = ''
if (verifyUrl) {
  const res = await fetch(verifyUrl, { redirect: 'manual' })
  callbackUrl = res.headers.get('location') ?? ''
}
const hasCode = /[?&]code=/.test(callbackUrl)
step(3, hasCode, hasCode ? `redirected to ${callbackUrl.replace(/code=[^&]+/, 'code=…')}` : `no code (got: ${callbackUrl})`)

// 4) Exchange it for a session — our completeAuthFromUrl (the auth-callback screen's core).
const done = hasCode ? await auth.completeAuthFromUrl(callbackUrl) : { ok: false, error: 'skipped' }
step(4, done.ok, done.ok ? 'completeAuthFromUrl established a session' : `exchange failed: ${done.error}`)

// 5) The session is real: getMe returns the freshly-provisioned profile.
const me = done.ok ? await api.getMe() : null
step(5, !!me && me.email === email, me ? `getMe → ${me.email} (firstName="${me.firstName}", role=${me.activeRole})` : 'getMe returned null')

// cleanup
const uid = (await auth.getSessionUserId())
if (uid) { await admin.auth.admin.deleteUser(uid); console.log('   (cleaned up test user)') }
