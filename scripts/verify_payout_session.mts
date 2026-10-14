// Verify the real connect-onboarding-link function, including Accounts v2 creation and
// concurrent Account Session onboarding. Without a test key, Part A keeps the simulated
// function contract checks.
//
// Needs: supabase start + node supabase/seed_demo.mjs + supabase functions serve
//   pnpm dlx tsx scripts/verify_payout_session.mts
import { createClient } from '@supabase/supabase-js'
import { initSupabase, api, auth } from '../packages/core/src/index.ts'
import { getPayoutStatus, retrieveAccount, StripeApiError } from '../supabase/functions/_shared/connect.ts'

const URL = 'http://127.0.0.1:54321'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const FN = `${URL}/functions/v1/connect-onboarding-link`
const STATUS_FN = `${URL}/functions/v1/connect-status`
const KEY = process.env.STRIPE_SECRET_KEY ?? ''
const LIVE = KEY.startsWith('sk_test_')

type JsonObject = Record<string, unknown>
type StripeV1Response = {
  error?: { code?: string }
  components?: Record<string, { enabled?: boolean }>
  account?: string
  client_secret?: string
  deleted?: boolean
  [key: string]: unknown
}

let pass = 0, fail = 0, n = 0
const step = (ok: boolean, msg: string) => {
  ok ? pass++ : fail++
  console.log(`${++n}) ${ok ? 'PASS ✅' : 'FAIL ❌'} — ${msg}`)
}

const call = async (token: string | null, body?: unknown, endpoint = FN) => {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: ANON,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: res.status, body: await res.json().catch(() => ({})) as JsonObject }
}

const stripe = async (method: string, path: string, body?: URLSearchParams) => {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Stripe-Version': '2024-06-20',
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    ...(body ? { body } : {}),
  })
  const value = await res.json() as StripeV1Response
  if (!res.ok) {
    throw new Error(`Stripe ${method} failed (${res.status}) code=${value.error?.code ?? 'unknown'}`)
  }
  return value
}

const errorSummary = (error: unknown) =>
  error instanceof StripeApiError
    ? `${error.name} status=${error.status} code=${error.code}`
    : String(error)

const anonOnly = await call(ANON, { mode: 'session' })
const none = await call(null, { mode: 'session' })
step(anonOnly.status === 401 && none.status === 401 && !('clientSecret' in anonOnly.body),
  `signed out, a session is refused (${none.status}/${anonOnly.status})`)

const sb = createClient(URL, ANON, { auth: { persistSession: false } })
const { data: sess, error: signInErr } = await sb.auth.signInWithPassword({
  email: 'sara@crimson.ua.edu',
  password: 'password123',
})
if (signInErr || !sess.session) throw new Error(`tutor sign-in failed: ${signInErr?.message ?? 'no session'}`)
const token = sess.session.access_token

