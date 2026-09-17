// Verify Terms acceptance is recorded (APP_REVIEW_TICKETS.md T9, Guideline 1.2) against
// the LOCAL stack. The UI gate itself (a disabled Continue button) needs a device — this
// covers the column, the write path through @noot/core, and that it is self-only.
//
// Needs: supabase start && node supabase/seed_demo.mjs
import { initSupabase, api, auth } from '../packages/core/src/index.ts'
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

initSupabase({ url: URL, anonKey: ANON })
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })

const signIn = await auth.signInWithPassword('student@crimson.ua.edu', 'password123')
step(1, signIn.ok, signIn.ok ? 'signed in as the demo student' : `sign-in failed: ${signIn.error}`)

const { data: me } = await admin.from('users').select('id').eq('email', 'student@crimson.ua.edu').single()
const myId = me!.id

// Start from "never accepted", the state a brand-new sign-up is in.
await admin.from('users').update({ terms_accepted_at: null, terms_version: null }).eq('id', myId)

// 2) The columns exist and start null.
{
  const { data, error } = await admin.from('users').select('terms_accepted_at, terms_version').eq('id', myId).single()
  step(2, !error && data!.terms_accepted_at === null, `columns present and null before acceptance${error ? `: ${error.message}` : ''}`)
}

// 3) The real onboarding write path records both fields.
try {
  await api.profile.acceptTerms(TERMS_VERSION)
  const { data } = await admin.from('users').select('terms_accepted_at, terms_version').eq('id', myId).single()
  const stamped = !!data!.terms_accepted_at && data!.terms_version === TERMS_VERSION
  step(3, stamped, `acceptTerms() → accepted_at=${data!.terms_accepted_at}, version=${data!.terms_version}`)
} catch (e) {
  step(3, false, `acceptTerms threw: ${(e as Error).message}`)
}

// 4) The recorded version matches what the published terms page says it is. If someone
//    edits the terms without bumping TERMS_VERSION, the acceptance record becomes a lie.
{
  const page = await import('node:fs/promises').then((fs) =>
    fs.readFile('apps/web/app/terms/page.tsx', 'utf8'))
  const m = /updated="([^"]+)"/.exec(page)
  const updated = m?.[1] ?? ''
  const asIso = new Date(`${updated} UTC`).toISOString().slice(0, 10)
  step(4, asIso === TERMS_VERSION, `terms page says "${updated}" (${asIso}); TERMS_VERSION is ${TERMS_VERSION}`)
}

// 5) The terms page still carries the zero-tolerance and report/block language the reply
//    to App Review claims it does.
{
  const page = await import('node:fs/promises').then((fs) =>
    fs.readFile('apps/web/app/terms/page.tsx', 'utf8'))
  // JSX wraps prose across lines, so match on collapsed whitespace.
  const flat = page.replace(/\s+/g, ' ')
  const hasTolerance = /no tolerance/i.test(flat)
  const hasReport = /report a message or a user/i.test(flat)
  const hasBlock = /block a user/i.test(flat)
  const has24h = /within 24 hours/i.test(flat)
  step(5, hasTolerance && hasReport && hasBlock && has24h,
    `terms language — tolerance:${hasTolerance} report:${hasReport} block:${hasBlock} 24h:${has24h}`)
}

// 6) A user can't stamp acceptance on someone ELSE's row (RLS is self-only).
{
  const sb = createClient(URL, ANON, { auth: { persistSession: false } })
  await sb.auth.signInWithPassword({ email: 'student@crimson.ua.edu', password: 'password123' })
  const { data: other } = await admin.from('users').select('id').neq('id', myId).limit(1).single()
  await admin.from('users').update({ terms_accepted_at: null, terms_version: null }).eq('id', other!.id)
  await sb.from('users')
    .update({ terms_accepted_at: new Date().toISOString(), terms_version: 'forged' })
    .eq('id', other!.id)
  const { data: after } = await admin.from('users').select('terms_version').eq('id', other!.id).single()
  step(6, after!.terms_version === null, `forging another user's acceptance → their version is ${after!.terms_version ?? 'null'}`)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
