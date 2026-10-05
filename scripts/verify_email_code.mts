// Verify typing the emailed code instead of tapping the link (ERR-023) against the LOCAL
// stack, driving the real @noot/core auth functions and reading the real emails from Mailpit:
// sign-up and password reset both finish with the code, and a wrong, reused or someone
// else's code does not.
//
// Needs: supabase start (migrations applied)
//   pnpm dlx tsx scripts/verify_email_code.mts
import { createClient } from '@supabase/supabase-js'
import { initSupabase, auth, api } from '../packages/core/src/index.ts'

const URL = 'http://127.0.0.1:54321'
const MAILPIT = 'http://127.0.0.1:54324'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

let pass = 0, fail = 0, n = 0
const step = (ok: boolean, msg: string) => {
  ok ? pass++ : fail++
  console.log(`${++n}) ${ok ? 'PASS ✅' : 'FAIL ❌'} — ${msg}`)
}

// The app's real client (PKCE flow, in-memory session).
initSupabase({ url: URL, anonKey: ANON })
const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })
const tag = `code_${Date.now()}`
const redirectTo = 'noot://auth-callback'

// The newest email to this address sent at or after `since`: its code (the templates print
// it as {{ .Token }}) and whether it also carries the link. Polls until the mail lands.
const emailed = async (to: string, since: number) => {
  for (let i = 0; i < 20; i++) {
    const list = await (await fetch(`${MAILPIT}/api/v1/search?query=to:${encodeURIComponent(to)}`)).json()
    const fresh = ((list.messages ?? []) as { ID: string; Created: string }[])
      .filter((m) => Date.parse(m.Created) >= since)
      .sort((x, y) => Date.parse(y.Created) - Date.parse(x.Created))[0]
    if (fresh) {
      const msg = await (await fetch(`${MAILPIT}/api/v1/message/${fresh.ID}`)).json()
      const body = `${msg.Text ?? ''}\n${msg.HTML ?? ''}`
      return { code: body.match(/\b\d{6,8}\b/)?.[0] ?? null, hasLink: /\/auth\/v1\/verify\?/.test(body) }
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  return { code: null, hasLink: false }
}
const wrong = (code: string) => String((Number(code) + 1) % 10 ** code.length).padStart(code.length, '0')

try {
  // ---- sign-up ----
  const email = `${tag}@crimson.ua.edu`
  let since = Date.now()
  const sent = await auth.sendSignupVerification(email, 'Cody', 'Entry', redirectTo)
  const mail = await emailed(email, since)
  step(sent.ok && !!mail.code && mail.hasLink, `the sign-up email carries both a link and a code${sent.ok ? '' : `: ${sent.error}`}`)
  const code = mail.code ?? ''

  const short = await auth.verifyEmailCode(email, '123', 'signup')
  step(!short.ok && short.error === auth.BAD_EMAIL_CODE, 'something too short to be a code is refused with the same readable message')

  const bad = await auth.verifyEmailCode(email, wrong(code), 'signup')
  step(!bad.ok && bad.error === auth.BAD_EMAIL_CODE && !(await auth.getSessionUserId()),
    `a wrong code is refused with a readable message and signs nobody in: "${bad.error}"`)

  // Someone else's address with this code: the code only works for the address it was sent to.
  const other = `${tag}_other@crimson.ua.edu`
  const otherMade = await svc.auth.admin.createUser({ email: other, password: 'password123', email_confirm: true })
  if (otherMade.error) throw otherMade.error
  const stolen = await auth.verifyEmailCode(other, code, 'signup')
  step(!stolen.ok && !(await auth.getSessionUserId()), 'the code does not sign in a different address')

  // Typed the way the email shows it to a person: spaced, with stray whitespace.
  const typed = ` ${code.slice(0, 3)} ${code.slice(3)} `
  const good = await auth.verifyEmailCode(` ${email.toUpperCase()} `, typed, 'signup')
  const me = good.ok ? await api.getMe() : null
  step(good.ok && me?.email === email && me?.firstName === 'Cody',
    `the right code signs the new account in (${me?.email ?? good.error}, firstName="${me?.firstName}")`)
  step(!!me && me.passwordSetAt == null, 'and it has no password yet, so the app sends it on to create one')

  await auth.signOut()
  const again = await auth.verifyEmailCode(email, code, 'signup')
  step(!again.ok && !(await auth.getSessionUserId()), 'a code that was used cannot be used again')

  // ---- password reset ----
  const made = await svc.auth.admin.createUser({ email: `${tag}_reset@crimson.ua.edu`, password: 'password123', email_confirm: true })
  if (made.error) throw made.error
  const resetEmail = made.data.user!.email!
  since = Date.now()
  const reset = await auth.sendPasswordReset(resetEmail, `${redirectTo}?flow=recovery`)
  const resetMail = await emailed(resetEmail, since)
  step(reset.ok && !!resetMail.code && resetMail.hasLink, `the reset email carries both a link and a code${reset.ok ? '' : `: ${reset.error}`}`)

  const recovered = await auth.verifyEmailCode(resetEmail, resetMail.code ?? '', 'recovery')
  step(recovered.ok && (await auth.getSessionUserId()) === made.data.user!.id,
    `the reset code signs that account in, ready for set-password${recovered.ok ? '' : `: ${recovered.error}`}`)

  const pw = await auth.setPassword('password456')
  await auth.signOut()
  const back = await auth.signInWithPassword(resetEmail, 'password456')
  step(pw.ok && back.ok, 'the new password is saved and signs in')

  // A suspended account's code does not get it in, and it is told why rather than "wrong code".
  const benched = await svc.auth.admin.createUser({ email: `${tag}_benched@crimson.ua.edu`, password: 'password123', email_confirm: true })
  if (benched.error) throw benched.error
  await auth.signOut()
  since = Date.now()
  await auth.sendPasswordReset(benched.data.user!.email!, `${redirectTo}?flow=recovery`)
  const benchedCode = (await emailed(benched.data.user!.email!, since)).code ?? ''
  await svc.auth.admin.updateUserById(benched.data.user!.id, { ban_duration: '24h' })
  const refused = await auth.verifyEmailCode(benched.data.user!.email!, benchedCode, 'recovery')
  step(!!benchedCode && !refused.ok && refused.error !== auth.BAD_EMAIL_CODE && !(await auth.getSessionUserId()),
    `a suspended account's code does not sign it in, and it is not told the code is wrong: "${refused.error}"`)
} finally {
  await auth.signOut().catch(() => {})
  const { data } = await svc.auth.admin.listUsers({ perPage: 1000 })
  for (const u of data?.users ?? []) if (u.email?.startsWith(tag)) await svc.auth.admin.deleteUser(u.id)
  // public.users no longer cascades from auth.users (0026), so its rows are removed too.
  await svc.from('users').delete().like('email', `${tag}%`)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
