// Throwaway integration check for the catalog-backed pickers: drives api.courses against the
// live local stack, including the search patterns the UI actually issues.
//   pnpm dlx tsx scripts/verify_course_catalog.mts
import { initSupabase, api, auth } from '../packages/core/src/index.ts';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
}

initSupabase({ url: URL, anonKey: ANON });

// Signed OUT first: course search runs before signup (the landing/browse path), and the
// 0023 policy has no `to` clause, so anon must be able to read the catalog.
const anonHits = await api.courses.search('MATH', 5);
check('anon can search the catalog', anonHits.length > 0, `${anonHits.length} hits`);

const signIn = await auth.signInWithPassword('student@crimson.ua.edu', 'password123');
if (!signIn.ok) throw new Error(signIn.error);

// The three ways a student might look for the same class.
const byCode = await api.courses.search('MATH 125', 10);
check('search by exact code', byCode.some((c) => c.courseCode === 'MATH 125'), byCode[0]?.courseCode ?? 'none');

const byPartial = await api.courses.search('math 12', 10);
check('search by partial code, case-insensitive', byPartial.length > 0, `${byPartial.length} hits`);

const byTitle = await api.courses.search('calculus', 10);
check('search by course TITLE (the point of the catalog)', byTitle.length > 0,
  byTitle.slice(0, 2).map((c) => `${c.courseCode} ${c.courseTitle}`).join(' | '));

const bySubject = await api.courses.search('chemistry', 10);
check('search by subject name', bySubject.length > 0, `${bySubject.length} hits`);

// ERR-008 / ERR-009: typing a subject code lists THAT subject's courses first — not every
// course whose title happens to contain the letters (MATH used to lead with CEE, CS and EC).
const subj = await api.courses.search('MATH', 20);
check('"MATH" lists MATH courses first', subj.length > 0 && subj.slice(0, Math.min(10, subj.length)).every((c) => c.courseCode.startsWith('MATH ')),
  subj.slice(0, 5).map((c) => c.courseCode).join(', '));
const level = await api.courses.search('MATH 2', 20);
check('"MATH 2" narrows to the 200 level', level.length > 0 && level.every((c) => c.courseCode.startsWith('MATH 2')),
  level.map((c) => c.courseCode).join(', '));
const noSpace = await api.courses.search('math125', 5);
check('"math125" (no space) finds MATH 125', noSpace[0]?.courseCode === 'MATH 125', noSpace[0]?.courseCode ?? 'none');
const short = await api.courses.search('CS', 20);
check('"CS" lists CS courses first', short.length > 0 && short[0]!.courseCode.startsWith('CS'),
  short.slice(0, 5).map((c) => c.courseCode).join(', '));

// Rows must carry the metadata the picker renders.
const one = byCode.find((c) => c.courseCode === 'MATH 125');
check('result carries title + subject for display', !!one?.courseTitle && !!one?.subjectName,
  one ? `${one.courseTitle} / ${one.subjectName}` : 'missing');

// Limit is honoured — a bare prefix matches hundreds and must not stream them all.
const capped = await api.courses.search('a', 5);
check('limit is enforced', capped.length <= 5, `${capped.length} rows`);

// Nonsense must return nothing rather than erroring, so the picker can say "no match".
check('no match returns empty, not an error', (await api.courses.search('zzzzqqq', 5)).length === 0);

// Input that would otherwise be read as PostgREST filter syntax must not blow up the query.
for (const nasty of ['a,b', 'x)', '*', 'math(125)', "o'brien"]) {
  let ok = true;
  try { await api.courses.search(nasty, 3); } catch { ok = false; }
  check(`punctuation "${nasty}" doesn't break the query`, ok);
}

// byCodes: what the saved-course list uses to show a real title.
const byCodes = await api.courses.byCodes(['MATH 125', 'math 125', 'NOPE 999']);
check('byCodes resolves and de-dupes case-insensitively', !!byCodes['MATH 125'], Object.keys(byCodes).join(','));
check('byCodes omits codes that do not exist', !byCodes['NOPE 999']);
check('byCodes of nothing is empty', Object.keys(await api.courses.byCodes([])).length === 0);

// Subject list for the Major picker.
const subjects = await api.courses.listSubjects();
check('listSubjects returns a subject list', subjects.length > 0, `${subjects.length} subjects`);
// Dataset-agnostic invariant: whatever the catalog holds, every subject a search surfaces must
// be offerable in the Major picker. (An earlier version asserted >50, which only held against
// production's 132 and failed on the smaller local seed — the assertion was wrong, not the code.)
const sampled = [...new Set((await api.courses.search('', 200)).map((c) => c.subjectName))];
const missing = sampled.filter((s) => !subjects.includes(s));
check('every subject seen in the catalog is in the subject list', missing.length === 0, missing.join(', ') || 'none missing');
check('subjects are de-duplicated', new Set(subjects).size === subjects.length);
check('subjects are sorted', [...subjects].sort().join('|') === subjects.join('|'));

console.log(`\n${fail === 0 ? '✅ all' : `❌ ${fail} failed,`} ${pass} passed`);
process.exit(fail === 0 ? 0 : 1);
