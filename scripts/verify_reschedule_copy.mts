import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const sourcePath = process.argv[2] ?? new URL('../apps/mobile/app/xsr.tsx', import.meta.url)
const src = readFileSync(sourcePath, 'utf8').replace(/\s+/g, ' ').trim()
const appDirectory = fileURLToPath(new URL('../apps/mobile/app/', import.meta.url))
const screenSources = readdirSync(appDirectory)
  .filter(file => file.endsWith('.tsx'))
  .map(file => ({
    file,
    source: readFileSync(join(appDirectory, file), 'utf8').replace(/\s+/g, ' ').trim(),
  }))

let pass = 0, fail = 0, n = 0
const step = (ok: boolean, msg: string) => {
  ok ? pass++ : fail++
  console.log(`${++n}) ${ok ? 'PASS ✅' : 'FAIL ❌'} — ${msg}`)
}

const tutorFootnote = 'Can&apos;t make it? Propose another time or cancel from the session. If you cancel, {otherFirst} is refunded in full.'
const tutorDecline = 'Your session with {otherFirst} stays at{\' \'} <Text style={{ color: t.text, fontWeight: \'700\' }}>{currentTime}</Text>. We&apos;ve let them know you declined the new time.'
const studentFootnote = 'There&apos;s no limit on reschedules, and a new time only applies when you both agree. If {otherFirst} cancels, you&apos;re refunded in full; if you cancel, you get a full refund 12+ hours ahead, 50% at 2–12 hours, and none under 2 hours.'
const studentDecline = '{otherFirst} will either honor the original time or cancel for a full refund.'

step(src.includes(tutorFootnote), 'tutor footnote explains proposing another time or cancelling')
step(src.includes(tutorDecline), 'tutor decline copy confirms the original time stays')
step(src.includes(studentFootnote), 'student footnote describes the real reschedule policy')
step(src.includes(studentDecline), 'student decline copy remains unchanged')

function isTutorElseBranch(tutorCopy: string, studentCopy: string) {
  const studentIndex = src.indexOf(studentCopy)
  const ternaryIndex = src.lastIndexOf('isTutor ?', studentIndex)
  const tutorIndex = src.indexOf(tutorCopy, ternaryIndex)
  return studentIndex >= 0 && ternaryIndex >= 0 && tutorIndex >= ternaryIndex && tutorIndex < studentIndex
}

step(isTutorElseBranch(tutorFootnote, studentFootnote), 'student footnote is the else-branch of the tutor footnote ternary')
step(isTutorElseBranch(tutorDecline, studentDecline), 'student decline is the else-branch of the tutor decline ternary')

function noScreenPromise(pattern: RegExp, message: string) {
  const match = screenSources.find(({ source }) => pattern.test(source))
  step(!match, `${message}${match ? ` (${match.file})` : ''}`)
}

noScreenPromise(/refunded in full plus a credit/i, 'no screen promises a full refund plus a credit')
noScreenPromise(/credit for the inconvenience/i, 'no screen promises a credit for the inconvenience')
noScreenPromise(/(after|once)\s+(<[^>]*>\s*)?\d+\s*reschedules/i, 'no screen promises a reschedule-count limit')
noScreenPromise(/automatically refunded/i, 'no screen promises an automatic refund')

const cancellationSrc = readFileSync(new URL('../supabase/functions/_shared/cancellation.ts', import.meta.url), 'utf8')
const fullRefundHours = cancellationSrc.match(/FULL_REFUND_HOURS\s*=\s*(\d+)/)?.[1]
const halfRefundHours = cancellationSrc.match(/HALF_REFUND_HOURS\s*=\s*(\d+)/)?.[1]
step(!!fullRefundHours && src.includes(`${fullRefundHours}+ hours ahead`), 'student full-refund tier matches FULL_REFUND_HOURS')
step(!!fullRefundHours && !!halfRefundHours && src.includes(`${halfRefundHours}–${fullRefundHours} hours`), 'student partial-refund tier matches HALF_REFUND_HOURS and FULL_REFUND_HOURS')
step(!!halfRefundHours && src.includes(`under ${halfRefundHours} hours`), 'student no-refund tier matches HALF_REFUND_HOURS')

const rescheduleSrc = readFileSync(new URL('../supabase/functions/reschedule-booking/index.ts', import.meta.url), 'utf8')
step(!/reschedule_count|reschedules_count/.test(rescheduleSrc), 'server has no reschedule limit, so copy must not promise one')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
