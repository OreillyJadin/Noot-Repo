// Integration check for the 0060 admin audit log: every admin mutation path — the four
// admin Edge Functions, the interview RPCs and the direct is_admin() RLS writes — must
// leave EXACTLY ONE correct row in public.admin_actions, and nothing else may write one.
//
// Needs the local stack plus the edge runtime for the four functions:
//   supabase functions serve admin-set-user-status approve-tutor moderate-review resolve-dispute
//   pnpm dlx tsx scripts/verify_admin_audit.mts
//
// Note: admin_actions rows can't be deleted (that's the point), so rows from earlier runs
// stay — every assertion filters on target + created_at >= this run's start.
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
const START = new Date().toISOString();
let adminId = '';

interface AuditRow {
  actor_id: string; action: string; target_type: string | null; target_id: string | null;
  details: Record<string, unknown>; created_at: string;
}
const rowsFor = async (targetType: string, targetId: string, action?: string): Promise<AuditRow[]> => {
  let q = svc.from('admin_actions').select('*')
    .eq('target_type', targetType).eq('target_id', targetId).gte('created_at', START);
  if (action) q = q.eq('action', action);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as AuditRow[];
};
// The single assertion shape used everywhere below: exactly one row, written by the admin.
const expectOne = async (name: string, targetType: string, targetId: string, action: string,
  detailsOk?: (d: Record<string, unknown>) => boolean) => {
  const rows = await rowsFor(targetType, targetId, action);
  const one = rows.length === 1 && rows[0].actor_id === adminId && rows[0].action === action;
  const det = detailsOk ? rows.length === 1 && detailsOk(rows[0].details) : true;
  check(name, one && det,
    rows.length === 1 ? JSON.stringify(rows[0].details) : `${rows.length} rows`);
};
const expectNone = async (name: string, targetType: string, targetId: string, action?: string) => {
  const rows = await rowsFor(targetType, targetId, action);
  check(name, rows.length === 0, `${rows.length} rows`);
};
const newUser = async (tag: string) => {
  const { data, error } = await svc.auth.admin.createUser({
    email: `audit+${tag}${Date.now()}@crimson.ua.edu`, password: 'password123', email_confirm: true,
  });
  if (error) throw error;
  return data.user!.id;
};

initSupabase({ url: URL, anonKey: ANON });
const adminIn = await auth.signInWithPassword('admin@crimson.ua.edu', 'password123');
if (!adminIn.ok) throw new Error(`admin sign-in: ${adminIn.error}`);
adminId = (await auth.getSessionUserId())!;
const asAdmin = () => getSupabase(); // the shared client, signed in as the admin
console.log(`admin ${adminId}, window from ${START}\n`);

const { data: saraRow } = await svc.from('users').select('id').eq('email', 'sara@crimson.ua.edu').single();
const saraId = saraRow!.id as string;

// ---------- Edge Function: admin-set-user-status ----------
const studentUid = await newUser('student');
await api.admin.setUserStatus(studentUid, 'suspended');
await expectOne('setUserStatus suspended → user.suspend', 'user', studentUid, 'user.suspend',
  (d) => d.status === 'suspended');
await api.admin.setUserStatus(studentUid, 'active');
await expectOne('setUserStatus active → user.reactivate', 'user', studentUid, 'user.reactivate',
  (d) => d.status === 'active');

// ---------- Edge Function: approve-tutor ----------
const applicantUid = await newUser('applicant');
await svc.from('tutor_profiles').upsert(
  { user_id: applicantUid, bio: 'applied', subjects: ['MGT 300'], hourly_rate: 25, submitted_at: new Date().toISOString() },
  { onConflict: 'user_id' });
await api.admin.approveTutor(applicantUid, 'approved');
await expectOne('approveTutor approved → tutor.approve', 'user', applicantUid, 'tutor.approve',
  (d) => d.decision === 'approved');
await api.admin.approveTutor(applicantUid, 'rejected');
await expectOne('approveTutor rejected → tutor.reject', 'user', applicantUid, 'tutor.reject',
  (d) => d.decision === 'rejected');
await svc.from('tutor_profiles').update({ transcript_url: 'audit/transcript.pdf' }).eq('user_id', applicantUid);
await api.admin.verifyTutorGrades(applicantUid);
await expectOne('verifyTutorGrades → tutor.verify_grades', 'user', applicantUid, 'tutor.verify_grades',
  (d) => d.verify_grades === true);

// ---------- definer RPCs ----------
const iv = await api.admin.scheduleInterview(applicantUid, new Date(Date.now() + 86400000).toISOString(), 'audit');
await expectOne('scheduleInterview → interview.schedule', 'user', applicantUid, 'interview.schedule',
  (d) => d.interview_id === iv.id);
await api.admin.cancelInterview(applicantUid);
await expectOne('cancelInterview → interview.cancel', 'user', applicantUid, 'interview.cancel',
  (d) => typeof d.scheduled_at === 'string');

