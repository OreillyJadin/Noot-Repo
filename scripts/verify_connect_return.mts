// Verify the connect-return Edge Function (ERR-002) against the LOCAL stack: the https
// address Stripe sends a tutor back to after payout onboarding. It must answer a plain
// browser request (no session, so JWT verification is off) and may only ever redirect into
// the app — never to an address the caller supplies.
//
// Needs: supabase start && supabase functions serve
//   pnpm dlx tsx scripts/verify_connect_return.mts
const BASE = 'http://127.0.0.1:54321/functions/v1/connect-return'

let pass = 0, fail = 0
const step = (n: number, ok: boolean, msg: string) => {
  ok ? pass++ : fail++
  console.log(`${n}) ${ok ? 'PASS ✅' : 'FAIL ❌'} — ${msg}`)
}
/** Request with NO Authorization or apikey header, as Stripe's redirect arrives. */
const hit = async (query: string, method = 'GET') => {
  const res = await fetch(`${BASE}${query}`, { method, redirect: 'manual' })
  return { status: res.status, location: res.headers.get('location') }
}

const plain = await hit('')
step(1, plain.status === 302 && plain.location === 'noot://connect-return',
  `no session, no query → ${plain.status} ${plain.location}`)

const ret = await hit('?to=return')
step(2, ret.status === 302 && ret.location === 'noot://connect-return', `to=return → ${ret.location}`)

const refresh = await hit('?to=refresh')
step(3, refresh.status === 302 && refresh.location === 'noot://connect-refresh', `to=refresh → ${refresh.location}`)

// Never an open redirect: anything else falls back to the app's return address.
let n = 4
for (const bad of ['https://evil.example', '//evil.example', 'noot://somewhere-else', 'javascript:alert(1)', '']) {
  const r = await hit(`?to=${encodeURIComponent(bad)}`)
  step(n++, r.status === 302 && r.location === 'noot://connect-return', `to=${JSON.stringify(bad)} → ${r.location}`)
}

const post = await hit('?to=https://evil.example', 'POST')
step(n++, post.status === 302 && post.location === 'noot://connect-return', `POST with an outside URL → ${post.location}`)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
