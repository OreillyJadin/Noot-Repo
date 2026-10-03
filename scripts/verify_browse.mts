// Verify what the Search tab shows (ERR-010, ERR-011) against the LOCAL stack: the real
// api.tutors.search list run through the screen's grouping (apps/mobile/lib/browse.ts).
// The layout itself needs a device — this covers which tutors land where.
//
// Needs: supabase start && node supabase/seed_demo.mjs
//   pnpm dlx tsx scripts/verify_browse.mts
import { initSupabase, api, auth } from '../packages/core/src/index.ts'
import { toTutor } from '../apps/mobile/lib/data.ts'
import { CATEGORIES, byPopularity, forYou, populatedCategories, subjectOf, tutorsIn } from '../apps/mobile/lib/browse.ts'

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

// Every tab that shows has tutors, and every tutor in it really teaches a subject in it.
const tabs = populatedCategories(tutors)
const wrong = tabs.flatMap((c) =>
  tutorsIn(tutors, c).filter((p) => !c.subjects.includes(subjectOf(p.course))).map((p) => `${p.tutor.name} in ${c.name}`))
step(3, tabs.length > 0 && tabs.every((c) => tutorsIn(tutors, c).length > 0) && wrong.length === 0,
  `tabs: ${tabs.map((c) => `${c.name} (${tutorsIn(tutors, c).length})`).join(', ')}${wrong.length ? ` — misfiled: ${wrong.join('; ')}` : ''}`)

// No tutor's course falls outside every category (they would be unreachable from the tabs).
const mapped = new Set(CATEGORIES.flatMap((c) => c.subjects))
const orphans = [...new Set(tutors.flatMap((t) => t.courses.map(([code]) => code)).filter((code) => !mapped.has(subjectOf(code))))]
step(4, orphans.length === 0, orphans.length ? `courses in no category: ${orphans.join(', ')}` : 'every tutor course belongs to a category')

// "Popular" is ordered by sessions.
const popular = byPopularity(tutors)
step(5, popular.every((t, i) => i === 0 || popular[i - 1]!.sessions >= t.sessions),
  `popular: ${popular.slice(0, 3).map((t) => `${t.name} (${t.sessions})`).join(', ')}`)

// The "For you" carousel is for THIS student, and is not the popular list again (ERR-010).
const picked = forYou(tutors, me?.courses ?? [], me?.major ?? null)
const mine = (me?.courses ?? []).map((c) => c.toLowerCase())
const onTopic = !picked || picked.title !== 'For your courses' || picked.picks.every((p) => mine.includes(p.course.toLowerCase()))
step(6, onTopic, picked
  ? `${picked.title}: ${picked.picks.map((p) => `${p.tutor.name} · ${p.course}`).join(', ')} (student takes ${me?.courses?.join(', ') || 'nothing'})`
  : `no carousel — no tutor for ${me?.courses?.join(', ') || 'no courses'} or major ${me?.major ?? 'unset'}`)

// With a course a seeded tutor teaches, the carousel is exactly that course's tutors.
const some = tutors[0]!.courses[0]![0]
const forThat = forYou(tutors, [some], null)
const expected = tutors.filter((t) => t.courses.some(([code]) => code === some)).length
step(7, forThat?.title === 'For your courses' && forThat.picks.length === expected && forThat.picks.every((p) => p.course === some),
  `a student taking ${some} sees ${forThat?.picks.length ?? 0} of ${expected} tutors for it`)

await auth.signOut()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