// ---------- Edge Function: moderate-review ----------
const { data: booking } = await svc.from('bookings').insert({
  student_id: studentUid, tutor_id: saraId, subject: 'MGT 300',
  scheduled_at: new Date(Date.now() + 86400000).toISOString(), duration_minutes: 60,
  price: 25, tutor_payout_amount: 20, session_type: 'video',
  cancellation_deadline: new Date(Date.now() + 3600000).toISOString(),
}).select('id').single();
const { data: review } = await svc.from('reviews').insert({
  booking_id: booking!.id, reviewer_id: studentUid, subject_user_id: saraId, rating: 5, comment: 'audit',
}).select('id').single();
await api.admin.moderateReview(review!.id, 'approved');
await expectOne('moderateReview approved → review.approve', 'review', review!.id, 'review.approve',
  (d) => d.decision === 'approved' && d.subject_user_id === saraId);
await api.admin.moderateReview(review!.id, 'rejected');
await expectOne('moderateReview rejected → review.reject', 'review', review!.id, 'review.reject',
  (d) => d.decision === 'rejected');

// ---------- Edge Function: resolve-dispute ----------
await api.admin.resolveDispute(booking!.id, 'flag', { reason: 'audit flag' });
await expectOne('resolveDispute flag → dispute.flag', 'booking', booking!.id, 'dispute.flag',
  (d) => d.dispute_status === 'flagged' && d.reason === 'audit flag'
    && d.student_id === studentUid && d.tutor_id === saraId);
await api.admin.resolveDispute(booking!.id, 'resolve', { resolution: 'audit resolved' });
await expectOne('resolveDispute resolve → dispute.resolve', 'booking', booking!.id, 'dispute.resolve',
  (d) => d.dispute_status === 'resolved' && d.resolution === 'audit resolved');

// ---------- direct write: content_reports UPDATE ----------
const { data: report } = await svc.from('content_reports').insert({
  reporter_id: studentUid, target_kind: 'user', target_user_id: applicantUid, reason: 'spam',
}).select('id').single();
await api.admin.resolveReport(report!.id, 'actioned');
await expectOne('resolveReport → report.actioned', 'content_report', report!.id, 'report.actioned',
  (d) => d.old_status === 'open' && d.new_status === 'actioned' && d.subject_user_id === applicantUid);

// ---------- direct write: user_roles DELETE ----------
await svc.from('user_roles').insert({ user_id: studentUid, role: 'ambassador' });
await asAdmin().from('user_roles').delete().eq('user_id', studentUid).eq('role', 'ambassador');
await expectOne('admin deletes a role → user_role.remove', 'user', studentUid, 'user_role.remove',
  (d) => d.role === 'ambassador');

// ---------- direct write: tutor_profiles UPDATE (changed column names only) ----------
await asAdmin().from('tutor_profiles').update({ bio: `audit bio ${Date.now()}` }).eq('user_id', applicantUid);
await expectOne('admin edits tutor profile → tutor_profile.update', 'user', applicantUid, 'tutor_profile.update',
  (d) => Array.isArray(d.changed) && (d.changed as string[]).includes('bio'));

// ---------- direct write: ambassador_profiles UPDATE ----------
await svc.from('ambassador_profiles').insert({ user_id: studentUid, referral_code: `AUDIT${Date.now() % 100000}` });
await asAdmin().from('ambassador_profiles').update({ referral_code: `AUDITX${Date.now() % 100000}` }).eq('user_id', studentUid);
await expectOne('admin edits ambassador profile → ambassador_profile.update', 'user', studentUid,
  'ambassador_profile.update',
  (d) => Array.isArray(d.changed) && (d.changed as string[]).includes('referral_code'));

// ---------- direct write: blocked_terms ----------
const term = `auditterm${Date.now()}`;
await asAdmin().from('blocked_terms').insert({ term, category: 'harassment' });
await expectOne('admin adds term → blocked_term.add', 'blocked_term', term, 'blocked_term.add',
  (d) => d.category === 'harassment');
await asAdmin().from('blocked_terms').update({ category: 'slur' }).eq('term', term);
await expectOne('admin edits term → blocked_term.update', 'blocked_term', term, 'blocked_term.update',
  (d) => d.category === 'slur');
await asAdmin().from('blocked_terms').delete().eq('term', term);
await expectOne('admin removes term → blocked_term.remove', 'blocked_term', term, 'blocked_term.remove',
  (d) => d.category === 'slur');

// ---------- negatives ----------
// An admin editing their OWN profiles is not an admin action (guard: old.user_id <> actor).
// Restore the admin's rows exactly afterwards: delete rows we created, restore ones we
// overwrote — nothing in this block may outlive the run.
const { data: adminTpBefore } = await svc.from('tutor_profiles').select('bio').eq('user_id', adminId).maybeSingle();
await svc.from('tutor_profiles').upsert({ user_id: adminId, bio: 'admin bio' }, { onConflict: 'user_id' });
await asAdmin().from('tutor_profiles').update({ bio: `own bio ${Date.now()}` }).eq('user_id', adminId);
await expectNone('admin editing OWN tutor profile logs nothing', 'user', adminId, 'tutor_profile.update');
if (adminTpBefore) {
  await svc.from('tutor_profiles').update({ bio: adminTpBefore.bio }).eq('user_id', adminId);
} else {
  await svc.from('tutor_profiles').delete().eq('user_id', adminId);
}

