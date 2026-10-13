// Verify cancellation refund tiers and authorization against the LOCAL stack.
// Needs: SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io supabase start && node supabase/seed_demo.mjs
import { createClient } from '@supabase/supabase-js';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const results: { name: string; ok: boolean; detail?: string }[] = [];
const ids: string[] = [];

function check(name: string, ok: boolean, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function signIn(email: string) {
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: 'password123' });
  if (error || !data.session) throw new Error(`${email} sign-in failed: ${error?.message ?? 'no session'}`);
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) throw new Error(`${email} getUser failed: ${userError?.message ?? 'no user'}`);
  return { id: userData.user.id, token: data.session.access_token };
}

async function createBooking(studentId: string, tutorId: string, hoursUntil: number) {
  const scheduledAt = new Date(Date.now() + hoursUntil * 60 * 60 * 1000);
  const { data, error } = await admin
    .from('bookings')
    .insert({
      student_id: studentId,
      tutor_id: tutorId,
      subject: 'MGT 300',
      scheduled_at: scheduledAt.toISOString(),
      duration_minutes: 60,
      price: 50,
      platform_fee: 8.75,
      tutor_payout_amount: 41.25,
      session_type: 'in_person',
      location: 'Local verification',
      status: 'confirmed',
      cancellation_deadline: new Date(scheduledAt.getTime() - 12 * 60 * 60 * 1000).toISOString(),
      refund_status: 'not_applicable',
      stripe_payment_intent_id: null,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`Could not create test booking: ${error?.message ?? 'no row returned'}`);
  ids.push(data.id);
  return data.id as string;
}

async function cancel(bookingId: string, token: string) {
  const response = await fetch(`${URL}/functions/v1/cancel-booking`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ bookingId }),
  });
  const body = await response.json();
  return { response, body };
}

async function verifyRefund(name: string, bookingId: string, token: string, expected: number) {
  const { response, body } = await cancel(bookingId, token);
  const { data: row, error } = await admin
    .from('bookings')
    .select('status, refund_percent, stripe_charge_id, stripe_transfer_id, payout_failed_at')
    .eq('id', bookingId)
    .single();
  const ok =
    response.ok &&
    body.refundPercent === expected &&
    row?.status === 'cancelled' &&
    row?.refund_percent === expected &&
    !row?.stripe_charge_id &&
    !row?.stripe_transfer_id &&
    !row?.payout_failed_at &&
    !error;
  check(name, ok, `HTTP ${response.status}, response refund=${body.refundPercent}, row refund=${row?.refund_percent}${error ? `, DB error=${error.message}` : ''}`);
}

try {
  const student = await signIn('student@crimson.ua.edu');
  const tutor = await signIn('sara@crimson.ua.edu');
  const outsider = await signIn('devon@crimson.ua.edu');
  const bookings = [
    { id: await createBooking(student.id, tutor.id, 13), hours: 13, refund: 100 },
    { id: await createBooking(student.id, tutor.id, 5), hours: 5, refund: 50 },
    { id: await createBooking(student.id, tutor.id, 1), hours: 1, refund: 0 },
  ];

  for (const booking of bookings) {
    await verifyRefund(`student cancel at +${booking.hours}h returns ${booking.refund}%`, booking.id, student.token, booking.refund);
  }

  const tutorCancelId = await createBooking(student.id, tutor.id, 1);
  await verifyRefund('tutor cancel at +1h returns 100%', tutorCancelId, tutor.token, 100);

  const unauthorized = await cancel(bookings[0]!.id, outsider.token);
  check('third user cannot cancel a booking (403)', unauthorized.response.status === 403, `HTTP ${unauthorized.response.status}`);
} finally {
  if (ids.length) {
    const { error } = await admin.from('bookings').delete().in('id', ids);
    if (error) console.error(`Test booking cleanup failed: ${error.message}`);
    else console.log(`🧹 cleaned up ${ids.length} test bookings`);
  }
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
