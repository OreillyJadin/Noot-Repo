import { createClient } from '@supabase/supabase-js';
import { api, auth, initSupabase } from '../packages/core/src/index.ts';

const URL = 'http://127.0.0.1:54321';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const PASSWORD = 'NootVerify!39_History';
const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });
const anon = createClient(URL, ANON, { auth: { persistSession: false } });
const tag = Date.now();
const studentEmail = `history-student-${tag}@crimson.ua.edu`;
const tutorEmail = `history-tutor-${tag}@crimson.ua.edu`;
const userIds: string[] = [];
const bookingIds: string[] = [];
const reportIds: string[] = [];
let conversationId: string | null = null;
let messageId: string | null = null;
let reviewId: string | null = null;
let adminId = '';
let adminRoleAdded = false;
let pass = 0;
let fail = 0;

const step = (name: string, ok: boolean, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

async function createUser(email: string, firstName: string, lastName: string, tutor = false) {
  const { data, error } = await svc.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: firstName, last_name: lastName },
  });
  if (error || !data.user) throw error ?? new Error(`Could not create ${email}`);
  userIds.push(data.user.id);
  if (tutor) {
    const { error: roleError } = await svc.from('user_roles').insert({ user_id: data.user.id, role: 'tutor' });
    if (roleError) throw roleError;
  }
  return data.user.id;
}

async function signIn(email: string) {
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !data.session) throw error ?? new Error(`Could not sign in as ${email}`);
  return { client, token: data.session.access_token };
}

async function addBooking(
  studentId: string,
  tutorId: string,
  fields: {
    status: string;
    cancelledByRole?: string | null;
    cancelledFromStatus?: string | null;
    cancelReason?: string | null;
    cancelledDaysAgo?: number;
    refundPercent?: number | null;
    noShowParty?: string | null;
  },
) {
  const scheduledAt = new Date(Date.now() + (bookingIds.length + 100) * 3_600_000).toISOString();
  const cancelledAt =
    fields.cancelledDaysAgo == null
      ? fields.status === 'cancelled'
        ? new Date().toISOString()
        : null
      : new Date(Date.now() - fields.cancelledDaysAgo * 86_400_000).toISOString();
  const { data, error } = await svc
    .from('bookings')
    .insert({
      student_id: studentId,
      tutor_id: tutorId,
      subject: 'HIST 101',
      scheduled_at: scheduledAt,
      duration_minutes: 60,
      price: 50,
      platform_fee: 8.75,
      tutor_payout_amount: 41.25,
      session_type: 'in_person',
      location: 'Local verification',
      status: fields.status,
      cancellation_deadline: new Date(new Date(scheduledAt).getTime() - 12 * 3_600_000).toISOString(),
      refund_status: fields.status === 'no_show' ? (fields.noShowParty === 'tutor' ? 'refunded' : 'not_refunded') : 'not_applicable',
      refund_percent: fields.refundPercent ?? 0,
      cancelled_at: cancelledAt,
      cancelled_by_role: fields.cancelledByRole ?? null,
      cancelled_from_status: fields.cancelledFromStatus ?? null,
      cancel_reason: fields.cancelReason ?? null,
      no_show_party: fields.noShowParty ?? null,
    })
    .select('id')
    .single();
  if (error || !data) throw error ?? new Error('Could not create verification booking');
  bookingIds.push(data.id);
  return data.id as string;
}

async function rpcError(client: ReturnType<typeof createClient>, userId: string) {
  const { error } = await client.rpc('admin_user_history', { p_user: userId });
  return error;
}

initSupabase({ url: URL, anonKey: ANON });

