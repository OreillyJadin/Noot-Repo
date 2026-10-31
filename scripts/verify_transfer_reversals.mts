// Verify proportional tutor transfer reversals against Stripe test mode and local Supabase.
// This script is intentionally not in VERIFY_SCRIPTS: it needs STRIPE_SECRET_KEY and functions serve.
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const URL = 'http://127.0.0.1:54321';
const WEBHOOK_URL = `${URL}/functions/v1/payments-webhook`;
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const KEY = process.env.STRIPE_SECRET_KEY ?? '';
const PLATFORM_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? '';
const CONNECT_SECRET = process.env.STRIPE_CONNECT_WEBHOOK_SECRET ?? '';
const PASSWORD = 'Transfer-Reversal-Verify-2026!';
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

type Json = Record<string, any>;
type Charge = Json & {
  id: string;
  amount: number;
  amount_captured: number;
  amount_refunded: number;
  refunded: boolean;
};
type Fixture = {
  bookingId: string;
  charge: Charge;
  transferIds: string[];
};
type TransferPlan = { amount: number; source: boolean };

let pass = 0;
let fail = 0;
const bookingIds: string[] = [];
const userIds: string[] = [];
const userEmails: string[] = [];
const chargeIds: string[] = [];
const transferIds: string[] = [];

function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
  if (!ok) throw new Error(name);
}

function signature(secret: string, payload: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

function eventPayload(type: string, object: Json): string {
  return JSON.stringify({
    id: `evt_transfer_reversal_${randomBytes(8).toString('hex')}`,
    object: 'event',
    type,
    api_version: '2024-06-20',
    data: { object },
  });
}

async function postPayload(payload: string): Promise<Response> {
  return fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': signature(PLATFORM_SECRET, payload),
    },
    body: payload,
  });
}

async function stripeRequest<T extends Json>(
  path: string,
  body?: Record<string, string>,
  idempotencyKey?: string,
): Promise<T> {
  if (!KEY.startsWith('sk_test_')) throw new Error('STRIPE_SECRET_KEY must be an sk_test_ key');
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Stripe-Version': '2024-06-20',
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    ...(body ? { body: new URLSearchParams(body) } : {}),
  });
  const result = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(`Stripe ${path} failed (${response.status}): ${result.error?.message ?? 'unknown error'}`);
  }
  return result;
}

async function createUsers(): Promise<void> {
  const stamp = Date.now();
  for (const [role, firstName, lastName] of [
    ['student', 'Transfer', 'Student'],
    ['tutor', 'Transfer', 'Tutor'],
    ['admin', 'Transfer', 'Admin'],
  ] as const) {
    const email = `transfer-reversal-${role}+${stamp}@crimson.ua.edu`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName },
    });
    if (error || !data.user) throw error ?? new Error(`could not create ${role}`);
    userIds.push(data.user.id);
    userEmails.push(email);
    const now = new Date().toISOString();
    const { error: updateError } = await admin.from('users').update({
      first_name: firstName,
      last_name: lastName,
      date_of_birth: '2000-01-15',
      password_set_at: now,
      terms_accepted_at: now,
      terms_version: '2026-09-17',
      guidelines_accepted_at: now,
      guidelines_version: '2026-10-13',
    }).eq('id', data.user.id);
    if (updateError) throw updateError;
    const { error: roleError } = await admin.from('user_roles').upsert(
      { user_id: data.user.id, role },
      { onConflict: 'user_id,role' },
    );
    if (roleError) throw roleError;
  }
}

async function createBooking(priceCents: number, payoutCents: number): Promise<string> {
  const id = randomUUID();
  const scheduledAt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const { error } = await admin.from('bookings').insert({
    id,
    student_id: userIds[0],
    tutor_id: userIds[1],
    subject: 'MGT 300',
    scheduled_at: scheduledAt,
    duration_minutes: 60,
    price: priceCents / 100,
    platform_fee: 0,
    tutor_payout_amount: payoutCents / 100,
    session_type: 'in_person',
    status: 'completed',
    cancellation_deadline: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  });
  if (error) throw error;
  bookingIds.push(id);
  return id;
}

