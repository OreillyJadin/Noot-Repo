// Verify the signed-out and onboarding screens show no invented statistics (App Review
// Guideline 2.3): no hard-coded "<n> tutors", "<n> departments", "<n> students", ratings, etc.
// Reads the screen sources; needs no stack.
//   pnpm dlx tsx scripts/verify_landing_copy.mts
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0, n = 0
const step = (ok: boolean, msg: string) => {
  ok ? pass++ : fail++
  console.log(`${++n}) ${ok ? 'PASS ✅' : 'FAIL ❌'} — ${msg}`)
}

const SCREENS = [
  'index', 'signin', 'signup', 'forgot_password', 'auth-callback', 'role', 'enable_faceid',
  'verified', 'set_password', 'accept_terms', 'guidelines',
  't1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9', 't10',
]
// A number next to a head-count, a rating, or a number fed into "{n} tutors"-style copy.
const FAKE_STAT = /\b\d[\d,.]*\+?\s*(active\s+|verified\s+)?(tutors?|students?|departments?|courses|reviews|users|sessions booked)\b|\b\d\.\d\s*★|★\s*\d\.\d|\{\w+\}\s*tutors\b/i

for (const s of SCREENS) {
  const src = readFileSync(new URL(`../apps/mobile/app/${s}.tsx`, import.meta.url), 'utf8')
  const hits = src.split('\n').map((l, i) => [i + 1, l] as const)
    .filter(([, l]) => !/^\s*(\/\/|\*)/.test(l) && FAKE_STAT.test(l))
  step(hits.length === 0, `${s}.tsx has no hard-coded stats${hits.length ? `: ${hits.map(([i, l]) => `L${i} ${l.trim()}`).join(' | ')}` : ''}`)
}

const landing = readFileSync(new URL('../apps/mobile/app/index.tsx', import.meta.url), 'utf8')
step(landing.includes('Peer tutors at UA · grade-verified tutors marked ✓.'), 'the landing footer reads "Peer tutors at UA · grade-verified tutors marked ✓."')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
