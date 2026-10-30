import { readFileSync } from 'node:fs'

const sourcePath = process.argv[2] ?? new URL('../apps/mobile/app/xsr.tsx', import.meta.url)
const src = readFileSync(sourcePath, 'utf8').replace(/\s+/g, ' ').trim()

let pass = 0, fail = 0, n = 0
const step = (ok: boolean, msg: string) => {
  ok ? pass++ : fail++
  console.log(`${++n}) ${ok ? 'PASS ✅' : 'FAIL ❌'} — ${msg}`)
}

const tutorFootnote = 'Can&apos;t make it? Propose another time or cancel from the session. If you cancel, {otherFirst} is refunded in full.'
const tutorDecline = 'Your session with {otherFirst} stays at{\' \'} <Text style={{ color: t.text, fontWeight: \'700\' }}>{currentTime}</Text>. We&apos;ve let them know you declined the new time.'
const studentFootnote = 'After <Text style={{ color: t.text, fontWeight: \'700\' }}>3 reschedules</Text> of the same session, you&apos;re automatically refunded in full plus a credit for the inconvenience.'
const studentDecline = '{otherFirst} will either honor the original time or cancel for a full refund.'

step(src.includes(tutorFootnote), 'tutor footnote explains proposing another time or cancelling')
step(src.includes(tutorDecline), 'tutor decline copy confirms the original time stays')
step(src.includes(studentFootnote), 'student footnote remains unchanged')
step(src.includes(studentDecline), 'student decline copy remains unchanged')

function isTutorElseBranch(tutorCopy: string, studentCopy: string) {
  const studentIndex = src.indexOf(studentCopy)
  const ternaryIndex = src.lastIndexOf('isTutor ?', studentIndex)
  const tutorIndex = src.indexOf(tutorCopy, ternaryIndex)
  return studentIndex >= 0 && ternaryIndex >= 0 && tutorIndex >= ternaryIndex && tutorIndex < studentIndex
}

step(isTutorElseBranch(tutorFootnote, studentFootnote), 'student footnote is the else-branch of the tutor footnote ternary')
step(isTutorElseBranch(tutorDecline, studentDecline), 'student decline is the else-branch of the tutor decline ternary')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