async function updateBooking(
  bookingId: string,
  chargeId: string,
  transferId: string | null,
): Promise<void> {
  const { error } = await admin.from('bookings').update({
    stripe_payment_intent_id: await paymentIntentForCharge(chargeId),
    stripe_charge_id: chargeId,
    stripe_transfer_id: transferId,
  }).eq('id', bookingId);
  if (error) throw error;
}

async function paymentIntentForCharge(chargeId: string): Promise<string> {
  const charge = await stripeRequest<Charge>(`charges/${chargeId}`);
  return typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent.id;
}

async function createCharge(amountCents: number, capturedCents: number): Promise<Charge> {
  const paymentIntent = await stripeRequest<Json>('payment_intents', {
    amount: String(amountCents),
    currency: 'usd',
    capture_method: 'manual',
    payment_method: 'pm_card_visa',
    confirm: 'true',
    'automatic_payment_methods[enabled]': 'true',
    'automatic_payment_methods[allow_redirects]': 'never',
    'metadata[purpose]': 'verify_transfer_reversals',
  });
  const captured = await stripeRequest<Json>(`payment_intents/${paymentIntent.id}/capture`, {
    amount_to_capture: String(capturedCents),
    'expand[]': 'latest_charge',
  });
  const latestCharge = captured.latest_charge;
  const chargeId = typeof latestCharge === 'string' ? latestCharge : latestCharge?.id;
  if (!chargeId) throw new Error('capture did not return latest_charge');
  chargeIds.push(chargeId);
  return stripeRequest<Charge>(`charges/${chargeId}`);
}

async function createTransfer(
  amount: number,
  bookingId: string,
  chargeId: string,
  destination: string,
  source: boolean,
): Promise<Json> {
  const body: Record<string, string> = {
    amount: String(amount),
    currency: 'usd',
    destination,
    transfer_group: bookingId,
    'metadata[booking_id]': bookingId,
  };
  if (source) body.source_transaction = chargeId;
  const transfer = await stripeRequest<Json>('transfers', body);
  if (!transfer.id) throw new Error('transfer did not return an id');
  transferIds.push(transfer.id);
  return transfer;
}

async function makeFixture(
  amountCents: number,
  capturedCents: number,
  payoutCents: number,
  transferPlan: TransferPlan[],
  destination: string,
): Promise<Fixture> {
  const bookingId = await createBooking(amountCents, payoutCents);
  const charge = await createCharge(amountCents, capturedCents);
  const createdTransfers: Json[] = [];
  for (const plan of transferPlan) {
    createdTransfers.push(await createTransfer(plan.amount, bookingId, charge.id, destination, plan.source));
  }
  await updateBooking(bookingId, charge.id, createdTransfers[0]?.id ?? null);
  return { bookingId, charge, transferIds: createdTransfers.map((transfer) => transfer.id as string) };
}

async function refundCharge(charge: Charge, amount: number): Promise<{ charge: Charge; refundId: string }> {
  const refund = await stripeRequest<Json>('refunds', { charge: charge.id, amount: String(amount) });
  if (!refund.id) throw new Error('refund did not return an id');
  return { charge: await stripeRequest<Charge>(`charges/${charge.id}`), refundId: refund.id };
}

async function deliverRefund(charge: Charge): Promise<{ payload: string; response: Response }> {
  const payload = eventPayload('charge.refunded', charge);
  return { payload, response: await postPayload(payload) };
}

async function checkWebhook(name: string, response: Response): Promise<void> {
  const body = await response.text();
  check(name, response.status === 200, `HTTP ${response.status}${body ? `: ${body}` : ''}`);
}

async function reversalRows(bookingId: string): Promise<Json[]> {
  const { data, error } = await admin.from('tutor_transfer_reversals')
    .select('stripe_refund_id, stripe_transfer_id, amount_cents, status, stripe_reversal_id, last_error')
    .eq('booking_id', bookingId)
    .order('created_at');
  if (error) throw error;
  return data as Json[];
}

