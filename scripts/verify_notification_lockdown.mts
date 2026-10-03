// Verify nobody outside the server can create a notification (migration 0043) against the
// LOCAL stack — and that the real ones (a new chat message) still arrive.
//
// Needs: supabase start && node supabase/seed_demo.mjs
//   pnpm dlx tsx scripts/verify_notification_lockdown.mts
import { createClient } from '@supabase/supabase-js'
import { initSupabase, getSupabase, api, auth } from '../packages/core/src/index.ts'

const URL = 'http://127.0.0.1:54321'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

let pass = 0, fail = 0
const step = (n: number, ok: boolean, msg: string) => {
  ok ? pass++ : fail++
  console.log(`${n}) ${ok ? 'PASS ✅' : 'FAIL ❌'} — ${msg}`)
}

initSupabase({ url: URL, anonKey: ANON })
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })
const { data: victim } = await admin.from('users').select('id').eq('email', 'sara@crimson.ua.edu').single()
const MARK = `forged-${Date.now()}`
const forge = { p_user: victim!.id, p_type: 'system', p_title: MARK, p_body: 'tap https://evil.example', p_data: {} }
const forged = async () => (await admin.from('notifications').select('id').eq('title', MARK)).data?.length ?? 0

// 1) Signed out, with only the public key.
{
  const { error } = await getSupabase().rpc('create_notification', forge)
  step(1, !!error && (await forged()) === 0, `DENY signed out forging a notification → ${error?.message ?? 'CREATED'}`)
}

// 2) Signed in as a plain student, aimed at someone else.
const signIn = await auth.signInWithPassword('student@crimson.ua.edu', 'password123')
{
  const { error } = await getSupabase().rpc('create_notification', forge)
  step(2, signIn.ok && !!error && (await forged()) === 0, `DENY a student forging a notification for another user → ${error?.message ?? 'CREATED'}`)
}

// 3) Nor by writing the table directly (there is no insert policy).
{
  const { error } = await getSupabase().from('notifications').insert({ user_id: victim!.id, type: 'system', title: MARK, body: '' })
  step(3, !!error && (await forged()) === 0, `DENY inserting into notifications directly → ${error?.message ?? 'INSERTED'}`)
}

// 4) The real path still works: a chat message notifies the other participant.
{
  const convo = (await api.chat.listConversations())[0]
  if (!convo) {
    step(4, false, 'no seeded conversation to send a message in')
  } else {
    const { data: c } = await admin.from('conversations').select('student_id, tutor_id').eq('id', convo.id).single()
    const { data: me } = await admin.from('users').select('id').eq('email', 'student@crimson.ua.edu').single()
    const other = c!.student_id === me!.id ? c!.tutor_id : c!.student_id
    const text = `lockdown check ${Date.now()}`
    await api.chat.sendMessage(convo.id, text)
    const { data: notes } = await admin.from('notifications').select('type, body').eq('user_id', other).eq('body', text)
    step(4, notes?.length === 1 && notes[0]!.type === 'message', `ALLOW a real message still notifies the other person (${notes?.length ?? 0} notification)`)
    await admin.from('notifications').delete().eq('user_id', other).eq('body', text)
  }
}

// 5) Server code with the service key can still create one.
{
  const { error } = await admin.rpc('create_notification', { ...forge, p_title: `${MARK}-server` })
  const { data } = await admin.from('notifications').select('id').eq('title', `${MARK}-server`)
  step(5, !error && data?.length === 1, `ALLOW the server (service key) → ${error?.message ?? 'created'}`)
  await admin.from('notifications').delete().eq('title', `${MARK}-server`)
}

await auth.signOut()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
