import { createClient } from '@supabase/supabase-js';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
if (!['127.0.0.1', 'localhost'].includes(new globalThis.URL(URL).hostname)) {
  throw new Error('verify_deleted_token only runs against local Supabase');
}

const PASSWORD = 'NootDeleted!Token2026';
const tag = Date.now();
const email = `deleted-token-${tag}@crimson.ua.edu`;
const reportDetail = `deleted-token-${tag}`;
const pushToken = `ExponentPushToken[qa-${tag}]`;
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const cleanup: { userId?: string; bookingId?: string; conversationId?: string; messageId?: string } = {};
let pass = 0;
let fail = 0;
let stage = 'create user';

const check = (name: string, ok: boolean, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const functionCall = async (name: string, body: unknown, token: string) => {
  const response = await fetch(`${URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) as Record<string, unknown> };
};

const remove = async (label: string, query: PromiseLike<{ error: { message: string } | null }>) => {
  const { error } = await query;
  if (error) {
    fail++;
    console.error(`❌ cleanup ${label} — ${error.message}`);
  }
};

try {
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (createError || !created.user) throw createError ?? new Error('createUser returned no user');
  const userId = created.user.id;
  cleanup.userId = userId;

  const { error: profileError } = await admin.from('users').update({
    first_name: 'Deleted',
    last_name: 'Token',
    status: 'active',
    deleted_at: null,
    password_set_at: new Date().toISOString(),
    terms_accepted_at: new Date().toISOString(),
    terms_version: '2026-09-17',
    guidelines_accepted_at: new Date().toISOString(),
    guidelines_version: '2026-10-13',
  }).eq('id', userId);
  if (profileError) throw profileError;
  const { error: roleError } = await admin.from('user_roles')
    .upsert({ user_id: userId, role: 'student' }, { onConflict: 'user_id,role' });
  if (roleError) throw roleError;

  const { data: tutor, error: tutorError } = await admin.from('users')
    .select('id')
    .eq('email', 'sara.chen@crimson.ua.edu')
    .single();
  if (tutorError || !tutor) throw tutorError ?? new Error('e2e tutor Sara is missing; run scripts/e2e_users.mts');
  const tutorId = tutor.id as string;

  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: session, error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInError || !session.session) throw signInError ?? new Error('sign-in returned no session');
  const oldToken = session.session.access_token;

  stage = 'create owned rows';
  const scheduledAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: booking, error: bookingError } = await admin.from('bookings').insert({
    student_id: userId,
    tutor_id: tutorId,
    subject: 'BSC 103',
    scheduled_at: scheduledAt,
    duration_minutes: 60,
    price: 40,
    platform_fee: 7,
    student_fee: 2,
    tutor_payout_amount: 33,
    credit_applied: 0,
    session_type: 'in_person',
    status: 'completed',
    cancellation_deadline: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    accept_by: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  }).select('id').single();
  if (bookingError || !booking) throw bookingError ?? new Error('could not create completed booking fixture');
  cleanup.bookingId = booking.id;

  const { data: conversation, error: conversationError } = await admin.from('conversations')
    .upsert({ student_id: userId, tutor_id: tutorId }, { onConflict: 'student_id,tutor_id' })
    .select('id')
    .single();
  if (conversationError || !conversation) throw conversationError ?? new Error('could not create conversation fixture');
  cleanup.conversationId = conversation.id;

  const { data: message, error: messageError } = await admin.from('messages')
    .insert({ conversation_id: conversation.id, sender_id: tutorId, content: `Deleted-token fixture ${tag}` })
    .select('id')
    .single();
  if (messageError || !message) throw messageError ?? new Error('could not create message fixture');
  cleanup.messageId = message.id;
  const { data: notification, error: notificationError } = await admin.from('notifications')
    .select('id')
    .eq('user_id', userId)
    .contains('data', { conversationId: conversation.id })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (notificationError || !notification) throw notificationError ?? new Error('message notification fixture missing');

  stage = 'delete account';
  const deletion = await functionCall('delete-account', {}, oldToken);
  check('delete-account succeeds', deletion.status === 200 && deletion.body.ok === true, `status=${deletion.status}`);
  const { data: retained, error: retainedError } = await admin.from('users')
    .select('status,deleted_at')
    .eq('id', userId)
    .single();
  check('deleted user row remains active and marked deleted',
    !retainedError && retained?.status === 'active' && !!retained?.deleted_at);
  const { data: authRecord } = await admin.auth.admin.getUserById(userId);
  check('Auth identity is removed', !authRecord?.user);

  stage = 'old-token PostgREST reads';
  const oldClient = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${oldToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const ownUser = await oldClient.from('users').select('id').eq('id', userId);
  check('old token cannot read its retained users row',
    !ownUser.error && (ownUser.data ?? []).length === 0, `rows=${ownUser.data?.length ?? 'error'}`);
  const ownBooking = await oldClient.from('bookings').select('id').eq('id', cleanup.bookingId);
  check('old token cannot read its completed booking',
    !ownBooking.error && (ownBooking.data ?? []).length === 0, `rows=${ownBooking.data?.length ?? 'error'}`);
  const ownMessage = await oldClient.from('messages').select('id').eq('id', cleanup.messageId);
  check('old token cannot read its conversation message',
    !ownMessage.error && (ownMessage.data ?? []).length === 0, `rows=${ownMessage.data?.length ?? 'error'}`);
  const ownNotification = await oldClient.from('notifications').select('id').eq('id', notification.id);
  check('old token cannot read its notification',
    !ownNotification.error && (ownNotification.data ?? []).length === 0,
    `rows=${ownNotification.data?.length ?? 'error'}`);

  stage = 'old-token PostgREST writes';
  const messageInsert = await oldClient.from('messages').insert({
    conversation_id: conversation.id,
    sender_id: userId,
    content: `Rejected deleted-token message ${tag}`,
  });
  const { count: messageCount } = await admin.from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('sender_id', userId)
    .eq('content', `Rejected deleted-token message ${tag}`);
  check('old token cannot insert a message', !!messageInsert.error && messageCount === 0,
    messageInsert.error?.message ?? `rows=${messageCount ?? 'error'}`);

  const reportInsert = await oldClient.from('content_reports').insert({
    reporter_id: userId,
    target_kind: 'user',
    target_user_id: tutorId,
    reason: 'other',
    detail: reportDetail,
  });
  const { count: reportCount } = await admin.from('content_reports')
    .select('id', { count: 'exact', head: true })
    .eq('reporter_id', userId)
    .eq('detail', reportDetail);
  check('old token cannot insert a content report', !!reportInsert.error && reportCount === 0,
    reportInsert.error?.message ?? `rows=${reportCount ?? 'error'}`);

  const pushInsert = await oldClient.from('push_tokens').insert({
    user_id: userId,
    token: pushToken,
    platform: 'ios',
  });
  const { count: pushCount } = await admin.from('push_tokens')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('token', pushToken);
  check('old token cannot insert a push token', !!pushInsert.error && pushCount === 0,
    pushInsert.error?.message ?? `rows=${pushCount ?? 'error'}`);

  stage = 'old-token Edge Function';
  const edge = await functionCall('create-payment-intent', {}, oldToken);
  check('old token is rejected by create-payment-intent', edge.status === 401, `status=${edge.status}`);
} catch (error) {
  fail++;
  console.error(`❌ ${stage} — ${error instanceof Error ? error.message : String(error)}`);
} finally {
  if (cleanup.userId) {
    await remove('test reports', admin.from('content_reports').delete().eq('reporter_id', cleanup.userId));
    await remove('test push tokens', admin.from('push_tokens').delete().eq('user_id', cleanup.userId));
    await remove('test notifications', admin.from('notifications').delete().eq('user_id', cleanup.userId));
    await remove('test messages', admin.from('messages').delete().eq('conversation_id', cleanup.conversationId ?? ''));
    if (cleanup.bookingId) await remove('test booking', admin.from('bookings').delete().eq('id', cleanup.bookingId));
    if (cleanup.conversationId) {
      await remove('test conversation', admin.from('conversations').delete().eq('id', cleanup.conversationId));
    }
    await remove('signup block', admin.from('blocked_signup_emails').delete().eq('user_id', cleanup.userId));
    await remove('test roles', admin.from('user_roles').delete().eq('user_id', cleanup.userId));
    await remove('retained user row', admin.from('users').delete().eq('id', cleanup.userId));
    const { error } = await admin.auth.admin.deleteUser(cleanup.userId);
    if (error && !/not found/i.test(error.message)) {
      fail++;
      console.error(`❌ cleanup Auth user — ${error.message}`);
    }
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