async function verifyReversalTableRls(bookingId: string): Promise<void> {
  const student = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: studentSignInError } = await student.auth.signInWithPassword({
    email: userEmails[0]!,
    password: PASSWORD,
  });
  if (studentSignInError) throw studentSignInError;
  const { data: studentRows, error: studentReadError } = await student
    .from('tutor_transfer_reversals')
    .select('stripe_refund_id')
    .eq('booking_id', bookingId);
  check('student cannot read tutor reversal rows',
    !studentReadError && studentRows.length === 0,
    studentReadError?.message ?? `${studentRows.length} rows visible`);
  const { error: studentWriteError } = await student.from('tutor_transfer_reversals').insert({
    booking_id: bookingId,
    stripe_charge_id: 'ch_verify_denied',
    stripe_refund_id: `re_verify_denied_${randomUUID()}`,
    stripe_transfer_id: 'tr_verify_denied',
    amount_cents: 1,
    status: 'failed',
  });
  check('student cannot insert tutor reversal rows',
    !!studentWriteError && /permission|row-level security/i.test(studentWriteError.message),
    studentWriteError?.message ?? 'insert unexpectedly succeeded');

  const authenticatedAdmin = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: adminSignInError } = await authenticatedAdmin.auth.signInWithPassword({
    email: userEmails[2]!,
    password: PASSWORD,
  });
  if (adminSignInError) throw adminSignInError;
  const { data: adminRows, error: adminReadError } = await authenticatedAdmin
    .from('tutor_transfer_reversals')
    .select('stripe_refund_id')
    .eq('booking_id', bookingId);
  check('authenticated admin can read tutor reversal rows',
    !adminReadError && adminRows.length > 0,
    adminReadError?.message ?? `${adminRows.length} rows visible`);
}

async function transferReversals(transferId: string): Promise<Json[]> {
  const result = await stripeRequest<Json>(`transfers/${transferId}/reversals?limit=100`);
  return (result.data ?? []) as Json[];
}

async function reverseTransfer(
  transferId: string,
  amount: number,
  idempotencyKey = `verify-transfer-reversal-${randomUUID()}`,
  metadata?: Record<string, string>,
): Promise<Json> {
  const body: Record<string, string> = { amount: String(amount) };
  for (const [key, value] of Object.entries(metadata ?? {})) body[`metadata[${key}]`] = value;
  return stripeRequest<Json>(`transfers/${transferId}/reversals`, body, idempotencyKey);
}

async function connectedAccount(): Promise<string> {
  const configured = process.env.NOOT_VERIFY_CONNECT_ACCOUNT;
  if (configured) return configured;
  const accounts = await stripeRequest<Json>('accounts?limit=100');
  const account = (accounts.data ?? []).find(
    (item: Json) => item.capabilities?.transfers === 'active' && item.payouts_enabled,
  );
  if (!account?.id) throw new Error('No test-mode connected account with transfers active');
  return account.id as string;
}

