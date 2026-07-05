// Throwaway integration check: drives the REAL @noot/core auth+api against the
// live local Supabase stack. Run with:
//   node --experimental-strip-types scripts/verify_backend.mts
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
    console.log(`✅ ${name}: ${JSON.stringify(r)?.slice(0, 160)}`);
    pass++;
  } catch (e) {
    console.log(`❌ ${name}: ${(e as Error).message}`);
    fail++;
  }
}

initSupabase({ url: URL, anonKey: ANON });

// 1. auth: dev sign-in as the seeded student
await check('auth.devSignIn(student)', async () => {
  const r = await auth.devSignIn('student@crimson.ua.edu', 'password123');
  if (!r.ok) throw new Error(r.error);
  return r;
});
await check('auth.getSessionUserId', () => auth.getSessionUserId());

// 2. profile
let me: any;
await check('api.getMe', async () => (me = await api.getMe()) && { id: me.id, name: `${me.firstName} ${me.lastName}` });

// 3. tutor search (all + by course)
let tutors: any[] = [];
await check('api.tutors.search()', async () => (tutors = await api.tutors.search()) && `${tutors.length} approved tutors`);
await check("api.tutors.search({course:'MGT 300'})", async () => {
  const r = await api.tutors.search({ course: 'MGT 300' });
  return `${r.length} for MGT 300`;
});
await check('api.tutors.getById(first)', () => api.tutors.getById(tutors[0].userId).then((t: any) => t?.firstName));

// 4. save / list / unsave  (RLS: student writing own saved_tutors)
const targetTutor = tutors[0].userId;
await check('api.tutors.save', () => api.tutors.save(targetTutor));
await check('api.tutors.listSaved', () => api.tutors.listSaved().then((s: any[]) => `${s.length} saved`));
await check('api.tutors.unsave', () => api.tutors.unsave(targetTutor));

// 5. chat: create convo, send + read a message, list
let convo: any;
await check('api.chat.getOrCreateConversation', async () => (convo = await api.chat.getOrCreateConversation(targetTutor)) && convo.id);
await check('api.chat.sendMessage', () => api.chat.sendMessage(convo.id, 'verify ping').then((m: any) => m.id));
await check('api.chat.listMessages', () => api.chat.listMessages(convo.id).then((m: any[]) => `${m.length} msgs`));
await check('api.chat.listConversations', () => api.chat.listConversations().then((c: any[]) => `${c.length} convos`));

// 6. bookings (expect 0, but query must succeed)
await check('api.listUpcoming', () => api.listUpcoming().then((b: any[]) => `${b.length} upcoming`));

await auth.signOut();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
