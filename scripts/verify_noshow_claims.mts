// Verify no-show claims, completion objections, dispute locks, and admin settlement.
// Local Supabase only. Serve functions with the Stripe test key to exercise money paths.
import { createClient } from '@supabase/supabase-js';
import { DEV_PASSWORD } from './_devPassword.mjs';
import {
  cancelHold,
  createManualCaptureIntent,
  getCharge,
  getPaymentIntent,
  refundCharge,
  stripeTestMode,
} from './_stripe_test.mts';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
if (!['127.0.0.1', 'localhost'].includes(new globalThis.URL(URL).hostname)) {
  throw new Error('verify_noshow_claims only runs against local Supabase');
}
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
type Json = Record<string, unknown>;
type User = { id: string; token: string; client: ReturnType<typeof createClient> };
const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });
const bookingIds: string[] = [];
const paymentIntentIds: string[] = [];
const userIds: string[] = [];
let connectId: string | null = null;
let originalConnect: string | null = null;
let changedConnect = false;
let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  ok ? passed++ : failed++;
};

async function signIn(email: string): Promise<User> {
  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: DEV_PASSWORD });
  if (error || !data.user || !data.session) throw new Error(`Could not sign in ${email}: ${error?.message ?? 'no session'}`);
  return { id: data.user.id, token: data.session.access_token, client };
}