async function runCases(destination: string): Promise<void> {
  console.log('— case 1: proportional reversal and idempotent redelivery —');
  const first = await makeFixture(3500, 3500, 3000, [{ amount: 3000, source: true }], destination);
  const firstRefund = await refundCharge(first.charge, 1000);
  const firstEvent = await deliverRefund(firstRefund.charge);
  await checkWebhook('first refund webhook returns 200', firstEvent.response);
  const firstRows = await reversalRows(first.bookingId);
  check('first refund records one reversed 857-cent row',
    firstRows.length === 1 && firstRows[0]?.amount_cents === 857 && firstRows[0]?.status === 'reversed');
  await verifyReversalTableRls(first.bookingId);
  const firstReversals = await transferReversals(first.transferIds[0]!);
  check('first Stripe reversal carries refund metadata',
    firstReversals.filter((item) => item.metadata?.refund_id === firstRefund.refundId).length === 1 &&
      firstReversals.find((item) => item.metadata?.refund_id === firstRefund.refundId)?.amount === 857);
  const firstRepeat = await postPayload(firstEvent.payload);
  await checkWebhook('same event redelivery returns 200', firstRepeat);
  check('same event leaves exactly one reversal',
    (await transferReversals(first.transferIds[0]!)).filter((item) => item.metadata?.refund_id === firstRefund.refundId).length === 1);

  console.log('— case 2: cumulative refunds add only the new rounded share —');
  const secondRefund = await refundCharge(first.charge, 500);
  const secondEvent = await deliverRefund(secondRefund.charge);
  await checkWebhook('second refund webhook returns 200', secondEvent.response);
  let rows = await reversalRows(first.bookingId);
  check('second refund adds exactly 429 cents',
    rows.length === 2 && rows.some((row) => row.stripe_refund_id === secondRefund.refundId && row.amount_cents === 429));
  check('second refund total is 1286 cents',
    (await transferReversals(first.transferIds[0]!))
      .filter((item) => item.metadata?.reason === 'stripe_refund')
      .reduce((sum, item) => sum + Number(item.amount), 0) === 1286);
  const secondRepeat = await postPayload(firstEvent.payload);
  await checkWebhook('first event redelivery after a later refund returns 200', secondRepeat);
  check('first event redelivery does not add a row', (await reversalRows(first.bookingId)).length === 2);

  console.log('— case 3: full refund reverses the remaining tutor payout —');
  const thirdRefund = await refundCharge(first.charge, 2000);
  const thirdEvent = await deliverRefund(thirdRefund.charge);
  await checkWebhook('final refund webhook returns 200', thirdEvent.response);
  rows = await reversalRows(first.bookingId);
  check('final refund reaches exactly 3000 reversed cents',
    rows.length === 3 && rows.reduce((sum, row) => sum + Number(row.amount_cents), 0) === 3000);
  const fullyReversed = await stripeRequest<Json>(`transfers/${first.transferIds[0]!}`);
  check('full refund marks the transfer reversed',
    fullyReversed.amount_reversed === 3000 && fullyReversed.reversed === true);
  const thirdRepeat = await postPayload(thirdEvent.payload);
  await checkWebhook('final event redelivery returns 200', thirdRepeat);
  check('final event redelivery does not add a new reversal', (await reversalRows(first.bookingId)).length === 3);

  console.log('— case 4: credit-style payout reverses both transfers —');
  const credit = await makeFixture(
    1000,
    1000,
    3000,
    [{ amount: 1000, source: true }, { amount: 2000, source: false }],
    destination,
  );
  const creditRefund = await refundCharge(credit.charge, 1000);
  const creditEvent = await deliverRefund(creditRefund.charge);
  await checkWebhook('credit-style refund webhook returns 200', creditEvent.response);
  rows = await reversalRows(credit.bookingId);
  check('credit-style refund reverses both transfers for 3000 cents',
    rows.length === 2 && rows.every((row) => row.status === 'reversed') &&
      rows.reduce((sum, row) => sum + Number(row.amount_cents), 0) === 3000);
  for (const transferId of credit.transferIds) {
    const transfer = await stripeRequest<Json>(`transfers/${transferId}`);
    check(`credit-style transfer ${transferId} is fully reversed`, transfer.reversed === true);
  }

  console.log('— case 5: released authorization is ignored, real refund is reversed —');
  const lateCancel = await makeFixture(3500, 1750, 1500, [{ amount: 1500, source: true }], destination);
  const releaseEvent = await deliverRefund(await stripeRequest<Charge>(`charges/${lateCancel.charge.id}`));
  await checkWebhook('late-cancel release event returns 200', releaseEvent.response);
  check('released authorization creates no tutor reversal', (await reversalRows(lateCancel.bookingId)).length === 0);
  const lateRefund = await refundCharge(lateCancel.charge, 875);
  const lateEvent = await deliverRefund(lateRefund.charge);
  await checkWebhook('late-cancel real refund webhook returns 200', lateEvent.response);
  rows = await reversalRows(lateCancel.bookingId);
  check('late-cancel real refund reverses 750 cents',
    rows.length === 1 && rows[0]?.amount_cents === 750 && rows[0]?.status === 'reversed');
  const lateRemaining = await refundCharge(lateCancel.charge, 875);
  await checkWebhook('late-cancel remaining refund webhook returns 200',
    (await deliverRefund(lateRemaining.charge)).response);

  console.log('— case 6: a manual full transfer reversal leaves no failed row —');
  const manual = await makeFixture(3500, 3500, 3000, [{ amount: 3000, source: true }], destination);
  await reverseTransfer(manual.transferIds[0]!, 3000);
  const manualRefund = await refundCharge(manual.charge, 1000);
  const manualEvent = await deliverRefund(manualRefund.charge);
  await checkWebhook('manual-reversal refund webhook returns 200', manualEvent.response);
  check('manual reversal leaves no transfer-reversal row', (await reversalRows(manual.bookingId)).length === 0);

  console.log('— case 7: idempotency conflict is recorded while webhook still succeeds —');
  const conflict = await makeFixture(3500, 3500, 3000, [{ amount: 3000, source: true }], destination);
  const conflictRefund = await refundCharge(conflict.charge, 1000);
  const conflictKey = `reversal_${conflictRefund.refundId}_${conflict.transferIds[0]!}`;
  await reverseTransfer(conflict.transferIds[0]!, 1, conflictKey);
  const conflictEvent = await deliverRefund(conflictRefund.charge);
  await checkWebhook('idempotency-conflict webhook still returns 200', conflictEvent.response);
  rows = await reversalRows(conflict.bookingId);
  check('idempotency conflict records one failed row with an error',
    rows.length === 1 && rows[0]?.status === 'failed' && !!rows[0]?.last_error);

  console.log('— case 8: a booking without a transfer makes no Stripe reversal call —');
  const noTransfer = await makeFixture(1000, 1000, 0, [], destination);
  const noTransferRefund = await refundCharge(noTransfer.charge, 1000);
  const noTransferEvent = await deliverRefund(noTransferRefund.charge);
  await checkWebhook('refund-only booking webhook returns 200', noTransferEvent.response);
  check('refund-only booking records no reversal row', (await reversalRows(noTransfer.bookingId)).length === 0);
}