if (!LIVE) {
  const session = await call(token, { mode: 'session' })
  step(session.status === 200 && session.body.clientSecret === null && session.body.simulated === true,
    'signed in as a tutor, session mode answers simulated without a Stripe key')

  const link = await call(token)
  step(link.status === 200 && 'url' in link.body && link.body.clientSecret === null && link.body.simulated === true,
    'body-less call answers the hosted-link shape in simulated mode')

  const switched: string[] = []
  for (const mode of ['link', 'SESSION', '', 7, null, { a: 1 }]) {
    const response = await call(token, { mode })
    if (response.status !== 200 || response.body.clientSecret !== null || response.body.simulated !== true) {
      switched.push(JSON.stringify(mode))
    }
  }
  step(switched.length === 0, `non-session modes stay simulated${switched.length ? `: ${switched.join(', ')}` : ''}`)

  initSupabase({ url: URL, anonKey: ANON })
  await auth.signInWithPassword('sara@crimson.ua.edu', 'password123')
  const viaCore = await api.connect.accountSession()
  step(viaCore.clientSecret === null && viaCore.simulated === true,
    '@noot/core maps the simulated answer to the hosted-page fallback')
} else {
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })
  const saraId = sess.session.user.id
  const { data: originalProfile, error: profileError } = await admin
    .from('tutor_profiles')
    .select('stripe_connect_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_onboarded_at')
    .eq('user_id', saraId)
    .single()
  if (profileError || !originalProfile) {
    throw new Error(`could not read Sara's payout profile: ${profileError?.message ?? 'missing profile'}`)
  }

  const createdAccountIds = new Set<string>()
  const closedAccountIds = new Set<string>()
  let cleanupErrors: string[] = []
  let deadFakeId: string | null = null
  try {
    const { error: clearError } = await admin
      .from('tutor_profiles')
      .update({
        stripe_connect_account_id: null,
        stripe_charges_enabled: false,
        stripe_payouts_enabled: false,
        stripe_onboarded_at: null,
      })
      .eq('user_id', saraId)
    if (clearError) throw new Error(`could not clear Sara's payout account: ${clearError.message}`)

    const sessions = await Promise.all(
      Array.from({ length: 5 }, () => call(token, { mode: 'session' })),
    )
    for (const response of sessions) {
      if (typeof response.body.accountId === 'string') createdAccountIds.add(response.body.accountId)
    }
    const accountIds = sessions.map((response) => response.body.accountId)
    const accountId = typeof accountIds[0] === 'string' ? accountIds[0] : undefined
    step(
      sessions.every((response) =>
        response.status === 200 &&
        typeof response.body.clientSecret === 'string' &&
        !('url' in response.body)
      ) && !!accountId && accountIds.every((id) => id === accountId),
      `five concurrent session calls return 200 with one account id${accountId ? ` (${accountId})` : ''}`,
    )
    if (!accountId) throw new Error('concurrent calls did not return an account id')

    const { data: storedProfile, error: storedError } = await admin
      .from('tutor_profiles')
      .select('stripe_connect_account_id')
      .eq('user_id', saraId)
      .single()
    const payoutStatus = await getPayoutStatus(KEY, accountId)
    step(
      !storedError &&
        storedProfile?.stripe_connect_account_id === accountId &&
        !payoutStatus.closed,
      'database retains the concurrent winner and its account is not closed',
    )

    const account = await retrieveAccount(KEY, accountId)
    const transfers = account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers
    const accountFields = {
      express: account.dashboard === 'express',
      recipient: account.applied_configurations?.includes('recipient') === true,
      contactEmail: account.contact_email === sess.user.email,
      userMetadata: account.metadata?.user_id === saraId,
      transferStatus: typeof transfers?.status === 'string',
    }
    step(
      Object.values(accountFields).every(Boolean),
      `v2 account fields (${Object.entries(accountFields).map(([name, ok]) => `${name}=${ok}`).join(', ')})`,
    )

    step(
      sessions.every((response) =>
        typeof response.body.clientSecret === 'string' && !('url' in response.body)
      ),
      'session answers contain a client secret and no hosted URL',
    )

    const v1Session = await stripe(
      'POST',
      'account_sessions',
      new URLSearchParams({
        account: accountId,
        'components[account_onboarding][enabled]': 'true',
      }),
    )
    const enabledComponents = Object.entries(v1Session.components ?? {})
      .filter(([, component]) => (component as { enabled?: boolean })?.enabled)
      .map(([name]) => name)
    step(
      typeof v1Session.client_secret === 'string' &&
        v1Session.account === accountId &&
        enabledComponents.length === 1 &&
        enabledComponents[0] === 'account_onboarding',
      `v1 Account Session enables only account_onboarding (${enabledComponents.join(', ') || 'none'})`,
    )

    const hosted = await call(token)
    step(
      hosted.status === 200 &&
        typeof hosted.body.url === 'string' &&
        hosted.body.url.startsWith('https://connect.stripe.com/'),
      'body-less call returns an HTTPS connect.stripe.com hosted link',
    )

    const status = await call(token, undefined, STATUS_FN)
    const { data: cached, error: cacheError } = await admin
      .from('tutor_profiles')
      .select('stripe_charges_enabled, stripe_payouts_enabled')
      .eq('user_id', saraId)
      .single()
    step(
      status.status === 200 &&
        status.body.connected === true &&
        status.body.chargesEnabled === false &&
        status.body.payoutsEnabled === false &&
        !cacheError &&
        cached?.stripe_charges_enabled === false &&
        cached?.stripe_payouts_enabled === false,
      'connect-status reports fresh-account readiness as false and caches false flags',
    )

    const fakeId = 'acct_fake_for_verify'
    deadFakeId = fakeId
    const { error: fakeIdError } = await admin
      .from('tutor_profiles')
      .update({ stripe_connect_account_id: fakeId })
      .eq('user_id', saraId)
    if (fakeIdError) throw new Error(`could not set fake stored id: ${fakeIdError.message}`)
    const recovered = await call(token, { mode: 'session' })
    const recoveredId = typeof recovered.body.accountId === 'string' ? recovered.body.accountId : undefined
    if (recoveredId) createdAccountIds.add(recoveredId)
    step(
      recovered.status === 200 && typeof recoveredId === 'string' && recoveredId !== fakeId,
      `dead-id recovery creates a replacement account${recoveredId ? ` (${recoveredId})` : ''}`,
    )
    if (recovered.status === 200 && recoveredId) {
      const deletion = await stripe('DELETE', `accounts/${encodeURIComponent(recoveredId)}`)
      if (deletion.deleted === true) closedAccountIds.add(recoveredId)
      const closedStatus = await getPayoutStatus(KEY, recoveredId)
      step(deletion.deleted === true && closedStatus.closed, 'recovered test account is closed')
    }
  } catch (error) {
    step(false, `live payout-session verification aborted (${errorSummary(error)})`)
  } finally {
    const { data: currentProfile, error: currentProfileError } = await admin
      .from('tutor_profiles')
      .select('stripe_connect_account_id')
      .eq('user_id', saraId)
      .single()
    if (currentProfileError) {
      cleanupErrors.push(`profile cleanup read: ${currentProfileError.message}`)
    } else {
      const currentId = currentProfile?.stripe_connect_account_id
      if (
        currentId &&
        currentId !== originalProfile.stripe_connect_account_id &&
        currentId !== deadFakeId
      ) {
        createdAccountIds.add(currentId)
      }
    }

    for (const id of createdAccountIds) {
      if (closedAccountIds.has(id)) continue
      try {
        const deletion = await stripe('DELETE', `accounts/${encodeURIComponent(id)}`)
        if (deletion.deleted === true) closedAccountIds.add(id)
        else cleanupErrors.push(id)
      } catch {
        cleanupErrors.push(id)
      }
    }

    const { error: restoreError } = await admin
      .from('tutor_profiles')
      .update({
        stripe_connect_account_id: originalProfile.stripe_connect_account_id,
        stripe_charges_enabled: originalProfile.stripe_charges_enabled,
        stripe_payouts_enabled: originalProfile.stripe_payouts_enabled,
        stripe_onboarded_at: originalProfile.stripe_onboarded_at,
      })
      .eq('user_id', saraId)
    if (restoreError) cleanupErrors.push(`profile restore: ${restoreError.message}`)

    step(cleanupErrors.length === 0, cleanupErrors.length
      ? `cleanup or restore failed: ${cleanupErrors.join(', ')}`
      : 'closed every created test account and restored Sara’s original payout profile')
  }

  const leftBehind = [...createdAccountIds].filter((id) => !closedAccountIds.has(id))
  console.log(`Test-mode accounts left behind: ${leftBehind.length ? leftBehind.join(', ') : 'none'}`)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
