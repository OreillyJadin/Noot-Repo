// Verify tutor grade-verification claims stay conditional on B1–B5.
// Reads screen sources; needs no stack.
//   pnpm dlx tsx scripts/verify_b3_grade_copy.mts
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0, n = 0
const step = (ok: boolean, msg: string) => {
  ok ? pass++ : fail++
  console.log(`${++n}) ${ok ? 'PASS ✅' : 'FAIL ❌'} — ${msg}`)
}

const SCREENS = ['b1', 'b2', 'b3', 'b4', 'b5']
const OLD_VERIFIED_GRADE = /Grade \$\{[^}]+\}\s*verified/
const VERIFIED_GRADE_TEMPLATE = /`[^`]*\bGrade\b[^`]*\bverified\b[^`]*`/

for (const screen of SCREENS) {
  const src = readFileSync(new URL(`../apps/mobile/app/${screen}.tsx`, import.meta.url), 'utf8')
  const lines = src.split('\n').map((line, i) => [i + 1, line] as const)
    .filter(([, line]) => !/^\s*(\/\/|\/\*|\*|\*\/)/.test(line))
  const unconditional = lines.filter(([, line]) => OLD_VERIFIED_GRADE.test(line))
  step(
    unconditional.length === 0,
    `${screen}.tsx has no unconditional verified-grade claim${unconditional.length ? `: ${unconditional.map(([i, line]) => `L${i} ${line.trim()}`).join(' | ')}` : ''}`,
  )

  const unguardedTemplates = lines.filter(([, line]) =>
    VERIFIED_GRADE_TEMPLATE.test(line) && !line.includes('verified ?'),
  )
  step(
    unguardedTemplates.length === 0,
    `${screen}.tsx verified-grade templates are conditional${unguardedTemplates.length ? `: ${unguardedTemplates.map(([i, line]) => `L${i} ${line.trim()}`).join(' | ')}` : ''}`,
  )
}

const b3 = readFileSync(new URL('../apps/mobile/app/b3.tsx', import.meta.url), 'utf8')
step(b3.includes('· self-reported'), 'B3 includes self-reported grade copy')
step(b3.includes('gradeLabel(courseEntry[1], tutor.verified)'), 'B3 course summary uses tutor verification')
step(b3.includes('gradeLabel(grade, tutor.verified)'), 'B3 course picker uses tutor verification')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
