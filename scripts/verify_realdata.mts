// Integration check for the "kill the dummy data" work: drives the REAL @noot/core
// against the live local stack and exercises the NEW read paths — tutor availability,
// tutorStats, studentStats, and the extended resolve-participants shape.
//   node --experimental-strip-types scripts/verify_realdata.mts
import { initSupabase, api, auth } from '../packages/core/src/index.ts';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

let pass = 0;
let fail = 0;
async function check(name: string, fn: () => Promise<unknown>) {
  try {
    const r = await fn();
    console.log(`✅ ${name}: ${JSON.stringify(r)?.slice(0, 200)}`);
    pass++;
  } catch (e) {
    console.log(`❌ ${name}: ${(e as Error).message}`);
    fail++;
  }
}

// Mirror of apps/mobile/lib/availability.ts slot count (windows → hourly starts).
function slotCount(windows: { dayOfWeek: number; startTime: string; endTime: string }[]): number {
  const hm = (s: string) => { const [h, m] = s.split(':').map(Number); return (h ?? 0) * 60 + (m ?? 0); };
  let n = 0;
  for (const w of windows) for (let t = hm(w.startTime); t < hm(w.endTime); t += 60) n++;
  return n;
}

initSupabase({ url: URL, anonKey: ANON });

// ---- Student side ----
await check('devSignIn(student)', async () => {
  const r = await auth.devSignIn('student@crimson.ua.edu', 'password123');
  if (!r.ok) throw new Error(r.error);
  return { ok: true };
});

let tutors: any[] = [];
await check('tutors.search()', async () => (tutors = await api.tutors.search()) && `${tutors.length} approved`);

await check('getAvailability(Sara) → windows + hourly slots', async () => {
  const sara = tutors.find((t) => t.firstName === 'Sara') ?? tutors[0];
  const w = await api.tutors.getAvailability(sara.userId);
  if (w.length === 0) throw new Error('Sara has no availability windows');
  const slots = slotCount(w);
  if (slots === 0) throw new Error('windows produced zero slots');
  return { tutor: sara.firstName, windows: w.length, hourlySlots: slots };
});

await check('≥5 demo tutors have real availability', async () => {
  const counts = await Promise.all(tutors.map((t) => api.tutors.getAvailability(t.userId).then((w) => w.length)));
  const withAvail = counts.filter((c) => c > 0).length;
  if (withAvail < 5) throw new Error(`only ${withAvail} tutors have availability`);
  return `${withAvail}/${tutors.length} tutors have availability (rest show an honest empty state)`;
});

await check('studentStats()', async () => {
  const s = await api.studentStats();
  if (typeof s.sessionsCompleted !== 'number' || typeof s.hoursLearned !== 'number') throw new Error('bad shape');
  return s;
});

// ---- Tutor side ----
await check('devSignIn(tutor sara)', async () => {
  const r = await auth.devSignIn('sara@crimson.ua.edu', 'password123');
  if (!r.ok) throw new Error(r.error);
  return { ok: true };
});

await check('tutorStats()', async () => {
  const s = await api.tutorStats();
  if (typeof s.sessionsTaught !== 'number' || typeof s.cancelRate !== 'number') throw new Error('bad shape');
  return s;
});

await check('resolveParticipantNames() returns a map (0 ok — no bookings seeded)', async () => {
  const map = await api.resolveParticipantNames();
  if (typeof map !== 'object' || map === null) throw new Error('not a map');
  return { counterparts: Object.keys(map).length, sample: Object.values(map)[0] ?? null };
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
