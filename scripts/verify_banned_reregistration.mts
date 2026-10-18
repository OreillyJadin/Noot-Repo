// Verify banned-account re-registration blocking (ERR-021) against the LOCAL stack.
//
// A suspended or banned user may delete their account, but the old email remains blocked and
// each blocked re-registration is queued once for admins. Active users remain allowed to delete
// and later sign up again.
//
// Needs: supabase start && node supabase/seed_demo.mjs && supabase functions serve
//   pnpm dlx tsx scripts/verify_banned_reregistration.mts
import { DEV_PASSWORD } from './_devPassword.mjs'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { initSupabase, api, auth } from '../packages/core/src/index.ts'
import { SIGNUP_EMAIL_BLOCKED } from '../packages/core/src/auth/index.ts'

const URL = 'http://127.0.0.1:54321'
const ANON =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const LOCAL_SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const PASSWORD = DEV_PASSWORD
const ACTIVE_PASSWORD = DEV_PASSWORD
let pass = 0
let fail = 0
let n = 0
const check = (ok: boolean, message: string) => {
  ok ? pass++ : fail++
  console.log(`${++n}) ${ok ? 'PASS ✅' : 'FAIL ❌'} — ${message}`)
}

const anon = () => createClient(URL, ANON, { auth: { persistSession: false } })
const svc = createClient(URL, LOCAL_SERVICE, { auth: { persistSession: false } })
const tag = `rejoin${Date.now()}`
const bannedEmail = `${tag}_banned@crimson.ua.edu`
const activeEmail = `${tag}_active@crimson.ua.edu`
let bannedId: string | null = null
let activeId: string | null = null
let rejoinedId: string | null = null
const createdIds: string[] = []

const callDeleteAccount = async (token: string) => {
  const response = await fetch(`${URL}/functions/v1/delete-account`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  })
  return { status: response.status, body: await response.json().catch(() => ({})) as { error?: string } }
}

const expectedHash = (email: string) =>
  createHash('sha256').update(email.trim().toLowerCase(), 'utf8').digest('hex')