async function call(name: string, token: string, body: Json = {}) {
  const response = await fetch(`${URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) as Json };
}

async function makeBooking(
  student: User,
  tutor: User,
  options: {
    price?: number;
    payout?: number;
    paymentIntentId?: string | null;
    disputeStatus?: 'none' | 'flagged';
  } = {},
): Promise<string> {
  const scheduledAt = new Date(Date.now() - (3 * 60 + bookingIds.length * 70) * 60 * 1000).toISOString();
  const { data, error } = await svc.from('bookings').insert({
    student_id: student.id,
    tutor_id: tutor.id,
    subject: 'MGT 300',
    scheduled_at: scheduledAt,
    duration_minutes: 60,
    price: options.price ?? 0,
    student_fee: 0,
    platform_fee: 0,
    tutor_payout_amount: options.payout ?? 0,
    session_type: 'in_person',
    location: 'Local verification',
    status: 'confirmed',
    dispute_status: options.disputeStatus ?? 'none',
    cancellation_deadline: scheduledAt,
    stripe_payment_intent_id: options.paymentIntentId ?? null,
  }).select('id').single();
  if (error || !data) throw new Error(`Could not create booking: ${error?.message ?? 'no id'}`);
  bookingIds.push(data.id);
  return data.id;
}

async function booking(id: string): Promise<Json> {
  const { data, error } = await svc.from('bookings').select('*').eq('id', id).single();
  if (error || !data) throw new Error(`Could not read booking: ${error?.message ?? id}`);
  return data as Json;
}

async function report(id: string, reporter: User, party: 'student' | 'tutor') {
  return call('report-no-show', reporter.token, { bookingId: id, party });
}

async function backdate(id: string, field: 'no_show_claimed_at' | 'completion_claimed_at') {
  const { error } = await svc.from('bookings')
    .update({ [field]: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() }).eq('id', id);
  if (error) throw error;
}

async function runAutoComplete() {
  const result = await call('auto-complete-sessions', SERVICE);
  if (result.status !== 200) throw new Error(`auto-complete-sessions failed: HTTP ${result.status}`);
  return result;
}

async function readyConnectAccount(): Promise<string | null> {
  if (!stripeTestMode()) return null;
  const key = process.env.STRIPE_SECRET_KEY!;
  const response = await fetch('https://api.stripe.com/v1/accounts?limit=100', {
    headers: { Authorization: `Bearer ${key}` },
  });
  const body = await response.json() as {
    data?: Array<{ id?: unknown; payouts_enabled?: unknown; capabilities?: Record<string, unknown> }>;
  };
  if (!response.ok) return null;
  const ready = body.data?.find((account) =>
    account.payouts_enabled === true && account.capabilities?.transfers === 'active'
  );
  return typeof ready?.id === 'string' ? ready.id : null;
}

async function testAdminOutcome(
  student: User,
  tutor: User,
  admin: User,
  outcome: 'tutor_no_show' | 'student_no_show' | 'completed',
) {
  const id = await makeBooking(student, tutor);
  await svc.from('bookings').update({ dispute_status: 'flagged', dispute_reason: 'verification' }).eq('id', id);
  const result = await call('resolve-dispute', admin.token, { bookingId: id, action: 'resolve', outcome });
  const row = await booking(id);
  const expectedStatus = outcome === 'completed' ? 'completed' : 'no_show';
  const expectedParty = outcome === 'tutor_no_show' ? 'tutor' : outcome === 'student_no_show' ? 'student' : null;
  const { data: audit } = await svc.from('admin_actions').select('details')
    .eq('target_type', 'booking').eq('target_id', id).eq('action', 'dispute.resolve').order('created_at', { ascending: false }).limit(1);
  check(
    `admin outcome ${outcome} settles and audits`,
    result.status === 200 && row.status === expectedStatus && row.dispute_status === 'resolved'
      && row.no_show_party === expectedParty && audit?.[0]?.details?.outcome === outcome,
    `HTTP ${result.status}, status=${String(row.status)}, party=${String(row.no_show_party)}`,
  );
}

try {
  const student = await signIn('student@crimson.ua.edu');
  const tutor = await signIn('sara@crimson.ua.edu');
  const admin = await signIn('admin@crimson.ua.edu');
  const outsiderEmail = `noshow-outsider-${Date.now()}@crimson.ua.edu`;
  const { data: outsiderData, error: outsiderError } = await svc.auth.admin.createUser({
    email: outsiderEmail, password: DEV_PASSWORD, email_confirm: true,
  });
  if (outsiderError || !outsiderData.user) throw outsiderError ?? new Error('Could not create outsider');
  userIds.push(outsiderData.user.id);
  const outsider = await signIn(outsiderEmail);

  if (stripeTestMode()) {
    const ready = await readyConnectAccount();
    const { data: profile } = await svc.from('tutor_profiles').select('stripe_connect_account_id')
      .eq('user_id', tutor.id).maybeSingle();
    originalConnect = (profile?.stripe_connect_account_id as string | null) ?? null;
    if (ready && ready !== originalConnect) {
      const { error } = await svc.from('tutor_profiles').update({ stripe_connect_account_id: ready }).eq('user_id', tutor.id);
      if (error) throw error;
      changedConnect = true;
    }
    connectId = ready;
  } else {
    console.log('⏭️ SKIP Stripe capture/payout checks: no Stripe test key is served');
  }

  const piForClaim = stripeTestMode() ? await createManualCaptureIntent(5000) : null;
  if (piForClaim) paymentIntentIds.push(piForClaim.id);
  const claimId = await makeBooking(student, tutor, {
    price: piForClaim ? 50 : 0,
    payout: piForClaim ? 40 : 0,
    paymentIntentId: piForClaim?.id ?? null,
  });
  const claim = await report(claimId, student, 'tutor');
  const claimedRow = await booking(claimId);
  const piAfterClaim = piForClaim ? await getPaymentIntent(piForClaim.id) : null;
  const claimEvidence = claim.body.attendance as Json | undefined;
  const attendanceShape = !!claimEvidence && typeof claimEvidence.checked_at === 'string'
    && (claimEvidence.unavailable === true
      || (typeof claimEvidence.student_seconds === 'number' && typeof claimEvidence.tutor_seconds === 'number'))
    && !('reporter_seconds' in claimEvidence) && !('accused_seconds' in claimEvidence);
  const { data: notices } = await svc.from('notifications').select('title,body,data')
    .eq('user_id', tutor.id).eq('title', 'No-show claim').contains('data', { bookingId: claimId })
    .order('created_at', { ascending: false }).limit(1);
  check(
    'report opens a claim, not a settlement, and notifies the accused',
    claim.status === 200 && claim.body.status === 'claimed'
      && attendanceShape
      && claimedRow.status === 'confirmed' && claimedRow.no_show_party === null
      && claimedRow.no_show_claim_party === 'tutor' && claimedRow.no_show_claimed_by === student.id
      && (!piAfterClaim || piAfterClaim.status === 'requires_capture')
      && notices?.[0]?.title === 'No-show claim'
      && (notices[0]?.data as Json | undefined)?.bookingId === claimId
      && !!notices?.[0]?.body?.includes('reported you as a no-show')
      && !!notices?.[0]?.body?.includes('contest it within 24 hours'),
    `HTTP ${claim.status}, claim=${String(claim.body.status)}, booking=${String(claimedRow.status)}, PI=${piAfterClaim?.status ?? 'none'}`,
  );

  const duplicate = await report(claimId, student, 'tutor');
  check('duplicate no-show claim is rejected', duplicate.status === 409);
  const wrongContest = await call('contest-session-claim', student.token, { bookingId: claimId, kind: 'no_show' });
  const nonPartyContest = await call('contest-session-claim', outsider.token, { bookingId: claimId, kind: 'no_show' });
  check('only the accused party may contest a no-show claim', wrongContest.status === 403);
  check('non-party cannot contest a claim', nonPartyContest.status === 403);

  const partyRead = await student.client.from('bookings')
    .select('no_show_claim_party, no_show_claimed_at, no_show_contested_at, attendance').eq('id', claimId).single();
  const outsiderRead = await outsider.client.from('bookings')
    .select('no_show_claim_party, no_show_claimed_at').eq('id', claimId);
  const clientUpdate = await student.client.from('bookings').update({ no_show_claim_party: 'student' })
    .eq('id', claimId).select('id');
  const clientInsert = await student.client.from('bookings').insert({
    student_id: student.id, tutor_id: tutor.id, subject: 'MGT 300',
    scheduled_at: new Date(Date.now() + 86400000).toISOString(), duration_minutes: 60,
    price: 10, tutor_payout_amount: 8, session_type: 'in_person',
    cancellation_deadline: new Date().toISOString(), no_show_claim_party: 'student',
  });
  check('party can read claim evidence fields', !partyRead.error && partyRead.data.no_show_claim_party === 'tutor');
  check('non-party cannot read another booking’s claim fields', !outsiderRead.error && (outsiderRead.data ?? []).length === 0);
  check('client cannot update claim fields', !!clientUpdate.error || (clientUpdate.data ?? []).length === 0);
  check('client cannot insert claim fields', !!clientInsert.error);

  const expiredId = await makeBooking(student, tutor);
  await report(expiredId, student, 'tutor');
  await backdate(expiredId, 'no_show_claimed_at');
  const lateContest = await call('contest-session-claim', tutor.token, { bookingId: expiredId, kind: 'no_show' });
  check('contest after 24 hours is rejected', lateContest.status === 409);

  const contestedId = await makeBooking(student, tutor);
  await report(contestedId, student, 'tutor');
  const contested = await call('contest-session-claim', tutor.token, { bookingId: contestedId, kind: 'no_show', note: 'I attended' });
  const contestedRow = await booking(contestedId);
  const { data: contestNotices } = await svc.from('notifications').select('user_id,title,body,data')
    .in('user_id', [student.id, tutor.id]).eq('title', 'Session under review')
    .contains('data', { bookingId: contestedId });
  check(
    'no-show contest with unavailable attendance is flagged for review',
    contested.status === 200 && contested.body.status === 'under_review'
      && contestedRow.dispute_status === 'flagged'
      && contestedRow.dispute_reason === 'No-show contested: I attended'
      && contestNotices?.length === 2
      && contestNotices.every((notice) => notice.title === 'Session under review'
        && (notice.data as Json | undefined)?.bookingId === contestedId
        && notice.body?.includes('no-show claim was contested')),
  );

  const lockId = await makeBooking(student, tutor, { disputeStatus: 'flagged' });
  const lockedOps = await Promise.all([
    call('complete-session', tutor.token, { bookingId: lockId }),
    call('report-no-show', student.token, { bookingId: lockId, party: 'tutor' }),
    call('cancel-booking', student.token, { bookingId: lockId }),
    call('reschedule-booking', student.token, {
      bookingId: lockId, action: 'propose', newScheduledAt: new Date(Date.now() + 86400000).toISOString(),
    }),
    call('contest-session-claim', student.token, { bookingId: lockId, kind: 'no_show' }),
  ]);
  check(
    'all flagged-booking operations return the dispute lock response',
    lockedOps.every((result) => result.status === 409
      && result.body.error === 'This session is under review by the noot team.'),
  );

  const pendingPi = stripeTestMode() ? await createManualCaptureIntent(5000) : null;
  if (pendingPi) paymentIntentIds.push(pendingPi.id);
  const completionId = await makeBooking(student, tutor, {
    price: pendingPi ? 50 : 0, payout: pendingPi ? 40 : 0, paymentIntentId: pendingPi?.id ?? null,
  });
  const completion = await call('complete-session', tutor.token, { bookingId: completionId });
  const pendingRow = await booking(completionId);
  const pendingPayment = pendingPi ? await getPaymentIntent(pendingPi.id) : null;
  check(
    'tutor completion opens a 24-hour objection window without capture',
    completion.status === 200 && completion.body.status === 'completion_pending'
      && typeof completion.body.objectBy === 'string'
      && pendingRow.status === 'confirmed' && !!pendingRow.completion_claimed_at
      && (!pendingPayment || pendingPayment.status === 'requires_capture'),
    `HTTP ${completion.status}, PI=${pendingPayment?.status ?? 'none'}`,
  );

  const noPaymentCompletionId = await makeBooking(student, tutor);
  await call('complete-session', tutor.token, { bookingId: noPaymentCompletionId });
  await backdate(noPaymentCompletionId, 'completion_claimed_at');
  await runAutoComplete();
  const autoCompleted = await booking(noPaymentCompletionId);
  check('uncontested completion claim settles after 25 hours', autoCompleted.status === 'completed');

  const objectionPi = stripeTestMode() ? await createManualCaptureIntent(5000) : null;
  if (objectionPi) paymentIntentIds.push(objectionPi.id);
  const objectionId = await makeBooking(student, tutor, {
    price: objectionPi ? 50 : 0, payout: objectionPi ? 40 : 0, paymentIntentId: objectionPi?.id ?? null,
  });
  await call('complete-session', tutor.token, { bookingId: objectionId });
  const invalidNote = await call('contest-session-claim', student.token, {
    bookingId: objectionId, kind: 'completion', note: 'x'.repeat(301),
  });
  const wrongObjection = await call('contest-session-claim', tutor.token, { bookingId: objectionId, kind: 'completion' });
  const objection = await call('contest-session-claim', student.token, {
    bookingId: objectionId, kind: 'completion', note: 'Session did not happen',
  });
  const objectionRow = await booking(objectionId);
  const objectionPayment = objectionPi ? await getPaymentIntent(objectionPi.id) : null;
  const { data: objectionNotices } = await svc.from('notifications').select('user_id,title,body,data')
    .eq('user_id', tutor.id).eq('title', 'Session under review').contains('data', { bookingId: objectionId });
  check('completion objection note length is validated and tutor cannot object', invalidNote.status === 400 && wrongObjection.status === 403);
  check(
    'student objection flags the booking without payment',
    objection.status === 200 && objection.body.status === 'under_review'
      && objectionRow.status === 'confirmed' && objectionRow.dispute_status === 'flagged'
      && objectionRow.dispute_reason === 'Student objected to completion: Session did not happen'
      && (!objectionPayment || objectionPayment.status === 'requires_capture')
      && objectionNotices?.length === 1
      && objectionNotices[0].title === 'Session under review'
      && (objectionNotices[0].data as Json | undefined)?.bookingId === objectionId
      && objectionNotices[0].body?.includes('student objected to your completion claim'),
  );

  if (stripeTestMode()) {
    const tutorNoShowPi = await createManualCaptureIntent(5000);
    paymentIntentIds.push(tutorNoShowPi.id);
    const tutorNoShowId = await makeBooking(student, tutor, {
      price: 50, payout: 40, paymentIntentId: tutorNoShowPi.id,
    });
    await report(tutorNoShowId, student, 'tutor');
    await backdate(tutorNoShowId, 'no_show_claimed_at');
    await runAutoComplete();
    const tutorNoShow = await booking(tutorNoShowId);
    const cancelled = await getPaymentIntent(tutorNoShowPi.id);
    check(
      'uncontested tutor no-show claim refunds by cancelling the hold',
      tutorNoShow.status === 'no_show' && tutorNoShow.no_show_party === 'tutor'
        && cancelled.status === 'canceled' && Number(tutorNoShow.refund_percent) === 100,
      `PI=${cancelled.status}, party=${String(tutorNoShow.no_show_party)}`,
    );
  }

  if (stripeTestMode() && connectId) {
    const studentNoShowPi = await createManualCaptureIntent(5000);
    paymentIntentIds.push(studentNoShowPi.id);
    const studentNoShowId = await makeBooking(student, tutor, {
      price: 50, payout: 40, paymentIntentId: studentNoShowPi.id,
    });
    await report(studentNoShowId, tutor, 'student');
    await backdate(studentNoShowId, 'no_show_claimed_at');
    await runAutoComplete();
    const studentNoShow = await booking(studentNoShowId);
    const paidPi = await getPaymentIntent(studentNoShowPi.id);
    check(
      'uncontested student no-show claim captures and pays the tutor',
      studentNoShow.status === 'no_show' && studentNoShow.no_show_party === 'student'
        && paidPi.status === 'succeeded' && typeof studentNoShow.stripe_transfer_id === 'string',
      `PI=${paidPi.status}, transfer=${String(studentNoShow.stripe_transfer_id)}`,
    );

    const completedPi = await createManualCaptureIntent(5000);
    paymentIntentIds.push(completedPi.id);
    const delayedId = await makeBooking(student, tutor, {
      price: 50, payout: 40, paymentIntentId: completedPi.id,
    });
    await call('complete-session', tutor.token, { bookingId: delayedId });
    const beforeDue = await getPaymentIntent(completedPi.id);
    await backdate(delayedId, 'completion_claimed_at');
    await runAutoComplete();
    const delayed = await booking(delayedId);
    const afterDue = await getPaymentIntent(completedPi.id);
    check(
      'completion claim captures and pays only after the window',
      beforeDue.status === 'requires_capture' && delayed.status === 'completed'
        && afterDue.status === 'succeeded' && typeof delayed.stripe_transfer_id === 'string',
      `PI=${beforeDue.status} → ${afterDue.status}`,
    );
  } else if (stripeTestMode()) {
    console.log('⏭️ SKIP student-no-show payout and paid completion settlement: no ready Stripe test Connect account');
  }

  await testAdminOutcome(student, tutor, admin, 'tutor_no_show');
  await testAdminOutcome(student, tutor, admin, 'student_no_show');
  await testAdminOutcome(student, tutor, admin, 'completed');
} catch (error) {
  check('verification setup', false, String(error));
} finally {
  for (const paymentIntentId of paymentIntentIds) {
    try {
      const pi = await getPaymentIntent(paymentIntentId);
      if (pi.status === 'requires_capture') await cancelHold(paymentIntentId);
      else if (pi.status === 'succeeded' && pi.latest_charge) {
        const chargeId = typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge.id;
        const charge = await getCharge(chargeId);
        const refundable = Math.max(0, charge.amount_captured - charge.amount_refunded);
        if (refundable) await refundCharge(chargeId, refundable);
      }
    } catch (error) {
      check(`cleanup PaymentIntent ${paymentIntentId}`, false, String(error));
    }
  }
  if (bookingIds.length) await svc.from('bookings').delete().in('id', bookingIds);
  if (userIds.length) {
    await svc.from('notifications').delete().in('user_id', userIds);
    await svc.from('user_roles').delete().in('user_id', userIds);
    await svc.from('users').delete().in('id', userIds);
    await svc.auth.admin.deleteUser(userIds[0]!);
  }
  if (changedConnect) {
    const { data: tutor } = await svc.from('users').select('id').eq('email', 'sara@crimson.ua.edu').maybeSingle();
    if (tutor) await svc.from('tutor_profiles').update({ stripe_connect_account_id: originalConnect }).eq('user_id', tutor.id);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
