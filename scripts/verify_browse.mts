// Verify what the Search tab shows (ERR-010, ERR-011) and the Home course card (ERR-015) against the LOCAL stack: the real
// api.tutors.search list run through the screen's grouping (apps/mobile/lib/browse.ts).
// The layout itself needs a device — this covers which tutors land where.
//
// Needs: supabase start && node supabase/seed_demo.mjs
//   pnpm dlx tsx scripts/verify_browse.mts
import { initSupabase, api, auth } from '../packages/core/src/index.ts'
import { toTutor } from '../apps/mobile/lib/data.ts'
import { CATEGORIES, byPopularity, forYou, nudgeCourse, populatedCategories, subjectOf, tutorsIn } from '../apps/mobile/lib/browse.ts'

const URL = 'http://127.0.0.1:54321'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

let pass = 0, fail = 0
const step = (n: number, ok: boolean, msg: string) => {
  ok ? pass++ : fail++
  console.log(`${n}) ${ok ? 'PASS ✅' : 'FAIL ❌'} — ${msg}`)
}

initSupabase({ url: URL, anonKey: ANON })
const signIn = await auth.signInWithPassword('student@crimson.ua.edu', 'password123')
step(1, signIn.ok, signIn.ok ? 'signed in as the demo student' : `sign-in failed: ${signIn.error}`)

const me = await api.getMe()
const tutors = (await api.tutors.search({})).map(toTutor)
step(2, tutors.length > 0, `${tutors.length} approved tutors from api.tutors.search`)

// Every tab that shows has tutors in it.
const tabs = populatedCategories(tutors)
step(3, tabs.length > 0 && tabs.every((c) => tutorsIn(tutors, c).length > 0),
  `tabs: ${tabs.map((c) => `${c.name} (${tutorsIn(tutors, c).length})`).join(', ')}`)

// Every subject in the catalog belongs to a category — a tutor whose only subject were
// missing would be in no tab at all. Local holds a subset of production's 132 subjects; the
// full list was checked against production when the map was written (2026-10-03).
const mapped = new Set(CATEGORIES.flatMap((c) => c.subjects))
const { getSupabase } = await import('../packages/core/src/index.ts')
// The course_subjects view (0025) is one row per subject, so PostgREST's row cap can't hide any.
const { data: subjectRows, error: subjErr } = await getSupabase().from('course_subjects').select('subject_code')
const catalogSubjects = [...new Set((subjectRows ?? []).map((r) => r.subject_code as string))]
const unmapped = catalogSubjects.filter((code) => !mapped.has(code))
const orphans = [...new Set(tutors.flatMap((t) => t.courses.map(([code]) => code)).filter((code) => !mapped.has(subjectOf(code))))]
step(4, !subjErr && catalogSubjects.length > 0 && unmapped.length === 0 && orphans.length === 0,
  `${catalogSubjects.length} catalog subjects, unmapped: ${unmapped.join(', ') || 'none'}; tutor courses in no category: ${orphans.join(', ') || 'none'}`)

// "Popular" is ordered by sessions.
const popular = byPopularity(tutors)
step(5, popular.every((t, i) => i === 0 || popular[i - 1]!.sessions >= t.sessions),
  `popular: ${popular.slice(0, 3).map((t) => `${t.name} (${t.sessions})`).join(', ')}`)

// The demo student has no courses and an "Undecided" major: no carousel, just the list —
// not the popular list a second time (ERR-010).
const picked = forYou(tutors, me?.courses ?? [], me?.major ?? null)
const noSignal = (me?.courses ?? []).length === 0 && /^(undeclared|undecided)$/i.test(me?.major ?? 'undeclared')
step(6, noSignal ? picked === null : true,
  picked ? `${picked.title}: ${picked.picks.map((p) => `${p.tutor.name} · ${p.course}`).join(', ')}`
    : `no carousel for courses [${me?.courses?.join(', ') ?? ''}] and major ${me?.major ?? 'unset'}`)

// With a course a seeded tutor teaches, the carousel is exactly that course's tutors.
const some = tutors[0]!.courses[0]![0]
const forThat = forYou(tutors, [some], null)
const expected = tutors.filter((t) => t.courses.some(([code]) => code === some)).length
step(7, forThat?.title === 'For your courses' && forThat.picks.length === expected && forThat.picks.every((p) => p.course === some),
  `a student taking ${some} sees ${forThat?.picks.length ?? 0} of ${expected} tutors for it`)

// ERR-015: the Home card names a course of the student's that a tutor teaches, and its
// button opens search seeded with it — so every tutor listed there teaches that course.
// A course nobody teaches is skipped, and with none taught there is no card.
const nudge = nudgeCourse(tutors, ['ZZZ 999', some])
const listed = tutors.filter((t) => t.name.toLowerCase().includes(some.toLowerCase())
  || t.courses.some(([code]) => code.toLowerCase().includes(some.toLowerCase())))
// The signed-in demo student gets the card only if a tutor teaches one of their courses.
const mine = nudgeCourse(tutors, me?.courses ?? [])
const mineTaught = (me?.courses ?? []).some((c) => tutors.some((t) => t.courses.some(([code]) => code.toLowerCase() === c.trim().toLowerCase())))
step(8, nudge === some && listed.length > 0 && listed.every((t) => t.courses.some(([code]) => code === some))
  && nudgeCourse(tutors, ['ZZZ 999']) === null && (mine !== null) === mineTaught,
  `the Home card for [ZZZ 999, ${some}] names ${nudge}; search for it lists ${listed.length} tutor(s), all teaching it; no card for ZZZ 999 alone`)

await auth.signOut()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
