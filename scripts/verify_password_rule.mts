// Verify the password rule (ERR-014) against the LOCAL stack: the auth server itself refuses
// a password without 8+ characters, a lowercase letter, an uppercase letter, a number and a
// special character — so skipping the app's own check gets nobody a weaker one. Every
// attempt is made as a signed-in user talking to the public Auth API, not through the app.
// Also checks that the app's mirror of the rule (@noot/core passwordProblem) agrees with
// the server on every case, and that accounts with an older, weaker password still sign in.
//
// Needs: supabase start (config.toml applied — restart the stack after changing it)
//   pnpm dlx tsx scripts/verify_password_rule.mts
import { createClient } from '@supabase/supabase-js'
import { passwordProblem, PASSWORD_SPECIAL_CHARACTERS } from '../packages/core/src/auth/passwordRule.ts'

const URL = 'http://127.0.0.1:54321'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

let pass = 0, fail = 0, n = 0
const step = (ok: boolean, msg: string) => {
  ok ? pass++ : fail++
  console.log(`${++n}) ${ok ? 'PASS ✅' : 'FAIL ❌'} — ${msg}`)
}

const anon = () => createClient(URL, ANON, { auth: { persistSession: false } })
const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })
const tag = `pwrule_${Date.now()}`
const email = `${tag}@crimson.ua.edu`
const OLD = 'password123'

try {
  // An account from before the rule: the admin API is how seeds and scripts make them.
  const made = await svc.auth.admin.createUser({ email, password: OLD, email_confirm: true })
  step(!made.error, `the admin API still creates an account with an older-style password${made.error ? ` (${made.error.message})` : ''}`)

  const me = anon()
  const signIn = await me.auth.signInWithPassword({ email, password: OLD })
  step(!signIn.error, 'an account whose password predates the rule still signs in')

  // ---- passwords the server must refuse ----
  const weak: [string, string][] = [
    ['Ab1!xyz', 'only 7 characters'],
    ['abcdefg1!', 'no uppercase letter'],
    ['ABCDEFG1!', 'no lowercase letter'],
    ['Abcdefgh!', 'no number'],
    ['Abcdefg12', 'no special character'],
    ['Abcdefg1 ', 'a space as the only non-alphanumeric'],
    ['Abcdefg1é', 'an accented letter as the only non-alphanumeric'],
    ['newpassword456', 'the old 8-characters-only rule'],
  ]
  for (const [pw, why] of weak) {
    const r = await me.auth.updateUser({ password: pw })
    step(r.error !== null && r.error.code === 'weak_password', `refused: ${why}${r.error ? '' : ' — WAS ACCEPTED'}`)
    step(passwordProblem(pw) !== null, `the app's check also refuses: ${why}`)
  }
  const still = await anon().auth.signInWithPassword({ email, password: OLD })
  step(!still.error, 'after the refusals the original password is unchanged')

  // ---- passwords the server must accept ----
  const strong = ['Abcdefg1!', 'Roll-Tide2026', 'xY9#' + 'a'.repeat(40)]
  for (const pw of strong) {
    const r = await me.auth.updateUser({ password: pw })
    const back = await anon().auth.signInWithPassword({ email, password: pw })
    step(!r.error && !back.error, `accepted, and signs in: ${pw.length}-character password meeting the rule${r.error ? ` (${r.error.message})` : ''}`)
    step(passwordProblem(pw) === null, 'the app\'s check accepts it too')
  }

  // ---- every special character the app accepts, the server accepts ----
  const rejected: string[] = []
  for (const c of PASSWORD_SPECIAL_CHARACTERS) {
    const r = await me.auth.updateUser({ password: `Abcdefg1${c}${Math.random().toString(36).slice(2, 6)}` })
    if (r.error) rejected.push(c)
  }
  step(rejected.length === 0, `the server accepts each of the app's ${PASSWORD_SPECIAL_CHARACTERS.length} special characters${rejected.length ? ` — refused: ${rejected.join(' ')}` : ''}`)
} finally {
  const { data } = await svc.auth.admin.listUsers({ perPage: 1000 })
  for (const u of data?.users ?? []) if (u.email?.startsWith(tag)) await svc.auth.admin.deleteUser(u.id)
  // public.users no longer cascades from auth.users (0026), so its rows are removed too.
  await svc.from('users').delete().like('email', `${tag}%`)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