const { data: adminApBefore } = await svc.from('ambassador_profiles').select('referral_code').eq('user_id', adminId).maybeSingle();
await svc.from('ambassador_profiles').upsert({ user_id: adminId, referral_code: 'ADMINAUDIT' }, { onConflict: 'user_id' });
await asAdmin().from('ambassador_profiles').update({ referral_code: 'ADMINAUDIT2' }).eq('user_id', adminId);
await expectNone('admin editing OWN ambassador profile logs nothing', 'user', adminId, 'ambassador_profile.update');
if (adminApBefore) {
  await svc.from('ambassador_profiles').update({ referral_code: adminApBefore.referral_code }).eq('user_id', adminId);
} else {
  await svc.from('ambassador_profiles').delete().eq('user_id', adminId);
}

// A service-role write to a trigger-watched table is logged by the Edge Function itself,
// never by the trigger (auth.uid() is null) — no double-logging.
const beforeSvc = (await rowsFor('user', applicantUid, 'tutor_profile.update')).length;
await svc.from('tutor_profiles').update({ bio: `svc bio ${Date.now()}` }).eq('user_id', applicantUid);
check('service-role tutor_profiles write logs nothing',
  (await rowsFor('user', applicantUid, 'tutor_profile.update')).length === beforeSvc);

// A FAILED admin call leaves no row: admins can't set their own status (400).
await api.admin.setUserStatus(adminId, 'banned').catch(() => {});
await expectNone('failed setUserStatus (own id) logs nothing', 'user', adminId, 'user.ban');

// ---------- walls ----------
const student = createClient(URL, ANON, { auth: { persistSession: false } });
await student.auth.signInWithPassword({ email: 'student@crimson.ua.edu', password: 'password123' });
{
  const { data, error } = await student.from('admin_actions').select('id');
  check('student select sees nothing', !error && (data ?? []).length === 0,
    error ? error.message : `${(data ?? []).length} rows`);
  const ins = await student.from('admin_actions').insert({ actor_id: adminId, action: 'x' });
  check('student insert fails', !!ins.error, ins.error?.message ?? 'no error');
  const upd = await student.from('admin_actions').update({ action: 'x' }).eq('actor_id', adminId);
  check('student update fails', !!upd.error, upd.error?.message ?? 'no error');
  const del = await student.from('admin_actions').delete().eq('actor_id', adminId);
  check('student delete fails', !!del.error, del.error?.message ?? 'no error');
}
const adminClient = createClient(URL, ANON, { auth: { persistSession: false } });
await adminClient.auth.signInWithPassword({ email: 'admin@crimson.ua.edu', password: 'password123' });
{
  const { data, error } = await adminClient.from('admin_actions').select('id').gte('created_at', START);
  check('admin select sees the new rows', !error && (data ?? []).length >= 15, `${(data ?? []).length} rows`);
  const upd = await adminClient.from('admin_actions').update({ action: 'x' }).gte('created_at', START);
  check('admin update fails (append-only)', !!upd.error, upd.error?.message ?? 'no error');
  const del = await adminClient.from('admin_actions').delete().gte('created_at', START);
  check('admin delete fails (append-only)', !!del.error, del.error?.message ?? 'no error');
}
{
  // Even service_role loses UPDATE/DELETE on the log — only the postgres role can remove rows.
  const upd = await svc.from('admin_actions').update({ action: 'x' }).gte('created_at', START);
  check('service-role update fails', !!upd.error, upd.error?.message ?? 'no error');
  const del = await svc.from('admin_actions').delete().gte('created_at', START);
  check('service-role delete fails', !!del.error, del.error?.message ?? 'no error');
  const { data: intact } = await svc.from('admin_actions').select('id').gte('created_at', START);
  check('log rows intact after all the attempts', (intact ?? []).length >= 15, `${(intact ?? []).length} rows`);
}

// ---------- cleanup (audit rows themselves can never be deleted — by design) ----------
await svc.from('reviews').delete().eq('id', review!.id);
await svc.from('bookings').delete().eq('id', booking!.id);
await svc.from('content_reports').delete().eq('id', report!.id);
await svc.from('ambassador_profiles').delete().eq('user_id', studentUid);
for (const uid of [studentUid, applicantUid]) {
  await svc.auth.admin.deleteUser(uid);
  await svc.from('users').delete().eq('id', uid);
}

console.log(`\n${fail === 0 ? '✅ all' : `❌ ${fail} failed,`} ${pass} passed`);
process.exit(fail === 0 ? 0 : 1);
