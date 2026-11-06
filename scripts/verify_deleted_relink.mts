// Verify deleted-account relinking and signup blocking against the LOCAL Supabase stack.
// Needs: supabase start && node supabase/seed_demo.mjs && supabase functions serve
//   pnpm dlx tsx scripts/verify_deleted_relink.mts
import { createHash, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { api, auth, initSupabase } from '../packages/core/src/index.ts';
import { DEV_PASSWORD } from './_devPassword.mjs';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const svc = createClient(URL, SERVICE, options);
const anon = () => createClient(URL, ANON, options);
const localHost = ['127.0.0.1', 'localhost'].includes(new globalThis.URL(URL).hostname);
if (!localHost) throw new Error(`Refusing to run against non-local Supabase: ${new globalThis.URL(URL).hostname}`);

let passed = 0;
let failed = 0;
const check = (name: string, ok: unknown, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  ok ? passed++ : failed++;
};
const canonicalEmail = (email: string) => {
  const normalized = email.trim().toLowerCase();
  const at = normalized.indexOf('@');
  return at < 0 ? normalized : `${normalized.slice(0, at).split('+', 1)[0]}${normalized.slice(at)}`;
};
const expectedHash = (email: string) =>
  createHash('sha256').update(canonicalEmail(email), 'utf8').digest('hex');
const legacyHash = (email: string) =>
  createHash('sha256').update(email.trim().toLowerCase(), 'utf8').digest('hex');

const ids: string[] = [];
const bookingIds: string[] = [];
const tag = randomUUID();
const activeEmail = `deleted-relink-${tag}@crimson.ua.edu`;
const bannedEmail = `deleted-banned-${tag}@crimson.ua.edu`;
const statusEmail = `status-block-${tag}@crimson.ua.edu`;
const deletedStatusEmail = `deleted-status-${tag}@crimson.ua.edu`;
const minorEmail = `minor-relink-${tag}@crimson.ua.edu`;
const suspendedDobEmail = `suspended-dob-${tag}@crimson.ua.edu`;
let oldId: string | null = null;
let rejoinedId: string | null = null;
let bannedId: string | null = null;

async function createUser(email: string) {
  const { data, error } = await svc.auth.admin.createUser({ email, password: DEV_PASSWORD, email_confirm: true });
  if (error || !data.user) throw error ?? new Error('Auth user was not created');
  ids.push(data.user.id);
  const client = anon();
  const login = await client.auth.signInWithPassword({ email, password: DEV_PASSWORD });
  if (login.error || !login.data.session) throw login.error ?? new Error('Test user did not receive a session');
  return { id: data.user.id, token: login.data.session.access_token };
}

async function deleteAccount(token: string) {
  const response = await fetch(`${URL}/functions/v1/delete-account`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  return { status: response.status, body: await response.json().catch(() => ({})) as { error?: string } };
}

try {
  const active = await createUser(activeEmail);
  oldId = active.id;
  const livePlusEmail = activeEmail.replace('@', '+second@');
  const livePlusCheck = await anon().rpc('check_signup_email', { p_email: livePlusEmail });
  check('check_signup_email does not reveal a live account through its plus-address',
    !livePlusCheck.error && livePlusCheck.data === true);
  const livePlusSignup = await anon().auth.signUp({ email: livePlusEmail, password: DEV_PASSWORD });
  const livePlusRow = await svc.from('users').select('id').eq('email', livePlusEmail).maybeSingle();
  if (livePlusRow.data?.id) ids.push(livePlusRow.data.id);
  check('live plus-address signup is rejected by the Auth insert trigger',
    !!livePlusSignup.error && !livePlusRow.data);

  const deletion = await deleteAccount(active.token);
  check('active account deletes successfully', deletion.status === 200, deletion.body.error ?? '');

  const stored = await svc.from('deleted_account_emails')
    .select('email_hash,user_id,deleted_at').eq('user_id', active.id).maybeSingle();
  check('deletion records the normalized one-way email hash',
    !stored.error && stored.data?.user_id === active.id &&
      stored.data.email_hash === await expectedHash(activeEmail) &&
      Number.isFinite(Date.parse(stored.data.deleted_at)));

  const variant = `  ${activeEmail.toUpperCase()}  `;
  const signupCheck = await anon().rpc('check_signup_email', { p_email: variant });
  check('active deleted email remains eligible before an admin block',
    !signupCheck.error && signupCheck.data === true);

  const signupEmail = variant.trim();
  const rejoin = await anon().auth.signUp({ email: signupEmail, password: DEV_PASSWORD });
  const rejoinedRow = await svc.from('users')
    .select('id,previous_account_ids').eq('email', activeEmail).maybeSingle();
  rejoinedId = rejoin.data.user?.id ?? rejoinedRow.data?.id ?? null;
  if (rejoinedId) ids.push(rejoinedId);
  check('case-variant signup succeeds after the app trims whitespace', !rejoin.error && !!rejoinedId,
    rejoin.error?.message ?? '');
  check('new account links the previous deleted id',
    !!rejoinedRow.data && rejoinedRow.data.previous_account_ids?.length === 1 &&
      rejoinedRow.data.previous_account_ids[0] === active.id);

  const flags = await svc.from('content_reports')
    .select('id,detail').eq('target_kind', 'user').eq('target_user_id', rejoinedId)
    .eq('auto_flagged', true).eq('status', 'open');
  check('re-signup queues exactly one moderation flag',
    !flags.error && flags.data?.length === 1 &&
      flags.data[0]?.detail === 'Re-signed up after deleting an account.');

  const student = anon();
  const studentLogin = await student.auth.signInWithPassword({
    email: 'student@crimson.ua.edu',
    password: DEV_PASSWORD,
  });
  if (studentLogin.error) throw studentLogin.error;
  const hidden = await student.from('deleted_account_emails').select('user_id').eq('user_id', active.id);
  check('plain student cannot read deleted account email rows',
    !!hidden.error || (hidden.data?.length ?? 0) === 0);
  const protectedUpdate = await student.from('users')
    .update({ previous_account_ids: [active.id] }).eq('id', studentLogin.data.user.id);
  check('plain student cannot update their previous_account_ids', !!protectedUpdate.error);
  const forbiddenBlock = await student.rpc('admin_block_deleted_email', { p_user: active.id });
  check('plain student cannot call admin_block_deleted_email', !!forbiddenBlock.error);
  const forbiddenRecord = await student.rpc('record_deleted_account_email', { p_user: active.id });
  check('plain student cannot call record_deleted_account_email', !!forbiddenRecord.error);
  const forbiddenSync = await student.rpc('sync_blocked_signup_email', { p_user: active.id });
  check('plain student cannot call sync_blocked_signup_email', !!forbiddenSync.error);

  const core = initSupabase({ url: URL, anonKey: ANON });
  const adminLogin = await auth.signInWithPassword('admin@crimson.ua.edu', DEV_PASSWORD);
  if (!adminLogin.ok) throw new Error(adminLogin.error);
  const adminRows = await core.from('deleted_account_emails')
    .select('user_id').eq('user_id', active.id);
  check('admin can select deleted account email rows',
    !adminRows.error && adminRows.data?.length === 1);
  const adminHistory = await api.admin.userHistory(rejoinedId!);
  check('admin history returns previous account metrics server-side',
    adminHistory.previousAccounts.length === 1 &&
      adminHistory.previousAccounts[0]?.id === active.id &&
      adminHistory.previousAccounts[0]?.noShows === 0 &&
      adminHistory.previousAccounts[0]?.tutorCancels30d === 0);
  await svc.from('content_reports').delete().eq('target_user_id', rejoinedId);
  await svc.from('user_roles').delete().eq('user_id', rejoinedId);
  await svc.auth.admin.deleteUser(rejoinedId!);
  await svc.from('users').delete().eq('id', rejoinedId);
  await api.admin.blockDeletedEmail(active.id);
  const blocked = await svc.from('blocked_signup_emails')
    .select('email_hash,user_id,status').eq('user_id', active.id).maybeSingle();
  check('admin block copies the deleted email hash with banned status',
    !blocked.error && blocked.data?.email_hash === await expectedHash(activeEmail) &&
      blocked.data.user_id === active.id && blocked.data.status === 'banned');
  const audit = await svc.from('admin_actions').select('action,details')
    .eq('target_type', 'user').eq('target_id', active.id).eq('action', 'deleted_email.block');
  check('admin block writes an audit action', !audit.error && audit.data?.length === 1);

  const blockedSignup = await anon().auth.signUp({ email: signupEmail, password: DEV_PASSWORD });
  check('signup fails after the admin blocks the deleted email', !!blockedSignup.error,
    blockedSignup.error?.message ?? '');

  const banned = await createUser(bannedEmail);
  bannedId = banned.id;
  const setBanned = await svc.from('users').update({ status: 'banned' }).eq('id', banned.id);
  if (setBanned.error) throw setBanned.error;
  const bannedDeletion = await deleteAccount(banned.token);
  const oldBan = await svc.from('blocked_signup_emails')
    .select('email_hash,status').eq('user_id', banned.id).maybeSingle();
  check('banned-then-deleted account still blocks its signup email',
    bannedDeletion.status === 200 && oldBan.data?.status === 'banned' &&
      oldBan.data.email_hash === await expectedHash(bannedEmail));
  const bannedSignup = await anon().auth.signUp({ email: bannedEmail, password: DEV_PASSWORD });
  check('banned-then-deleted raw signup is rejected', !!bannedSignup.error,
    bannedSignup.error?.message ?? '');

  const statusUser = await createUser(statusEmail);
  await api.admin.setUserStatus(statusUser.id, 'banned');
  const statusBlock = await svc.from('blocked_signup_emails')
    .select('email_hash,status').eq('user_id', statusUser.id).maybeSingle();
  const exactBlocked = await anon().rpc('check_signup_email', { p_email: statusEmail });
  const plusBlocked = await anon().rpc('check_signup_email', { p_email: statusEmail.replace('@', '+alias@') });
  const otherDomain = await anon().rpc('check_signup_email', {
    p_email: statusEmail.replace('@crimson.ua.edu', '@ua.edu'),
  });
  check('ban stores the canonical email hash',
    statusBlock.data?.email_hash === await expectedHash(statusEmail) && statusBlock.data.status === 'banned');
  check('ban blocks exact and plus-address variants',
    !exactBlocked.error && exactBlocked.data === false &&
      !plusBlocked.error && plusBlocked.data === false);
  check('canonicalization does not merge ua.edu with crimson.ua.edu',
    !otherDomain.error && otherDomain.data === true);
  const bannedPlusSignup = await anon().auth.signUp({
    email: statusEmail.replace('@', '+signup@'),
    password: DEV_PASSWORD,
  });
  check('Auth rejects plus-address signup after a ban', !!bannedPlusSignup.error);

  await api.admin.setUserStatus(statusUser.id, 'active');
  const statusBlockAfter = await svc.from('blocked_signup_emails')
    .select('email_hash').eq('user_id', statusUser.id);
  const exactUnblocked = await anon().rpc('check_signup_email', { p_email: statusEmail });
  const plusUnblocked = await anon().rpc('check_signup_email', { p_email: statusEmail.replace('@', '+alias@') });
  check('reactivation removes this user from the email blocklist',
    !statusBlockAfter.error && statusBlockAfter.data?.length === 0);
  check('reactivation unblocks the exact email while the account remains live',
    !exactUnblocked.error && exactUnblocked.data === true);
  check('reactivation unblocks the plus-address check without revealing the live account',
    !plusUnblocked.error && plusUnblocked.data === true);
  const statusDeletion = await deleteAccount(statusUser.token);
  const plusAfterReactivation = statusEmail.replace('@', '+alias@');
  const plusAfterReactivationCheck = await anon().rpc('check_signup_email', { p_email: plusAfterReactivation });
  const plusAfterReactivationSignup = await anon().auth.signUp({
    email: plusAfterReactivation,
    password: DEV_PASSWORD,
  });
  const statusRejoinId = plusAfterReactivationSignup.data.user?.id;
  if (statusRejoinId) ids.push(statusRejoinId);
  check('reactivated account can delete and re-sign up with a plus-address',
    statusDeletion.status === 200 &&
      !plusAfterReactivationCheck.error && plusAfterReactivationCheck.data === true &&
      !plusAfterReactivationSignup.error && !!statusRejoinId);

  const legacyPlusEmail = `legacy-${tag}+old@crimson.ua.edu`;
  const legacyRow = await svc.from('blocked_signup_emails').insert({
    email_hash: legacyHash(legacyPlusEmail),
    user_id: statusUser.id,
    status: 'banned',
  });
  const legacyCheck = await anon().rpc('check_signup_email', { p_email: legacyPlusEmail });
  const legacyVariant = await anon().rpc('check_signup_email', { p_email: ` ${legacyPlusEmail.toUpperCase()} ` });
  const legacySignup = await anon().auth.signUp({ email: legacyPlusEmail, password: DEV_PASSWORD });
  check('legacy plus-address hashes still block exact and normalized retries',
    !legacyRow.error &&
      !legacyCheck.error && legacyCheck.data === false &&
      !legacyVariant.error && legacyVariant.data === false &&
      !!legacySignup.error);

  const deletedStatus = await createUser(deletedStatusEmail);
  const deletedStatusResult = await deleteAccount(deletedStatus.token);
  await api.admin.setUserStatus(deletedStatus.id, 'banned');
  const deletedStatusBlock = await svc.from('blocked_signup_emails')
    .select('email_hash,status').eq('user_id', deletedStatus.id).maybeSingle();
  const deletedStatusAudit = await svc.from('admin_actions').select('action')
    .eq('action', 'user.ban').eq('target_id', deletedStatus.id);
  const deletedAuth = await svc.auth.admin.getUserById(deletedStatus.id);
  const deletedStatusCheck = await anon().rpc('check_signup_email', { p_email: deletedStatusEmail });
  check('banning an already-deleted user blocks the recorded canonical hash',
    deletedStatusResult.status === 200 &&
      deletedStatusBlock.data?.email_hash === await expectedHash(deletedStatusEmail) &&
      deletedStatusBlock.data.status === 'banned');
  check('deleted-user ban skips GoTrue but writes the audit action',
    !deletedAuth.data.user && !deletedStatusAudit.error && deletedStatusAudit.data?.length === 1);
  check('deleted-user ban blocks a subsequent signup',
    !deletedStatusCheck.error && deletedStatusCheck.data === false);

  const minor = await createUser(minorEmail);
  const minorClient = anon();
  const minorLogin = await minorClient.auth.signInWithPassword({ email: minorEmail, password: DEV_PASSWORD });
  if (minorLogin.error) throw minorLogin.error;
  const minorDob = `${new Date().getUTCFullYear() - 17}-01-01`;
  const minorDobSet = await minorClient.rpc('confirm_date_of_birth', { p_dob: minorDob });
  check('active user can confirm an under-18 date of birth', !minorDobSet.error && minorDobSet.data === false);
  const minorDeletion = await deleteAccount(minor.token);
  const minorRecord = await svc.from('deleted_account_emails')
    .select('date_of_birth').eq('user_id', minor.id).maybeSingle();
  check('deletion retains the under-18 date of birth',
    minorDeletion.status === 200 && minorRecord.data?.date_of_birth === minorDob);
  const adultRetry = await anon().auth.signUp({
    email: minorEmail,
    password: DEV_PASSWORD,
    options: { data: { date_of_birth: '2000-01-01' } },
  });
  const adultRetryRow = await svc.from('users').select('id').eq('email', minorEmail).maybeSingle();
  if (adultRetryRow.data?.id) ids.push(adultRetryRow.data.id);
  check('under-18 account cannot relink with a different adult DOB',
    !!adultRetry.error && !adultRetryRow.data);

  const suspendedDob = await createUser(suspendedDobEmail);
  await api.admin.setUserStatus(suspendedDob.id, 'suspended');
  const suspendedClient = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${suspendedDob.token}` } },
    auth: options.auth,
  });
  const deniedDob = await suspendedClient.rpc('confirm_date_of_birth', { p_dob: '2000-01-01' });
  const unchangedDob = await svc.from('users').select('date_of_birth').eq('id', suspendedDob.id).single();
  check('suspended live token cannot confirm date of birth',
    !!deniedDob.error && unchangedDob.data?.date_of_birth === null);
} finally {
  await auth.signOut().catch(() => {});
  for (const id of ids) {
    await svc.from('content_reports').delete().eq('target_user_id', id);
    await svc.from('blocked_signup_emails').delete().eq('user_id', id);
  }
  if (bookingIds.length) await svc.from('bookings').delete().in('id', bookingIds);
  for (const id of [...new Set(ids)].reverse()) {
    await svc.from('user_roles').delete().eq('user_id', id);
    await svc.auth.admin.deleteUser(id).catch(() => {});
    await svc.from('users').delete().eq('id', id);
  }
  if (oldId && !ids.includes(oldId)) await svc.from('users').delete().eq('id', oldId);
  if (bannedId) await svc.from('blocked_signup_emails').delete().eq('user_id', bannedId);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
