// Throwaway integration check for report + block (App Store Guideline 1.2).
//
// The assertion that matters is that blocking is enforced by the DATABASE, not the UI: a
// blocked pair must be physically unable to write to their conversation even when the client
// calls sendMessage directly.
//   pnpm dlx tsx scripts/verify_moderation.mts
import { createClient } from '@supabase/supabase-js';
import { initSupabase, api, auth, getSupabase } from '../packages/core/src/index.ts';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '✅' : '❌'} ${n}${d ? ` — ${d}` : ''}`);
  ok ? pass++ : fail++;
};
const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });
const signIn = async (email: string) => {
  const r = await auth.signInWithPassword(email, 'password123');
  if (!r.ok) throw new Error(`${email}: ${r.error}`);
  return (await auth.getSessionUserId())!;
};

initSupabase({ url: URL, anonKey: ANON });

// Clean slate — this pair may be blocked from an earlier run.
const { data: sRow } = await svc.from('users').select('id').eq('email', 'student@crimson.ua.edu').single();
const { data: tRow } = await svc.from('users').select('id').eq('email', 'sara@crimson.ua.edu').single();
const studentId = sRow!.id as string, tutorId = tRow!.id as string;
await svc.from('user_blocks').delete().or(`blocker_id.eq.${studentId},blocker_id.eq.${tutorId}`);

// --- reporting ---------------------------------------------------------------------------
await signIn('student@crimson.ua.edu');
const conv = await api.chat.getOrCreateConversation(tutorId);
const msg = await api.chat.sendMessage(conv.id, `report me ${Date.now()}`);

await api.moderation.reportMessage(msg.id, 'harassment', 'test detail');
const { data: mReports } = await svc.from('content_reports').select('*').eq('target_message_id', msg.id);
check('reportMessage files an open report', (mReports ?? []).length === 1 && mReports![0].status === 'open');
check('report records reason + reporter', mReports?.[0]?.reason === 'harassment' && mReports?.[0]?.reporter_id === studentId);

await api.moderation.reportUser(tutorId, 'spam');
const { data: uReports } = await svc.from('content_reports').select('id').eq('target_kind', 'user').eq('target_user_id', tutorId);
check('reportUser files a report', (uReports ?? []).length >= 1);

let selfReport = false;
try { await api.moderation.reportUser(studentId, 'other'); } catch { selfReport = true; }
check('cannot report yourself', selfReport);

// --- blocking is enforced by the DB ------------------------------------------------------
check('not blocked before blocking', (await api.moderation.isBlocked(tutorId)) === false);
await api.moderation.blockUser(tutorId);
check('isBlocked true after blocking', (await api.moderation.isBlocked(tutorId)) === true);

let blockerSendFailed = false;
try { await api.chat.sendMessage(conv.id, 'still here'); } catch { blockerSendFailed = true; }
check('BLOCKER cannot send (RLS, not UI)', blockerSendFailed);

// The blocked party must be stopped too — symmetric, so blocking is not a one-way mute.
await signIn('sara@crimson.ua.edu');
check('blocked party also sees isBlocked', (await api.moderation.isBlocked(studentId)) === true);
let blockedSendFailed = false;
try { await api.chat.sendMessage(conv.id, 'let me in'); } catch { blockedSendFailed = true; }
check('BLOCKED party cannot send either', blockedSendFailed);

// --- blocked users disappear from search -------------------------------------------------
await signIn('student@crimson.ua.edu');
check('blocked tutor is gone from search', !(await api.tutors.search({})).some((x) => x.userId === tutorId));
const blockedList = await api.moderation.listBlocked();
check('listBlocked returns them with a name', blockedList.some((p) => p.id === tutorId), blockedList.map((p) => p.firstName).join(','));

// --- unblock restores everything ---------------------------------------------------------
await api.moderation.unblockUser(tutorId);
check('isBlocked false after unblock', (await api.moderation.isBlocked(tutorId)) === false);
check('tutor reappears in search', (await api.tutors.search({})).some((x) => x.userId === tutorId));
const after = await api.chat.sendMessage(conv.id, 'unblocked, hello');
check('messaging works again after unblock', !!after.id);

// --- who can see the queue ----------------------------------------------------------------
// The reporter CAN read their own reports back — that is deliberate, so the UI can say
// "already reported". The invariant is that an UNRELATED user sees nothing. (An earlier
// revision asserted the reporter saw zero, which failed for the wrong reason.)
const ownReports = await api.admin.listReports().catch(() => []);
check('reporter can read back their own reports', ownReports.length >= 2, `${ownReports.length} rows`);

await signIn('devon@crimson.ua.edu');
const unrelated = await api.admin.listReports().catch(() => []);
check('an UNRELATED non-admin sees no reports at all', unrelated.length === 0, `${unrelated.length} rows`);

await signIn('admin@crimson.ua.edu');
const queue = await api.admin.listReports();
check('admin sees the open queue', queue.length >= 2, `${queue.length} open`);
const mine = queue.find((r) => r.targetMessageId === msg.id);
check('queue row carries reporter + message text', !!mine?.reporterName && !!mine?.messageContent,
  mine ? `${mine.reporterName}: "${mine.messageContent}"` : 'missing');

await api.admin.resolveReport(mine!.id, 'actioned');
const { data: resolved } = await svc.from('content_reports').select('status, reviewed_by').eq('id', mine!.id).single();
check('admin can resolve a report', resolved?.status === 'actioned' && !!resolved?.reviewed_by);
check('resolved report leaves the open queue',
  !(await api.admin.listReports()).some((r) => r.id === mine!.id));

// A non-admin must not be able to close a report.
await signIn('student@crimson.ua.edu');
const stillOpen = queue.find((r) => r.id !== mine!.id);
if (stillOpen) {
  await api.admin.resolveReport(stillOpen.id, 'dismissed').catch(() => {});
  const { data: untouched } = await svc.from('content_reports').select('status').eq('id', stillOpen.id).single();
  check('non-admin cannot resolve a report', untouched?.status === 'open', String(untouched?.status));
}

// cleanup
await svc.from('content_reports').delete().or(`reporter_id.eq.${studentId},reporter_id.eq.${tutorId}`);
await svc.from('user_blocks').delete().or(`blocker_id.eq.${studentId},blocker_id.eq.${tutorId}`);

console.log(`\n${fail === 0 ? '✅ all' : `❌ ${fail} failed,`} ${pass} passed`);
process.exit(fail === 0 ? 0 : 1);
