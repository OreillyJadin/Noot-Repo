// Verify migration 0050 against the LOCAL stack: SECURITY DEFINER functions are callable
// only by the callers that need them, and check_invite_code is rate-limited per caller.
//
// Needs: supabase start && node supabase/seed_demo.mjs
//   pnpm dlx tsx scripts/verify_definer_lockdown.mts
import { createClient } from '@supabase/supabase-js'

const URL = 'http://127.0.0.1:54321'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

let pass = 0, fail = 0
const step = (n: number | string, ok: boolean, msg: string) => {
  ok ? pass++ : fail++
  console.log(`${n}) ${ok ? 'PASS ✅' : 'FAIL ❌'} — ${msg}`)
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })
const anon = createClient(URL, ANON, { auth: { persistSession: false } })

const { data: sara } = await admin.from('users').select('id').eq('email', 'sara@crimson.ua.edu').single()
const { data: student } = await admin.from('users').select('id').eq('email', 'student@crimson.ua.edu').single()
if (!sara || !student) throw new Error('seeded users not found — run node supabase/seed_demo.mjs')

/** Postgres "insufficient privilege" — the refusal this migration is meant to produce. */
const DENIED = '42501'

// rls_auto_enable exists in production but no migration creates it, so it is absent here.
// Probe with the service key: PGRST202 ("not found") means it isn't installed locally.
const probe = await admin.rpc('rls_auto_enable' as never)
const hasRlsAuto = !(probe.error && (probe.error as { code?: string }).code === 'PGRST202')
if (!hasRlsAuto) {
  console.log('note: public.rls_auto_enable() is absent on the local stack — skipping it in checks 1–2')
}

// Trigger functions: callable by nobody over the API. rls_auto_enable joins the list only
// when it exists locally.
const triggerFns: string[] = [
  'handle_new_user', 'enforce_active_role', 'notify_on_booking', 'notify_on_message',
  'on_ambassador_approved', 'on_ambassador_role_added', 'set_updated_at',
  ...(hasRlsAuto ? ['rls_auto_enable'] : []),
]
// Other locked-down functions, with dummy args of the right types.
const lockedFns: [string, Record<string, unknown>][] = [
  ['is_admin', {}],
  ['is_approved_tutor', { uid: crypto.randomUUID() }],
  ['is_blocked_between', { a: student!.id, b: sara!.id }],
  ['is_chat_attachment_participant', { object_name: 'x/dummy.png' }],
  ['is_conversation_participant', { cid: crypto.randomUUID() }],
  ['create_my_ambassador_profile', {}],
  ['sign_tutor_agreement', { signed_name: 'Test Name', version: '2026-01-01' }],
  ['submit_tutor_application', {}],
  ['send_message_with_attachments', { p_conversation_id: crypto.randomUUID(), p_content: 'hi', p_attachments: [] }],
]

const refused = async (client: typeof anon, name: string, args: Record<string, unknown>) => {
  const { error } = await client.rpc(name as never, args as never)
  // PostgREST hides functions the role may not execute, so a revoke can surface either as
  // 42501 (permission denied reaching Postgres) or PGRST202 (not in the callable schema).
  return { refused: !!error && (error.code === DENIED || error.code === 'PGRST202'), error }
}

// 1) Signed out, with only the public key: every locked-down rpc is refused.
{
  const codes: Record<string, string> = {}
  let allRefused = true
  for (const name of triggerFns) {
    const r = await refused(anon, name, {})
    codes[name] = r.error?.code ?? 'CALLABLE'
    allRefused &&= r.refused
  }
  for (const [name, args] of lockedFns) {
    const r = await refused(anon, name, args)
    codes[name] = r.error?.code ?? 'CALLABLE'
    allRefused &&= r.refused
  }
  const summary = Object.entries(codes).map(([k, v]) => `${k}:${v}`).join(', ')
  step(1, allRefused, `DENY signed-out rpc on all ${Object.keys(codes).length} locked-down functions → ${summary}`)
}

