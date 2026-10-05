// Verify that an account cannot use the app, or post a chat message, without having accepted
// the Terms of Use — in particular the route that used to skip it: abandon onboarding, then
// Forgot password. LOCAL stack; the real @noot/core calls and the app's own routing decision.
//
// Needs: supabase start (migrations applied) && node supabase/seed_demo.mjs
//   pnpm dlx tsx scripts/verify_terms_gate.mts
import { createClient } from '@supabase/supabase-js'
import { initSupabase, auth, api } from '../packages/core/src/index.ts'
import { decidePostAuthRoute, lookupWithRetry } from '../apps/mobile/lib/postAuthRoute.ts'

const URL = 'http://127.0.0.1:54321'
const MAILPIT = 'http://127.0.0.1:54324'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

let pass = 0, fail = 0, n = 0
const step = (ok: boolean, msg: string) => {
  ok ? pass++ : fail++
  console.log(`${++n}) ${ok ? 'PASS ✅' : 'FAIL ❌'} — ${msg}`)
}

initSupabase({ url: URL, anonKey: ANON })
const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })
const tag = `terms_${Date.now()}`
const made: string[] = []
/** What the app does after any sign-in or launch (lib/postAuth.ts): read, then decide. */
const route = async () => {
  const read = await lookupWithRetry(async () => {
    const me = await api.getMe()
    return me
      ? { hasPassword: me.passwordSetAt != null, acceptedTerms: me.termsAcceptedAt != null, activeRole: me.activeRole }
      : null
  }, [1, 1], async () => {})
  const r = decidePostAuthRoute(read.ok ? { ok: true, account: read.value } : { ok: false })
  return r.kind === 'home' ? `home ${r.route}` : r.kind
}
// The newest emailed link to this address, as the deep link the app would be opened with.
const emailedLink = async (to: string, since: number) => {
  for (let i = 0; i < 20; i++) {
    const list = await (await fetch(`${MAILPIT}/api/v1/search?query=to:${encodeURIComponent(to)}`)).json()
    const fresh = ((list.messages ?? []) as { ID: string; Created: string }[])
      .filter((m) => Date.parse(m.Created) >= since)
      .sort((x, y) => Date.parse(y.Created) - Date.parse(x.Created))[0]
    if (fresh) {
      const msg = await (await fetch(`${MAILPIT}/api/v1/message/${fresh.ID}`)).json()
      const verify = `${msg.HTML ?? ''}\n${msg.Text ?? ''}`.match(/http:\/\/127\.0\.0\.1:54321\/auth\/v1\/verify[^"'\s\\<>]*/)?.[0]?.replace(/&amp;/g, '&')
      if (!verify) return null
      return (await fetch(verify, { redirect: 'manual' })).headers.get('location')
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  return null
}
const { data: tutor } = await svc.from('users').select('id').eq('email', 'sara@crimson.ua.edu').single()
const tutorId = tutor!.id as string
/** A conversation with the demo tutor for this student, made by the server as a booking would. */
const conversationFor = async (studentId: string) => {
  const { data, error } = await svc.from('conversations').insert({ student_id: studentId, tutor_id: tutorId }).select('id').single()
  if (error) throw error
  return data.id as string
}
const send = async (client: ReturnType<typeof createClient>, conversationId: string, senderId: string, content: string) =>
  (await client.from('messages').insert({ conversation_id: conversationId, sender_id: senderId, content })).error

try {
  // ---- the route that skipped the Terms: abandon onboarding, then Forgot password ----
  const email = `${tag}@crimson.ua.edu`
  let since = Date.now()
  const sent = await auth.sendSignupVerification(email, 'Terry', 'Gate', 'http://localhost:8081/auth-callback')
  const signupLink = await emailedLink(email, since)
  const verified = signupLink ? await auth.completeAuthFromUrl(signupLink) : { ok: false, error: 'no link' }
  const uid = await auth.getSessionUserId()
  if (uid) made.push(uid)
  step(sent.ok && verified.ok && (await route()) === 'onboarding',
    `a new account verifies its email and is sent to onboarding${verified.ok ? '' : `: ${verified.error}`}`)

  // …and leaves before creating a password or accepting anything.
  await auth.signOut()
  await new Promise((r) => setTimeout(r, 1200)) // the local stack's per-address send interval
  since = Date.now()
  const reset = await auth.sendPasswordReset(email, 'http://localhost:8081/auth-callback?flow=recovery')
  const resetLink = await emailedLink(email, since)
  const recovered = resetLink ? await auth.completeAuthFromUrl(resetLink) : { ok: false, error: 'no link' }
  const pw = recovered.ok ? await auth.setPassword('a-reset-password-1') : { ok: false }
  step(reset.ok && recovered.ok && pw.ok, `it comes back through Forgot password and sets one${recovered.ok ? '' : `: ${reset.error ?? recovered.error}`}`)
  if (!pw.ok) throw new Error('cannot continue without the reset session')

  const me = await api.getMe()
  const held = await route()
  step(!!me?.passwordSetAt && me.termsAcceptedAt === null && held === 'terms',
    `it now has a password and no accepted Terms → the app sends it to "${held}", not a home`)

  // ---- the server, for someone who skips the app ----
  const mine = createClient(URL, ANON, { auth: { persistSession: false } })
  await mine.auth.signInWithPassword({ email, password: 'a-reset-password-1' })
  const conversationId = await conversationFor(uid!)
  const refused = await send(mine, conversationId, uid!, 'hello before accepting')
  step(refused?.code === '42501' && /Terms of Use/.test(refused.message),
    `it cannot send a chat message straight through the API: "${refused?.message}"`)

  // ---- accepting opens both ----
  await api.profile.acceptTerms('verify_terms_gate')
  const after = await route()
  const allowed = await send(mine, conversationId, uid!, 'hello after accepting')
  step(after === 'home /home' && allowed === null, `after accepting: the app opens "${after}" and the message is sent${allowed ? ` (${allowed.message})` : ''}`)
  await auth.signOut()

  // ---- a second new account, to try getting round the rule ----
  const oldEmail = `${tag}_old@crimson.ua.edu`
  const old = await svc.auth.admin.createUser({ email: oldEmail, password: 'password123', email_confirm: true })
  if (old.error) throw old.error
  made.push(old.data.user!.id)
  const oldClient = createClient(URL, ANON, { auth: { persistSession: false } })
  await oldClient.auth.signInWithPassword({ email: oldEmail, password: 'password123' })
  const oldConversation = await conversationFor(old.data.user!.id)
  // A new account cannot make itself "old": created_at on its own row is not what is read.
  await oldClient.from('users').update({ created_at: '2020-01-01T00:00:00Z' }).eq('id', old.data.user!.id)
  const dodge = await send(oldClient, oldConversation, old.data.user!.id, 'backdated my own row')
  step(dodge?.code === '42501', 'a new account cannot dodge the rule by backdating its own profile row')

  // ---- the server's own writes are not blocked ----
  const onBehalf = await send(svc, oldConversation, old.data.user!.id, 'a booking note, written by the server')
  step(onBehalf === null, `a message the server writes on the account's behalf (a booking note) still goes through${onBehalf ? `: ${onBehalf.message}` : ''}`)

  // ---- nobody can accept for someone else ----
  await oldClient.from('users').update({ terms_accepted_at: new Date().toISOString(), terms_version: 'forged' }).eq('id', uid!)
  const { data: victim } = await svc.from('users').select('terms_version').eq('id', uid!).single()
  step(victim?.terms_version === 'verify_terms_gate', "one account cannot write another's acceptance")
} finally {
  await auth.signOut().catch(() => {})
  for (const id of made) await svc.auth.admin.deleteUser(id)
  // public.users no longer cascades from auth.users (0026); conversations and messages cascade from it.
  if (made.length) await svc.from('users').delete().in('id', made)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