try {
  const banned = await svc.auth.admin.createUser({
    email: bannedEmail,
    password: PASSWORD,
    email_confirm: true,
  })
  if (banned.error) throw banned.error
  bannedId = banned.data.user!.id
  createdIds.push(bannedId)
  const { error: banError } = await svc.from('users').update({ status: 'banned' }).eq('id', bannedId)
  if (banError) throw banError

  const bannedClient = anon()
  const signedIn = await bannedClient.auth.signInWithPassword({ email: bannedEmail, password: PASSWORD })
  check(!signedIn.error && !!signedIn.data.session, 'a banned account can still sign in before deleting its account')
  const bannedToken = signedIn.data.session?.access_token
  if (!bannedToken) throw new Error('banned test user did not receive a token')

  const deletion = await callDeleteAccount(bannedToken)
  check(deletion.status === 200, `delete-account accepts the banned user (${deletion.status}: ${JSON.stringify(deletion.body)})`)

  const { data: blocked } = await svc
    .from('blocked_signup_emails')
    .select('email_hash, user_id, status')
    .eq('user_id', bannedId)
    .single()
  check(
    blocked?.email_hash === expectedHash(bannedEmail) &&
      blocked.user_id === bannedId &&
      blocked.status === 'banned',
    'deleting a banned user keeps only the normalized one-way email hash',
  )

  const blockedCheck = anon()
  const firstCheck = await blockedCheck.rpc('check_signup_email', {
    p_email: `  ${bannedEmail.toUpperCase()}  `,
  })
  check(!firstCheck.error && firstCheck.data === false, 'the signup check blocks case- and whitespace-variant email input')

  const openReports = async () => {
    const { data, error } = await svc
      .from('content_reports')
      .select('id, detail')
      .eq('target_kind', 'user')
      .eq('target_user_id', bannedId)
      .eq('auto_flagged', true)
      .eq('status', 'open')
    if (error) throw error
    return data ?? []
  }
  const reportsAfterFirst = await openReports()
  check(
    reportsAfterFirst.length === 1 &&
      reportsAfterFirst[0]?.detail === "A banned account's email tried to sign up again.",
    'the first blocked attempt creates exactly one open automatic user report with its detail',
  )

  const secondCheck = await blockedCheck.rpc('check_signup_email', { p_email: bannedEmail })
  const reportsAfterSecond = await openReports()
  check(!secondCheck.error && secondCheck.data === false && reportsAfterSecond.length === 1,
    'repeated blocked checks do not duplicate the open automatic report')

  const rawSignup = await anon().auth.signInWithOtp({
    email: bannedEmail,
    options: { shouldCreateUser: true },
  })
  const { data: recreated } = await svc.from('users').select('id').eq('email', bannedEmail).maybeSingle()
  check(!!rawSignup.error && !recreated, 'the Auth insert trigger blocks a raw anonymous re-signup without a public user row')

  initSupabase({ url: URL, anonKey: ANON })
  const appResult = await auth.sendSignupVerification(bannedEmail, 'Blocked', 'Rejoin')
  check(!appResult.ok && appResult.error === SIGNUP_EMAIL_BLOCKED,
    `core signup feedback uses SIGNUP_EMAIL_BLOCKED (${appResult.error ?? 'no error'})`)

  const active = await svc.auth.admin.createUser({
    email: activeEmail,
    password: ACTIVE_PASSWORD,
    email_confirm: true,
  })
  if (active.error) throw active.error
  activeId = active.data.user!.id
  createdIds.push(activeId)
  const activeClient = anon()
  const activeSignIn = await activeClient.auth.signInWithPassword({ email: activeEmail, password: ACTIVE_PASSWORD })
  if (activeSignIn.error || !activeSignIn.data.session) throw activeSignIn.error ?? new Error('active test user did not receive a token')
  const activeDeletion = await callDeleteAccount(activeSignIn.data.session.access_token)
  check(activeDeletion.status === 200, `delete-account accepts an active user (${activeDeletion.status})`)

  const { data: activeBlocked } = await svc
    .from('blocked_signup_emails')
    .select('email_hash')
    .eq('email_hash', expectedHash(activeEmail))
    .maybeSingle()
  const activeAllowed = await anon().rpc('check_signup_email', { p_email: activeEmail })
  check(!activeBlocked && !activeAllowed.error && activeAllowed.data === true,
    'an active deletion leaves no blocked row and the email remains allowed')

  const rejoin = await anon().auth.signUp({ email: activeEmail, password: ACTIVE_PASSWORD })
  const { data: rejoined } = await svc.from('users').select('id').eq('email', activeEmail).maybeSingle()
  rejoinedId = rejoin.data.user?.id ?? rejoined?.id ?? null
  if (rejoinedId) createdIds.push(rejoinedId)
  check(!rejoin.error && !!rejoinedId, 'an active user can sign up again with the same email')

  const ordinaryStudent = anon()
  const studentSignIn = await ordinaryStudent.auth.signInWithPassword({
    email: 'student@crimson.ua.edu',
    password: DEV_PASSWORD,
  })
  if (studentSignIn.error) throw studentSignIn.error
  const denied = async (client: ReturnType<typeof anon>, fn: string, args: Record<string, unknown>) => {
    const { error } = await client.rpc(fn, args)
    return !!error
  }
  const anonTable = await anon().from('blocked_signup_emails').select('email_hash')
  const studentTable = await ordinaryStudent.from('blocked_signup_emails').select('email_hash')
  check(!!anonTable.error && (!!studentTable.error || (studentTable.data?.length ?? 0) === 0),
    'anonymous and ordinary student clients cannot read blocked signup emails')
  check(
    await denied(anon(), 'block_signup_email', { p_user: bannedId }) &&
      await denied(ordinaryStudent, 'block_signup_email', { p_user: bannedId }) &&
      await denied(anon(), 'signup_email_hash', { addr: bannedEmail }) &&
      await denied(ordinaryStudent, 'signup_email_hash', { addr: bannedEmail }),
    'anonymous and ordinary student clients cannot execute the internal signup functions',
  )

  const adminSignIn = await auth.signInWithPassword('admin@crimson.ua.edu', DEV_PASSWORD)
  if (!adminSignIn.ok) throw new Error(adminSignIn.error)
  const adminClient = anon()
  const adminClientSignIn = await adminClient.auth.signInWithPassword({
    email: 'admin@crimson.ua.edu',
    password: DEV_PASSWORD,
  })
  if (adminClientSignIn.error) throw adminClientSignIn.error
  const adminTable = await adminClient.from('blocked_signup_emails').select('email_hash, user_id').eq('user_id', bannedId)
  check(!adminTable.error && adminTable.data?.length === 1, 'a seeded admin can select blocked signup emails')
  const queue = await api.admin.listReports()
  const report = queue.find((row) => row.targetUserId === bannedId && row.autoFlagged)
  check(
    !!report &&
      report.targetKind === 'user' &&
      report.targetName === 'Deleted account' &&
      report.detail === "A banned account's email tried to sign up again.",
    'core listReports includes the automatic user flag with detail and Deleted account target',
  )
  if (report) {
    await api.admin.resolveReport(report.id, 'dismissed')
    const { data: resolved } = await svc.from('content_reports').select('status').eq('id', report.id).single()
    check(resolved?.status === 'dismissed', 'admin report actions work for an automatic user-targeted report')
  } else {
    check(false, 'admin report action was not attempted because the automatic user flag was missing')
  }
} finally {
  await auth.signOut().catch(() => {})
  if (bannedId) await svc.from('content_reports').delete().eq('target_user_id', bannedId)
  if (bannedId) await svc.from('blocked_signup_emails').delete().eq('user_id', bannedId)
  for (const id of [...new Set(createdIds)]) await svc.auth.admin.deleteUser(id).catch(() => {})
  if (createdIds.length) await svc.from('user_roles').delete().in('user_id', createdIds)
  if (createdIds.length) await svc.from('users').delete().in('id', createdIds)
  if (bannedId) await svc.from('users').delete().eq('id', bannedId)
  if (activeId) await svc.from('users').delete().eq('id', activeId)
  if (rejoinedId) await svc.from('users').delete().eq('id', rejoinedId)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
