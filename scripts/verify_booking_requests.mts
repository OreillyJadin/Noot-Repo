import { DEV_PASSWORD } from './_devPassword.mjs';
import { createClient } from '@supabase/supabase-js';
import { api, auth, initSupabase, studentFeeFor } from '../packages/core/src/index.ts';
import { authorizeHold, cancelHold } from './_stripe_test.mts';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
if (!['127.0.0.1', 'localhost'].includes(new globalThis.URL(URL).hostname)) {
  throw new Error('verify_booking_requests only runs against local Supabase');
}
const ANON =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const PASSWORD = DEV_PASSWORD;
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const emailTag = Date.now();
const studentEmail = `err039-student-${emailTag}@crimson.ua.edu`;
const otherEmail = `err039-other-${emailTag}@crimson.ua.edu`;
const bookings: string[] = [];
const intents: string[] = [];
let pass = 0;
let fail = 0;
const step = (name: string, ok: boolean, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();
const chicagoFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});
const chicagoSlot = (days: number, minutes: number) => {
  const partsAt = (date: Date) =>
    Object.fromEntries(chicagoFormatter.formatToParts(date).map((part) => [part.type, part.value]));
  const local = partsAt(new Date());
  const date = new Date(Date.UTC(
    Number(local.year),
    Number(local.month) - 1,
    Number(local.day) + days,
  ));
  const target = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    Math.floor(minutes / 60),
    minutes % 60,
  );
  let instant = target;
  for (let i = 0; i < 4; i++) {
    const parts = partsAt(new Date(instant));
    const represented = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    const adjusted = instant + target - represented;
    if (adjusted === instant) break;
    instant = adjusted;
  }
  return new Date(instant).toISOString();
};
const chicagoWeekday = (days: number) => {
  const local = Object.fromEntries(chicagoFormatter.formatToParts(new Date())
    .map((part) => [part.type, part.value]));
  return new Date(Date.UTC(
    Number(local.year),
    Number(local.month) - 1,
    Number(local.day) + days,
  )).getUTCDay();
};
const call = async (name: string, body: unknown, token?: string) => {
  const response = await fetch(`${URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) as Record<string, any> };
};
const login = async (email: string, password = PASSWORD) => {
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw error ?? new Error(`No session for ${email}`);
  return { client, token: data.session.access_token, id: data.user.id };
};
const notification = async (userId: string, bookingId: string, title: string) => {
  const { data, error } = await admin.from('notifications')
    .select('id').eq('user_id', userId).eq('title', title).contains('data', { bookingId }).maybeSingle();
  if (error) throw error;
  return !!data;
};

initSupabase({ url: URL, anonKey: ANON });
let studentId = '';
let tutorId = '';
let studentToken = '';
let tutorToken = '';
let otherToken = '';
const selectedSlots: string[] = [];
let stage = 'load seeded tutor';
const nextBookingSlot = async (preferredDays: number) => {
  const { data: availability, error: availabilityError } = await admin.from('tutor_availability')
    .select('day_of_week,start_time,end_time').eq('tutor_id', tutorId);
  if (availabilityError) throw availabilityError;
  const { data: existingBookings, error: bookingsError } = await admin.from('bookings')
    .select('scheduled_at,duration_minutes').eq('tutor_id', tutorId)
    .in('status', ['pending', 'confirmed']);
  if (bookingsError) throw bookingsError;
  const toMinutes = (time: string) => {
    const [hour, minute] = time.slice(0, 5).split(':').map(Number);
    return hour * 60 + minute;
  };
  const offsets = [1, 2, 3, 4, 5, 6].sort((a, b) =>
    Math.abs(a - preferredDays) - Math.abs(b - preferredDays));
  for (const dayOffset of offsets) {
    const weekday = chicagoWeekday(dayOffset);
    for (const window of availability ?? []) {
      if (Number(window.day_of_week) !== weekday) continue;
      const startMinute = toMinutes(window.start_time as string);
      const endMinute = toMinutes(window.end_time as string);
      for (let minute = startMinute; minute + 60 <= endMinute; minute += 60) {
        const candidate = chicagoSlot(dayOffset, minute);
        const start = new Date(candidate).getTime();
        const end = start + 60 * 60_000;
        const overlaps = [...(existingBookings ?? []).map((booking) => ({
          start: new Date(booking.scheduled_at as string).getTime(),
          end: new Date(booking.scheduled_at as string).getTime() +
            Number(booking.duration_minutes) * 60_000,
        })), ...selectedSlots.map((slot) => {
          const slotStart = new Date(slot).getTime();
          return { start: slotStart, end: slotStart + 60 * 60_000 };
        })].some((booking) => booking.start < end && start < booking.end);
        if (start > Date.now() + 2 * 60 * 60_000 && start < Date.now() + 6 * 86_400_000 && !overlaps) {
          selectedSlots.push(candidate);
          return candidate;
        }
      }
    }
  }
  throw new Error('Could not find a free hour inside tutor availability and the six-day booking horizon');
};

try {
  const { data: tutor, error: tutorError } = await admin.from('users').select('id,email').eq('email', 'sara@crimson.ua.edu').single();
  if (tutorError || !tutor) throw tutorError ?? new Error('Run node supabase/seed_demo.mjs first');
  tutorId = tutor.id as string;
  stage = 'enable tutor charges';
  await admin.from('tutor_profiles').update({ stripe_charges_enabled: true }).eq('user_id', tutorId);
  stage = 'load tutor course';
  const { data: course, error: courseError } = await admin.from('tutor_courses').select('course_code, hourly_rate').eq('tutor_id', tutorId).limit(1).single();
  if (courseError || !course) throw courseError ?? new Error('Seeded tutor has no course');
  const courseCode = course.course_code as string;
  const sessionPrice = Math.round(Number(course.hourly_rate) * 100) / 100;
  const expectedStudentFee = studentFeeFor(sessionPrice);
  const expectedTotalCents = Math.round(sessionPrice * 100) + Math.round(expectedStudentFee * 100);

  stage = 'create verification students';
  const created = await admin.auth.admin.createUser({ email: studentEmail, password: PASSWORD, email_confirm: true });
  if (created.error || !created.data.user) throw created.error ?? new Error('Could not create verification student');
  studentId = created.data.user.id;
  const other = await admin.auth.admin.createUser({ email: otherEmail, password: PASSWORD, email_confirm: true });
  if (other.error || !other.data.user) throw other.error ?? new Error('Could not create second verification student');
  stage = 'sign in verification users';
  ({ token: studentToken } = await login(studentEmail));
  ({ token: otherToken } = await login(otherEmail));
  ({ token: tutorToken } = await login(tutor.email as string, DEV_PASSWORD));
  stage = 'sign in core student client';
  const studentSignIn = await auth.signInWithPassword(studentEmail, PASSWORD);
  if (!studentSignIn.ok) throw new Error(studentSignIn.error);

  stage = 'create payment intent';
  const scheduledAt = await nextBookingSlot(3);
  const pi = await api.createPaymentIntent({ tutorId, courseCode, durationMinutes: 60, scheduledAt });
  step('payment intent includes service fee', pi.amountCents === expectedTotalCents &&
    pi.studentFeeCents === Math.round(expectedStudentFee * 100),
    `session $${sessionPrice} + fee $${expectedStudentFee} = ${pi.amountCents}c`);
  intents.push(pi.paymentIntentId);
  if (pi.paymentIntentId.startsWith('pi_')) await authorizeHold(pi.paymentIntentId);
  const createdBooking = await api.bookings.confirm({
    tutorId, courseCode, scheduledAt, durationMinutes: 60, sessionType: 'in_person',
    paymentIntentId: pi.paymentIntentId, message: 'ERR-039 verification',
  });
  stage = 'load pending booking';
  const bookingId = createdBooking.bookingId;
  bookings.push(bookingId);
  const { data: pending } = await admin.from('bookings').select('status,accept_by,accepted_at,price,student_fee').eq('id', bookingId).single();
  const deadlineDelta = pending?.accept_by ? new Date(pending.accept_by).getTime() - Date.now() : 0;
  step('booking starts pending with a 12-hour deadline', pending?.status === 'pending' && deadlineDelta > 11.9 * 3_600_000 && deadlineDelta <= 12 * 3_600_000);
  step('booking stores the session price and service fee', Number(pending?.price) === sessionPrice &&
    Number(pending?.student_fee) === expectedStudentFee,
    `stored $${pending?.price} session + $${pending?.student_fee} fee`);

  stage = 'verify overlapping slot and response authorization';
  await auth.signInWithPassword(otherEmail, PASSWORD);
  let clashRejected = false;
  try {
    const otherPi = await api.createPaymentIntent({ tutorId, courseCode, durationMinutes: 60, scheduledAt });
    intents.push(otherPi.paymentIntentId);
    if (otherPi.paymentIntentId.startsWith('pi_')) await authorizeHold(otherPi.paymentIntentId);
    await api.bookings.confirm({ tutorId, courseCode, scheduledAt, durationMinutes: 60, sessionType: 'in_person', paymentIntentId: otherPi.paymentIntentId });
  } catch (e) {
    clashRejected = /booked|conflict|overlap|slot/i.test(e instanceof Error ? e.message : String(e));
  }
  step('a second student cannot book the pending slot', clashRejected);
  await auth.signInWithPassword(studentEmail, PASSWORD);

  const unauthAccept = await call('respond-booking-request', { bookingId, action: 'accept' });
  const unauthDecline = await call('respond-booking-request', { bookingId, action: 'decline' });
  const studentAccept = await call('respond-booking-request', { bookingId, action: 'accept' }, studentToken);
  const studentDecline = await call('respond-booking-request', { bookingId, action: 'decline' }, studentToken);
  const otherAccept = await call('respond-booking-request', { bookingId, action: 'accept' }, otherToken);
  const otherDecline = await call('respond-booking-request', { bookingId, action: 'decline' }, otherToken);
  step('accept and decline require authentication', unauthAccept.status === 401 && unauthDecline.status === 401, `accept ${unauthAccept.status}, decline ${unauthDecline.status}`);
  step('student cannot accept or decline their booking', studentAccept.status === 403 && studentDecline.status === 403, `accept ${studentAccept.status}, decline ${studentDecline.status}`);
  step('unrelated user cannot accept or decline a booking', otherAccept.status === 403 && otherDecline.status === 403, `accept ${otherAccept.status}, decline ${otherDecline.status}`);

  const accepted = await call('respond-booking-request', { bookingId, action: 'accept' }, tutorToken);
  const repeated = await call('respond-booking-request', { bookingId, action: 'accept' }, tutorToken);
  const { data: acceptedRow } = await admin.from('bookings').select('status,accepted_at').eq('id', bookingId).single();
  step('tutor accepts and student is notified', accepted.status === 200 && acceptedRow?.status === 'confirmed' && !!acceptedRow.accepted_at && await notification(studentId, bookingId, 'Session confirmed'));
  step('repeated acceptance returns 409', repeated.status === 409, `HTTP ${repeated.status}`);

  // The surfaces the tutor lands on after accepting: the session must show in their
  // upcoming list, and acceptance has created the conversation with the student's note.
  await auth.signInWithPassword(tutor.email as string, DEV_PASSWORD);
  const tutorUpcoming = await api.listUpcoming('tutor');
  step('accepted session shows in the tutor upcoming list',
    tutorUpcoming.some((b) => b.id === bookingId && b.status === 'confirmed'));
  const tutorConversation = await api.chat.getConversationWithStudent(studentId);
  const opening = await api.chat.listMessages(tutorConversation.id);
  step("student's booking message is already in the chat",
    opening.some((m) => m.senderId === studentId && /ERR-039 verification/.test(m.content ?? '')));
  await auth.signInWithPassword(studentEmail, PASSWORD);

  stage = 'verify tutor decline and credit return';
  const declineAt = await nextBookingSlot(4);
  await admin.from('credit_ledger').insert({ user_id: studentId, amount_cents: 500, kind: 'adjustment' });
  const declinePi = await api.createPaymentIntent({ tutorId, courseCode, durationMinutes: 60, scheduledAt: declineAt });
  intents.push(declinePi.paymentIntentId);
  if (declinePi.paymentIntentId.startsWith('pi_')) await authorizeHold(declinePi.paymentIntentId);
  const declineBooking = await api.bookings.confirm({
    tutorId, courseCode, scheduledAt: declineAt, durationMinutes: 60, sessionType: 'in_person', paymentIntentId: declinePi.paymentIntentId,
  });
  bookings.push(declineBooking.bookingId);
  const beforeDecline = await api.credits.balance();
  await auth.signInWithPassword(tutor.email as string, DEV_PASSWORD);
  const cancelledBeforeDecline = (await api.tutorStats()).cancelledCount;
  await auth.signInWithPassword(studentEmail, PASSWORD);
  const longNote = await call('respond-booking-request', { bookingId: declineBooking.bookingId, action: 'decline', note: 'x'.repeat(301) }, tutorToken);
  step('decline note over 300 characters is rejected', longNote.status === 400, `HTTP ${longNote.status}`);
  const blockedNote = await call('respond-booking-request', {
    bookingId: declineBooking.bookingId, action: 'decline', note: 'you are a complete retard',
  }, tutorToken);
  const { data: pendingAfterBlockedNote } = await admin.from('bookings').select('status').eq('id', declineBooking.bookingId).single();
  step(
    'blocked decline note is rejected and booking stays pending',
    blockedNote.status === 400 &&
      /That wording breaks our community rules/i.test(String(blockedNote.body.error)) &&
      pendingAfterBlockedNote?.status === 'pending',
    `HTTP ${blockedNote.status}`,
  );
  const declined = await call('respond-booking-request', { bookingId: declineBooking.bookingId, action: 'decline', note: '  Schedule conflict  ' }, tutorToken);
  const { data: declinedRow } = await admin.from('bookings')
    .select('status,cancel_reason,decline_note,refund_percent,cancelled_by_role,cancelled_from_status')
    .eq('id', declineBooking.bookingId).single();
  step('decline stores trimmed note, full refund, and tutor attribution', declined.status === 200 &&
    declinedRow?.status === 'cancelled' && declinedRow.cancel_reason === 'tutor_declined' &&
    declinedRow.decline_note === 'Schedule conflict' && declinedRow.refund_percent === 100 &&
    declinedRow.cancelled_by_role === 'tutor' && declinedRow.cancelled_from_status === 'pending');
  step('decline notifies student and returns credit', await notification(studentId, declineBooking.bookingId, 'Session request declined') && await api.credits.balance() >= beforeDecline);
  const pastRequests = await api.listPast();
  step('declined request appears in past sessions', pastRequests.some((booking) => booking.id === declineBooking.bookingId && booking.cancelReason === 'tutor_declined'));
  await auth.signInWithPassword(tutor.email as string, DEV_PASSWORD);
  const cancelledAfterDecline = (await api.tutorStats()).cancelledCount;
  await auth.signInWithPassword(studentEmail, PASSWORD);
  step('declined request does not count as a tutor cancellation', cancelledAfterDecline === cancelledBeforeDecline);

  stage = 'verify expired accept and one-time reminder';
  const lateAt = await nextBookingSlot(5);
  const latePi = await api.createPaymentIntent({ tutorId, courseCode, durationMinutes: 60, scheduledAt: lateAt });
  intents.push(latePi.paymentIntentId);
  if (latePi.paymentIntentId.startsWith('pi_')) await authorizeHold(latePi.paymentIntentId);
  const lateBooking = await api.bookings.confirm({ tutorId, courseCode, scheduledAt: lateAt, durationMinutes: 60, sessionType: 'in_person', paymentIntentId: latePi.paymentIntentId });
  bookings.push(lateBooking.bookingId);
  await admin.from('bookings').update({ accept_by: new Date(Date.now() - 1000).toISOString() }).eq('id', lateBooking.bookingId);
  const expiredAccept = await call('respond-booking-request', { bookingId: lateBooking.bookingId, action: 'accept' }, tutorToken);
  step('accept after accept_by returns 409', expiredAccept.status === 409, `HTTP ${expiredAccept.status}`);

  const reminderId = crypto.randomUUID();
  const reminderDeadline = hoursFromNow(30);
  const { error: reminderInsertError } = await admin.from('bookings').insert({
    id: reminderId, student_id: studentId, tutor_id: tutorId, subject: courseCode,
    // 0063 forbids two live bookings for one tutor at once — the pending request at +120h
    // still holds that hour, so the reminder fixture uses +126h.
    scheduled_at: hoursFromNow(126), duration_minutes: 60, price: 30, platform_fee: 5.25,
    tutor_payout_amount: 24.75, session_type: 'in_person', status: 'pending',
    created_at: new Date(Date.now() - 3 * 3_600_000).toISOString(), accept_by: reminderDeadline,
    cancellation_deadline: hoursFromNow(108), refund_status: 'not_applicable',
  });
  if (reminderInsertError) throw reminderInsertError;
  bookings.push(reminderId);
  const reminderAt = new Date(new Date(reminderDeadline).getTime() - 30 * 60_000).toISOString();
  await admin.rpc('expire_booking_requests', { p_now: reminderAt });
  await admin.rpc('expire_booking_requests', { p_now: new Date(new Date(reminderAt).getTime() + 60_000).toISOString() });
  const { data: reminderRow } = await admin.from('bookings').select('accept_reminder_sent_at').eq('id', reminderId).single();
  const { data: reminders } = await admin.from('notifications').select('id').eq('user_id', tutorId).eq('title', 'Request expiring soon').contains('data', { bookingId: reminderId });
  step('acceptance reminder fires once', !!reminderRow?.accept_reminder_sent_at && reminders?.length === 1);

  stage = 'verify scheduled expiry and RPC access';
  const expiryAt = await nextBookingSlot(5);
  const expiryPi = await api.createPaymentIntent({ tutorId, courseCode, durationMinutes: 60, scheduledAt: expiryAt });
  intents.push(expiryPi.paymentIntentId);
  if (expiryPi.paymentIntentId.startsWith('pi_')) await authorizeHold(expiryPi.paymentIntentId);
  const expiryBooking = await api.bookings.confirm({ tutorId, courseCode, scheduledAt: expiryAt, durationMinutes: 60, sessionType: 'in_person', paymentIntentId: expiryPi.paymentIntentId });
  bookings.push(expiryBooking.bookingId);
  await admin.from('bookings').update({ accept_by: new Date(Date.now() - 1000).toISOString() }).eq('id', expiryBooking.bookingId);
  const balanceBeforeExpiry = await api.credits.balance();
  const expireNow = new Date().toISOString();
  const { error: expireError } = await admin.rpc('expire_booking_requests', { p_now: expireNow });
  const { data: expiredRow } = await admin.from('bookings').select('status,cancel_reason,refund_percent').eq('id', expiryBooking.bookingId).single();
  step('service expiry RPC cancels the due request at 100%', !expireError && expiredRow?.status === 'cancelled' && expiredRow.cancel_reason === 'tutor_no_response' && expiredRow.refund_percent === 100);
  step('expiry notifies student and returns any used credit', await notification(studentId, expiryBooking.bookingId, 'Session request expired') && await api.credits.balance() >= balanceBeforeExpiry);
  const { error: userRpcError } = await (await login(studentEmail)).client.rpc('expire_booking_requests', { p_now: hoursFromNow(200) });
  step('authenticated users cannot execute expiry RPC', !!userRpcError);

  stage = 'verify pending cancellation and client write denial';
  const cancelAt = await nextBookingSlot(5);
  const cancelPi = await api.createPaymentIntent({ tutorId, courseCode, durationMinutes: 60, scheduledAt: cancelAt });
  intents.push(cancelPi.paymentIntentId);
  if (cancelPi.paymentIntentId.startsWith('pi_')) await authorizeHold(cancelPi.paymentIntentId);
  const cancelBooking = await api.bookings.confirm({ tutorId, courseCode, scheduledAt: cancelAt, durationMinutes: 60, sessionType: 'in_person', paymentIntentId: cancelPi.paymentIntentId });
  bookings.push(cancelBooking.bookingId);
  await auth.signInWithPassword(tutor.email as string, DEV_PASSWORD);
  const cancelledBeforePendingCancel = (await api.tutorStats()).cancelledCount;
  await auth.signInWithPassword(studentEmail, PASSWORD);
  const userClient = (await login(studentEmail)).client;
  const { error: updateError, status: updateStatus } = await userClient.from('bookings').update({ status: 'confirmed' }).eq('id', cancelBooking.bookingId);
  const { data: stillPending } = await admin.from('bookings').select('status').eq('id', cancelBooking.bookingId).single();
  step('plain student cannot update booking status', !updateError && [200, 204].includes(updateStatus) && stillPending?.status === 'pending', `HTTP ${updateStatus}, status=${stillPending?.status}`);
  const cancelled = await api.bookings.cancel(cancelBooking.bookingId);
  step('student cancellation of pending request receives 100%', cancelled.refundPercent === 100);
  const { data: cancelledPending } = await admin.from('bookings')
    .select('cancelled_by_role,cancelled_from_status').eq('id', cancelBooking.bookingId).single();
  step('pending student cancellation records its attribution', cancelledPending?.cancelled_by_role === 'student' &&
    cancelledPending.cancelled_from_status === 'pending');
  step('pending cancellation notifies tutor', await notification(tutorId, cancelBooking.bookingId, 'Session request cancelled'));
  await auth.signInWithPassword(tutor.email as string, DEV_PASSWORD);
  const cancelledAfterPendingCancel = (await api.tutorStats()).cancelledCount;
  await auth.signInWithPassword(studentEmail, PASSWORD);
  step('pending cancellation does not count as a tutor cancellation', cancelledAfterPendingCancel === cancelledBeforePendingCancel);

  stage = 'verify release endpoint access control';
  const releaseDenied = await call('release-booking-holds', {}, studentToken);
  step('release function rejects non-service bearer', releaseDenied.status === 401, `HTTP ${releaseDenied.status}`);
} catch (e) {
  console.error(`Verification setup/error at ${stage}:`, e);
  fail++;
} finally {
  for (const bookingId of bookings) {
    await admin.from('notifications').delete().contains('data', { bookingId });
  }
  if (bookings.length) await admin.from('bookings').delete().in('id', bookings);
  for (const intent of intents) if (intent.startsWith('pi_')) await cancelHold(intent).catch(() => {});
  for (const email of [studentEmail, otherEmail]) {
    const { data } = await admin.from('users').select('id').eq('email', email).maybeSingle();
    if (data?.id) await admin.auth.admin.deleteUser(data.id);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
