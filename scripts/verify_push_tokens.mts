// Verify device registration for notifications (ERR-031, migration 0045) against the LOCAL
// stack, as plain signed-in students through @supabase/supabase-js — the way anyone holding
// the app's public key could try it.
//
// The sending trigger is NOT exercised here on purpose: it would post to Expo's real push
// service. It is checked by hand inside a rolled-back transaction (see the PR).
//
// Needs: supabase start (migrations applied)
//   pnpm dlx tsx scripts/verify_push_tokens.mts
import { createClient } from '@supabase/supabase-js'
import { initSupabase, auth, api } from '../packages/core/src/index.ts'

const URL = 'http://127.0.0.1:54321'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

let pass = 0, fail = 0, n = 0
const step = (ok: boolean, msg: string) => {
  ok ? pass++ : fail++
  console.log(`${++n}) ${ok ? 'PASS ✅' : 'FAIL ❌'} — ${msg}`)
}

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })
const tag = `push_${Date.now()}`
const phone = `ExponentPushToken[${tag}_phone]`
const tokensOf = async (uid: string) =>
  ((await svc.from('push_tokens').select('token').eq('user_id', uid)).data ?? []).map((r) => r.token as string)

const signedIn = async (name: string) => {
  const email = `${tag}_${name}@crimson.ua.edu`
  const made = await svc.auth.admin.createUser({ email, password: 'password123', email_confirm: true })
  if (made.error) throw made.error
  const client = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password: 'password123' })
  if (error) throw error
  return { id: made.data.user!.id, email, client }
}

try {
  const ana = await signedIn('ana')
  const ben = await signedIn('ben')

  // ---- the app's own path (@noot/core) ----
  initSupabase({ url: URL, anonKey: ANON })
  const inAs = await auth.signInWithPassword(ana.email, 'password123')
  if (!inAs.ok) throw new Error(inAs.error)
  await api.notifications.registerPushToken(phone, 'ios')
  await api.notifications.registerPushToken(phone, 'ios')
  const once = await tokensOf(ana.id)
  step(once.length === 1 && once[0] === phone, 'the app registers its device, and registering again does not duplicate it')

  // ---- what a student can do to someone else's devices ----
  const peek = await ben.client.from('push_tokens').select('token').eq('user_id', ana.id)
  step(!peek.error && (peek.data ?? []).length === 0, "a student cannot read another student's device tokens")

  const plant = await ben.client.from('push_tokens').insert({ user_id: ana.id, token: `ExponentPushToken[${tag}_spy]`, platform: 'ios' })
  step(!!plant.error && !(await tokensOf(ana.id)).includes(`ExponentPushToken[${tag}_spy]`),
    "a student cannot add their own device to another student's account (which would send them that student's notifications)")

  const wipe = await ben.client.from('push_tokens').delete().eq('user_id', ana.id)
  step((await tokensOf(ana.id)).length === 1, `a student cannot remove another student's device${wipe.error ? ` (${wipe.error.message})` : ''}`)

  const steal = await ben.client.from('push_tokens').update({ user_id: ben.id }).eq('user_id', ana.id)
  step((await tokensOf(ana.id)).length === 1 && (await tokensOf(ben.id)).length === 0,
    `nor move it onto their own account${steal.error ? ` (${steal.error.message})` : ''}`)

  // ---- only a real token is storable ----
  for (const bad of ['', 'not-a-token', 'ExponentPushToken[]', 'ExponentPushToken[abc] extra', `https://evil.example/${tag}`]) {
    const res = await ben.client.from('push_tokens').insert({ user_id: ben.id, token: bad, platform: 'ios' })
    step(!!res.error, `"${bad}" is refused as a device token`)
  }

  // ---- one phone, one account ----
  const takeover = await ben.client.from('push_tokens').insert({ user_id: ben.id, token: phone, platform: 'ios' })
  const anaAfter = await tokensOf(ana.id), benAfter = await tokensOf(ben.id)
  step(!takeover.error && anaAfter.length === 0 && benAfter.length === 1,
    "when the next account signs in on the same phone, the phone stops being the first account's")

  // ---- sign-out ----
  await ben.client.from('push_tokens').delete().eq('user_id', ben.id) // free the phone for ana again
  await api.notifications.registerPushToken(phone, 'ios')
  await api.notifications.unregisterPushToken(phone)
  step((await tokensOf(ana.id)).length === 0, 'signing out removes the device from the account')

  // ---- nobody signed in ----
  const anon = createClient(URL, ANON, { auth: { persistSession: false } })
  const anonAdd = await anon.from('push_tokens').insert({ user_id: ana.id, token: `ExponentPushToken[${tag}_anon]`, platform: 'ios' })
  const anonRead = await anon.from('push_tokens').select('token')
  step(!!anonAdd.error && (anonRead.data ?? []).length === 0, 'without signing in, device tokens can be neither added nor read')
} finally {
  await auth.signOut().catch(() => {})
  const { data } = await svc.auth.admin.listUsers({ perPage: 1000 })
  for (const u of data?.users ?? []) if (u.email?.startsWith(tag)) await svc.auth.admin.deleteUser(u.id)
  // public.users no longer cascades from auth.users (0026); push_tokens cascades from it.
  await svc.from('users').delete().like('email', `${tag}%`)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
