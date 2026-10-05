// Verify the campus email gate (ERR-022) against the LOCAL stack: an account can only be
// created with an approved campus address (migration 0003), and can't be moved to a
// non-campus address afterwards (0044). Every attempt is made the way an outsider could make it — a
// plain anon client talking to the public Auth API, not through the app.
//
// Needs: supabase start (migrations applied)
//   pnpm dlx tsx scripts/verify_campus_gate.mts
import { createClient } from '@supabase/supabase-js'
import { initSupabase, auth } from '../packages/core/src/index.ts'
import { NOT_A_CAMPUS_EMAIL } from '../packages/core/src/auth/index.ts'

const URL = 'http://127.0.0.1:54321'
const MAILPIT = 'http://127.0.0.1:54324'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

let pass = 0, fail = 0, n = 0
const step = (ok: boolean, msg: string) => {
  ok ? pass++ : fail++
  console.log(`${++n}) ${ok ? 'PASS ✅' : 'FAIL ❌'} — ${msg}`)
}

const anon = () => createClient(URL, ANON, { auth: { persistSession: false } })
const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })
const tag = `gate_${Date.now()}`
const exists = async (email: string) => {
  const { data } = await svc.from('users').select('id').eq('email', email.toLowerCase()).maybeSingle()
  return data !== null
}

// The code in the newest email to this address (the templates print it as {{ .Token }}).
const emailedCode = async (to: string) => {
  const list = await (await fetch(`${MAILPIT}/api/v1/search?query=to:${encodeURIComponent(to)}`)).json()
  const id = list.messages?.[0]?.ID
  const msg = id ? await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json() : {}
  return `${msg.Text ?? ''}\n${msg.HTML ?? ''}`.match(/\b\d{6,8}\b/)?.[0] ?? null
}

try {
  // ---- creating an account ----
  const outsiders = [`${tag}@gmail.com`, `${tag}@harvard.edu`, `${tag}@crimson.ua.edu.evil.com`, `${tag}@notcrimson.ua.edu`]
  for (const email of outsiders) {
    const otp = await anon().auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
    const pw = await anon().auth.signUp({ email, password: 'password123' })
    step(!!otp.error && !!pw.error && !(await exists(email)),
      `${email.split('@')[1]}: emailed-code sign-up and password sign-up both refused, no account created`)
  }

  const admin = await svc.auth.admin.createUser({ email: `${tag}_admin@gmail.com`, password: 'password123', email_confirm: true })
  step(!!admin.error, 'even the service role cannot create a non-campus account (the gate is in the database)')

  const campus = `${tag}@CRIMSON.UA.EDU`
  const good = await anon().auth.signUp({ email: campus, password: 'password123' })
  step(!good.error && (await exists(campus)), 'a campus address signs up, whatever its capitalisation')

  // ---- what the app tells them ----
  initSupabase({ url: URL, anonKey: ANON })
  const told = await auth.sendSignupVerification(`${tag}_app@gmail.com`, 'Out', 'Sider')
  step(!told.ok && told.error === NOT_A_CAMPUS_EMAIL && !(await exists(`${tag}_app@gmail.com`)),
    `the app refuses a non-campus address with a readable message: "${told.error}"`)
  const sent = await auth.sendSignupVerification(`${tag}_app@crimson.ua.edu`, 'In', 'Sider')
  step(sent.ok, `the app still sends a campus address its sign-up email${sent.ok ? '' : `: ${sent.error}`}`)

  // ---- changing the address afterwards (0044) ----
  const email = `${tag}_move@crimson.ua.edu`
  const made = await svc.auth.admin.createUser({ email, password: 'password123', email_confirm: true })
  if (made.error) throw made.error
  const uid = made.data.user!.id
  const me = anon()
  await me.auth.signInWithPassword({ email, password: 'password123' })

  const move = await me.auth.updateUser({ email: `${tag}_move@gmail.com` })
  const { data: afterMove } = await svc.auth.admin.getUserById(uid)
  step(!!move.error && afterMove.user?.email === email && !afterMove.user?.new_email,
    'a signed-in student cannot request a change to a non-campus address; nothing is left pending')

  const forced = await svc.auth.admin.updateUserById(uid, { email: `${tag}_move@gmail.com`, email_confirm: true })
  const { data: afterForce } = await svc.auth.admin.getUserById(uid)
  step(!!forced.error && afterForce.user?.email === email, 'nor can the address be set directly, even by the service role')

  const moved = `${tag}_moved@ua.edu`
  const toCampus = await me.auth.updateUser({ email: moved })
  step(!toCampus.error, `a change to another campus address is still accepted${toCampus.error ? `: ${toCampus.error.message}` : ''}`)

  // Confirm that change with the emailed codes, so the Auth server's own confirm step (which
  // writes the new address into email) runs through the gate too.
  await new Promise((r) => setTimeout(r, 1000)) // let the mail land
  for (const [to, type] of [[email, 'email_change'], [moved, 'email_change']] as const) {
    const code = await emailedCode(to)
    if (code) await me.auth.verifyOtp({ email: to, token: code, type })
  }
  const { data: afterConfirm } = await svc.auth.admin.getUserById(uid)
  step(afterConfirm.user?.email === moved, `confirming it moves the account to the new campus address (now ${afterConfirm.user?.email})`)

  // The gate only looks at email changes: everything else on the account still works.
  const pw = await me.auth.updateUser({ password: 'password456' })
  const back = await anon().auth.signInWithPassword({ email: moved, password: 'password456' })
  step(!pw.error && !back.error, 'changing the password and signing in are unaffected')
} finally {
  const { data } = await svc.auth.admin.listUsers({ perPage: 1000 })
  for (const u of data?.users ?? []) if (u.email?.startsWith(tag)) await svc.auth.admin.deleteUser(u.id)
  // public.users no longer cascades from auth.users (0026), so its rows are removed too.
  await svc.from('users').delete().like('email', `${tag}%`)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