async function cleanup(): Promise<void> {
  for (const transferId of transferIds) {
    try {
      const transfer = await stripeRequest<Json>(`transfers/${transferId}`);
      const remaining = Math.max(0, Number(transfer.amount) - Number(transfer.amount_reversed));
      if (remaining > 0) await reverseTransfer(transferId, remaining);
    } catch (error) {
      fail++;
      console.error(`FAIL Stripe transfer cleanup ${transferId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (bookingIds.length > 0) {
    const { error: bookingError } = await admin.from('bookings').delete().in('id', bookingIds);
    if (bookingError) {
      fail++;
      console.error(`FAIL local booking cleanup: ${bookingError.message}`);
    }
  }
  for (const userId of userIds) {
    const { error: authError } = await admin.auth.admin.deleteUser(userId);
    if (authError && !/not found/i.test(authError.message)) {
      fail++;
      console.error(`FAIL auth user cleanup: ${authError.message}`);
    }
    const { error: userError } = await admin.from('users').delete().eq('id', userId);
    if (userError) {
      fail++;
      console.error(`FAIL public user cleanup: ${userError.message}`);
    }
  }
}

async function main(): Promise<void> {
  if (
    !PLATFORM_SECRET.startsWith('whsec_test_') ||
    !CONNECT_SECRET.startsWith('whsec_test_') ||
    PLATFORM_SECRET === CONNECT_SECRET
  ) {
    throw new Error('STRIPE_WEBHOOK_SECRET and STRIPE_CONNECT_WEBHOOK_SECRET must be whsec_test_ values');
  }
  const destination = await connectedAccount();
  await createUsers();
  await runCases(destination);
  console.log(`verify_transfer_reversals: ${pass} checks passed`);
}

try {
  await main();
} catch (error) {
  fail++;
  console.error(`FAIL verify_transfer_reversals: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  await cleanup();
}

if (fail > 0) process.exitCode = 1;