// 2) Signed in as a plain student: trigger fns still refused; the is_* helpers work.
const studentClient = createClient(URL, ANON, { auth: { persistSession: false } })
{
  const { error: signErr } = await studentClient.auth.signInWithPassword({ email: 'student@crimson.ua.edu', password: 'password123' })
  let allRefused = !signErr
  const codes: Record<string, string> = {}
  for (const name of triggerFns) {
    const r = await refused(studentClient, name, {})
    codes[name] = r.error?.code ?? 'CALLABLE'
    allRefused &&= r.refused
  }
  const summary = Object.entries(codes).map(([k, v]) => `${k}:${v}`).join(', ')
  step(2, allRefused, `DENY signed-in student rpc on ${triggerFns.length} trigger functions → ${summary}`)
}
{
  const { data, error } = await studentClient.rpc('is_admin')
  step('2b', !error && data === false, `ALLOW is_admin() for a student → ${error?.message ?? `returned ${data}`}`)
}
{
  const { data, error } = await studentClient.rpc('is_blocked_between', { a: student!.id, b: sara!.id })
  step('2c', !error && typeof data === 'boolean', `ALLOW is_blocked_between(self, sara) → ${error?.message ?? `returned ${data}`}`)
}
{
  const { data, error } = await studentClient.rpc('is_conversation_participant', { cid: crypto.randomUUID() })
  step('2d', !error && typeof data === 'boolean', `ALLOW is_conversation_participant(random uuid) → ${error?.message ?? `returned ${data}`}`)
}

// 3) check_invite_code stays callable signed out: true for a real code, false for a bad one.
{
  let { data: rows } = await admin.from('invite_codes').select('code').limit(1)
  if (!rows?.length) {
    const { data: code } = await studentClient.rpc('my_invite_code')
    rows = code ? [{ code }] : []
  }
  const real = rows?.[0]?.code
  if (!real) {
    step(3, false, 'no invite_codes row to test and my_invite_code returned nothing')
  } else {
    const good = await anon.rpc('check_invite_code', { p_code: real })
    const bad = await anon.rpc('check_invite_code', { p_code: 'NOOT-ZZZZZZ' })
    step(3, !good.error && good.data === true && !bad.error && bad.data === false,
      `ALLOW signed-out check_invite_code → real code ${good.error?.message ?? good.data}, bogus code ${bad.error?.message ?? bad.data}`)
  }
}

// 4) Rate limit: 30 checks per caller per 10 minutes. A forged cf-connecting-ip is the
//    bucket key locally only if PostgREST forwards the header into request.headers.
{
  const ip = `203.0.113.${10 + Math.floor(Math.random() * 200)}`
  const limited = createClient(URL, ANON, {
    auth: { persistSession: false },
    global: { headers: { 'cf-connecting-ip': ip } },
  })
  let succeeded = 0, limitErr: { message?: string } | null = null
  for (let i = 0; i < 31; i++) {
    const { error } = await limited.rpc('check_invite_code', { p_code: 'NOOT-ZZZZZZ' })
    if (error) { limitErr = error; break }
    succeeded++
  }
  step(4, succeeded === 30 && !!limitErr?.message?.includes('Too many invite code checks'),
    `RATE LIMIT at ${ip}: ${succeeded} calls succeeded, call ${succeeded + 1} → ${limitErr?.message ?? 'no error'}`)
}
{
  const ip = `203.0.113.${10 + Math.floor(Math.random() * 200)}`
  const other = createClient(URL, ANON, {
    auth: { persistSession: false },
    global: { headers: { 'cf-connecting-ip': ip } },
  })
  const { data, error } = await other.rpc('check_invite_code', { p_code: 'NOOT-ZZZZZZ' })
  step('4b', !error && data === false, `ALLOW a different caller IP (${ip}) still gets a normal answer → ${error?.message ?? data}`)
}
// Which bucket did the header actually land in? client_key is stored per call.
{
  const { data: keys } = await admin.from('invite_code_checks').select('client_key')
  const buckets = [...new Set((keys ?? []).map((r) => r.client_key))]
  console.log(`note: invite_code_checks client_key buckets seen: ${buckets.join(', ') || '(none)'}`)
}

// 5) invite_code_checks: readable by the service key; closed to everyone else.
{
  const { error } = await admin.from('invite_code_checks').select('id').limit(1)
  step(5, !error, `ALLOW service-role select on invite_code_checks → ${error?.message ?? 'ok'}`)
}
{
  const { data, error } = await anon.from('invite_code_checks').select('id')
  const closed = !!error || (data?.length ?? 0) === 0
  step('5b', closed, `DENY anon select on invite_code_checks → ${error ? `error ${error.code}: ${error.message}` : `no error, ${data?.length} rows`}`)
}

await studentClient.auth.signOut()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