try {
  const studentId = await createUser(studentEmail, 'History', 'Student');
  const tutorId = await createUser(tutorEmail, 'History', 'Tutor', true);

  const { data: seededAdmin, error: adminLookupError } = await svc
    .from('users')
    .select('id,email')
    .eq('email', 'admin@crimson.ua.edu')
    .maybeSingle();
  if (adminLookupError) throw adminLookupError;
  if (seededAdmin) {
    adminId = seededAdmin.id as string;
  } else {
    const { data: seededStudent, error: studentLookupError } = await svc
      .from('users')
      .select('id,email')
      .eq('email', 'student@crimson.ua.edu')
      .single();
    if (studentLookupError || !seededStudent) throw studentLookupError ?? new Error('Run node supabase/seed_demo.mjs first');
    adminId = seededStudent.id as string;
  }
  const { data: adminRole, error: roleLookupError } = await svc
    .from('user_roles')
    .select('user_id')
    .eq('user_id', adminId)
    .eq('role', 'admin')
    .maybeSingle();
  if (roleLookupError) throw roleLookupError;
  if (!adminRole) {
    const { error } = await svc.from('user_roles').insert({ user_id: adminId, role: 'admin' });
    if (error) throw error;
    adminRoleAdded = true;
  }

  const recentCancelDays = [1, 5, 12];
  for (const days of recentCancelDays) {
    await addBooking(studentId, tutorId, {
      status: 'cancelled',
      cancelledByRole: 'tutor',
      cancelledFromStatus: 'confirmed',
      cancelledDaysAgo: days,
      refundPercent: 100,
    });
  }
  await addBooking(studentId, tutorId, {
    status: 'cancelled',
    cancelledByRole: 'tutor',
    cancelledFromStatus: 'confirmed',
    cancelledDaysAgo: 45,
    refundPercent: 100,
  });
  await addBooking(studentId, tutorId, {
    status: 'cancelled',
    cancelledByRole: 'student',
    cancelledFromStatus: 'confirmed',
    refundPercent: 50,
  });
  await addBooking(studentId, tutorId, {
    status: 'cancelled',
    cancelledByRole: 'student',
    cancelledFromStatus: 'confirmed',
    refundPercent: 100,
  });
  await addBooking(studentId, tutorId, {
    status: 'cancelled',
    cancelledByRole: 'student',
    cancelledFromStatus: 'pending',
    refundPercent: 100,
  });
  await addBooking(studentId, tutorId, {
    status: 'cancelled',
    cancelledByRole: 'tutor',
    cancelledFromStatus: 'pending',
    cancelReason: 'tutor_declined',
    refundPercent: 100,
  });
  await addBooking(studentId, tutorId, {
    status: 'cancelled',
    cancelledFromStatus: 'pending',
    cancelReason: 'tutor_no_response',
    refundPercent: 100,
  });
  await addBooking(studentId, tutorId, { status: 'no_show', noShowParty: 'student', refundPercent: 0 });
  await addBooking(studentId, tutorId, { status: 'no_show', noShowParty: 'tutor', refundPercent: 100 });
  const completedId = await addBooking(studentId, tutorId, { status: 'completed' });
  const writeProbeId = await addBooking(studentId, tutorId, { status: 'confirmed' });

  const { data: conversation, error: conversationError } = await svc
    .from('conversations')
    .insert({ student_id: studentId, tutor_id: tutorId })
    .select('id')
    .single();
  if (conversationError || !conversation) throw conversationError ?? new Error('Could not create report conversation');
  conversationId = conversation.id as string;
  const { data: message, error: messageError } = await svc
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: studentId, content: 'History verification message' })
    .select('id')
    .single();
  if (messageError || !message) throw messageError ?? new Error('Could not create report message');
  messageId = message.id as string;
  const { data: review, error: reviewError } = await svc
    .from('reviews')
    .insert({ booking_id: completedId, reviewer_id: studentId, subject_user_id: tutorId, rating: 5, comment: 'History verification' })
    .select('id')
    .single();
  if (reviewError || !review) throw reviewError ?? new Error('Could not create report review');
  reviewId = review.id as string;

  const { data: reports, error: reportsError } = await svc
    .from('content_reports')
    .insert([
      { reporter_id: tutorId, target_kind: 'user', target_user_id: studentId, reason: 'other', detail: 'Direct user report' },
      { reporter_id: tutorId, target_kind: 'message', target_message_id: messageId, reason: 'spam', detail: 'Message report' },
      { reporter_id: tutorId, target_kind: 'review', target_review_id: reviewId, reason: 'inappropriate', detail: 'Review report' },
      { reporter_id: studentId, target_kind: 'user', target_user_id: tutorId, reason: 'other', detail: 'Filed by history student' },
    ])
    .select('id');
  if (reportsError) throw reportsError;
  reportIds.push(...(reports ?? []).map((report) => report.id as string));

  const studentClient = (await signIn(studentEmail)).client;
  const tutorClient = (await signIn(tutorEmail)).client;
  const anonError = await rpcError(anon, studentId);
  const studentError = await rpcError(studentClient, studentId);
  const tutorError = await rpcError(tutorClient, tutorId);
  step('anon cannot call admin_user_history', anonError?.code === '42501', anonError?.code ?? 'no error');
  step('plain student cannot call admin_user_history', studentError?.code === '42501', studentError?.code ?? 'no error');
  step('tutor cannot call admin_user_history', tutorError?.code === '42501', tutorError?.code ?? 'no error');

  const attemptedStudentWrite = await studentClient
    .from('bookings')
    .update({ cancelled_by_role: 'student', cancelled_from_status: 'pending', no_show_party: 'student' })
    .eq('id', writeProbeId)
    .select('id')
    .maybeSingle();
  const probeAfterStudent = await svc
    .from('bookings')
    .select('cancelled_by_role,cancelled_from_status,no_show_party')
    .eq('id', writeProbeId)
    .single();
  step(
    'student cannot write booking attribution fields',
    !probeAfterStudent.error &&
      probeAfterStudent.data?.cancelled_by_role == null &&
      probeAfterStudent.data?.cancelled_from_status == null &&
      probeAfterStudent.data?.no_show_party == null,
    attemptedStudentWrite.error?.code ?? 'fields unchanged',
  );
  const attemptedTutorWrite = await tutorClient
    .from('bookings')
    .update({ cancelled_by_role: 'tutor', cancelled_from_status: 'confirmed', no_show_party: 'tutor' })
    .eq('id', writeProbeId)
    .select('id')
    .maybeSingle();
  const probeAfterTutor = await svc
    .from('bookings')
    .select('cancelled_by_role,cancelled_from_status,no_show_party')
    .eq('id', writeProbeId)
    .single();
  step(
    'tutor cannot write booking attribution fields',
    !probeAfterTutor.error &&
      probeAfterTutor.data?.cancelled_by_role == null &&
      probeAfterTutor.data?.cancelled_from_status == null &&
      probeAfterTutor.data?.no_show_party == null,
    attemptedTutorWrite.error?.code ?? 'fields unchanged',
  );

  const adminEmail = seededAdmin?.email as string | undefined;
  const adminLoginEmail = adminEmail ?? 'student@crimson.ua.edu';
  const adminRelogin = await auth.signInWithPassword(adminLoginEmail, 'password123');
  if (!adminRelogin.ok) throw new Error(`Could not sign in as admin fixture: ${adminRelogin.error}`);
  const studentHistory = await api.admin.userHistory(studentId);
  const tutorHistory = await api.admin.userHistory(tutorId);
  step(
    'student history returns all session and cancellation counts',
    studentHistory.user?.id === studentId &&
      studentHistory.counts.sessionsAsStudent === 13 &&
      studentHistory.counts.completedAsStudent === 1 &&
      studentHistory.counts.studentCancelsFull === 1 &&
      studentHistory.counts.studentCancelsPartial === 1 &&
      studentHistory.counts.studentRequestCancels === 1 &&
      studentHistory.counts.noShowsAsStudent === 1,
    JSON.stringify(studentHistory.counts),
  );
  step(
    'tutor history returns cancel, decline, expiry, and no-show counts',
    tutorHistory.user?.id === tutorId &&
      tutorHistory.counts.sessionsAsTutor === 13 &&
      tutorHistory.counts.completedAsTutor === 1 &&
      tutorHistory.counts.tutorCancels === 4 &&
      tutorHistory.counts.tutorCancels30d === 3 &&
      tutorHistory.counts.tutorDeclines === 1 &&
      tutorHistory.counts.requestsExpired === 1 &&
      tutorHistory.counts.noShowsAsTutor === 1,
    JSON.stringify(tutorHistory.counts),
  );
  step(
    'report counts include direct, message, and review targets',
    studentHistory.counts.reportsReceived === 3 &&
      studentHistory.counts.reportsFiled === 1 &&
      tutorHistory.counts.reportsReceived === 1 &&
      tutorHistory.counts.reportsFiled === 3,
    `student ${studentHistory.counts.reportsReceived} received/${studentHistory.counts.reportsFiled} filed; tutor ${tutorHistory.counts.reportsReceived}/${tutorHistory.counts.reportsFiled}`,
  );
  step(
    'history includes recent bookings, reports, and empty admin-action arrays',
    studentHistory.bookings.length === 13 &&
      studentHistory.bookings.every((booking) => booking.role === 'student') &&
      studentHistory.reports.length === 3 &&
      studentHistory.adminActions.length === 0 &&
      Array.isArray(tutorHistory.adminActions),
    `${studentHistory.bookings.length} bookings, ${studentHistory.reports.length} reports`,
  );

  const tutorLogin = await auth.signInWithPassword(tutorEmail, PASSWORD);
  if (!tutorLogin.ok) throw new Error(`Could not sign in as tutor: ${tutorLogin.error}`);
  const tutorCount = await api.bookings.myTutorCancelCount30d();
  step('tutor core count query returns three recent cancels', tutorCount === 3, String(tutorCount));
  const adminLogin = await auth.signInWithPassword(adminLoginEmail, 'password123');
  if (!adminLogin.ok) throw new Error(`Could not sign in as admin fixture: ${adminLogin.error}`);
  const tutorList = await api.admin.listUsers({ search: tutorEmail });
  const tutorListRow = tutorList.users.find((user) => user.id === tutorId);
  const studentList = await api.admin.listUsers({ search: studentEmail });
  const studentListRow = studentList.users.find((user) => user.id === studentId);
  step(
    'admin_list_users returns tutor cancellation and no-show flags',
    tutorListRow?.tutorCancels30d === 3 &&
      tutorListRow.noShows === 1 &&
      studentListRow?.tutorCancels30d === 0 &&
      studentListRow.noShows === 1,
    `tutor ${tutorListRow?.tutorCancels30d} cancels/${tutorListRow?.noShows} no-shows; student ${studentListRow?.noShows}`,
  );
} catch (error) {
  console.error('Verification setup/error:', error);
  fail++;
} finally {
  await auth.signOut().catch(() => {});
  if (reportIds.length) await svc.from('content_reports').delete().in('id', reportIds);
  if (messageId) await svc.from('messages').delete().eq('id', messageId);
  if (conversationId) await svc.from('conversations').delete().eq('id', conversationId);
  if (reviewId) await svc.from('reviews').delete().eq('id', reviewId);
  if (bookingIds.length) await svc.from('bookings').delete().in('id', bookingIds);
  if (adminRoleAdded && adminId) await svc.from('user_roles').delete().eq('user_id', adminId).eq('role', 'admin');
  for (const userId of userIds) await svc.auth.admin.deleteUser(userId);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
