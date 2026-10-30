import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { api, auth, initSupabase } from '../packages/core/src/index.ts';
import { DEV_PASSWORD } from './_devPassword.mjs';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
assert.ok(['127.0.0.1', 'localhost'].includes(new globalThis.URL(URL).hostname), 'local stack only');
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const client = initSupabase({ url: URL, anonKey: ANON });
const users: string[] = [];
const bookings: string[] = [];
const tag = Date.now();

async function user(role: 'student' | 'tutor') {
  const email = `rating-notice-${role}-${tag}@crimson.ua.edu`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: DEV_PASSWORD, email_confirm: true });
  if (error || !data.user) throw error ?? new Error('createUser failed');
  const id = data.user.id;
  users.push(id);
  const { error: roleError } = await admin.from('user_roles').upsert({ user_id: id, role });
  if (roleError) throw roleError;
  return { id, email };
}

async function setStatus(id: string, status: string) {
  const { error } = await admin.from('bookings').update({ status }).eq('id', id);
  if (error) throw error;
}

async function notices(id: string) {
  const { data, error } = await admin.from('notifications').select('*')
    .contains('data', { bookingId: id, event: 'rate_session' });
  if (error) throw error;
  return data ?? [];
}

async function login(email: string) {
  const { error } = await auth.signInWithPassword(email, DEV_PASSWORD);
  if (error) throw error;
}

try {
  const student = await user('student');
  const tutor = await user('tutor');
  const makeBooking = async (status = 'confirmed') => {
    const start = Date.now() - (bookings.length + 1) * 86400000;
    const { data, error } = await admin.from('bookings').insert({
      student_id: student.id, tutor_id: tutor.id, subject: 'MATH 125',
      scheduled_at: new Date(start).toISOString(), duration_minutes: 60,
      price: 40, platform_fee: 7, tutor_payout_amount: 33, session_type: 'in_person', status,
      cancellation_deadline: new Date(start - 86400000).toISOString(),
    }).select('id').single();
    if (error || !data) throw error ?? new Error('booking insert failed');
    bookings.push(data.id);
    return data.id as string;
  };

  const id = await makeBooking();
  assert.equal((await notices(id)).length, 0, 'confirmed sessions do not prompt');
  await login(student.email);
  await client.from('bookings').update({ status: 'completed' }).eq('id', id);
  const { data: unchanged, error: readError } = await admin.from('bookings').select('status').eq('id', id).single();
  if (readError) throw readError;
  assert.equal(unchanged.status, 'confirmed', 'a student cannot manufacture completion');
  assert.equal((await notices(id)).length, 0);

  await setStatus(id, 'completed');
  const rows = await notices(id);
  assert.equal(rows.length, 1, 'one prompt on confirmed -> completed');
  assert.equal(rows[0].user_id, student.id);
  assert.equal(rows[0].type, 'booking');
  assert.deepEqual(rows[0].data, { bookingId: id, event: 'rate_session' });
  assert.match(rows[0].body, /MATH 125/);
  await setStatus(id, 'completed');
  await setStatus(id, 'confirmed');
  await setStatus(id, 'completed');
  assert.equal((await notices(id)).length, 1, 'retries and repeated transitions do not duplicate the prompt');

  const { data: own, error: ownError } = await client.from('notifications').select('id').eq('id', rows[0].id);
  if (ownError) throw ownError;
  assert.equal(own?.length, 1, 'student reads their notification under RLS');
  const { error: forgeError } = await client.rpc('notify_on_session_completed');
  assert.ok(forgeError, 'trigger function cannot be called by a normal user');
  const { error: insertError } = await client.from('notifications').insert({
    user_id: student.id, type: 'booking', title: 'Forged', data: { bookingId: id, event: 'rate_session' },
  });
  assert.ok(insertError, 'normal users cannot forge notifications');
  const { error: reviewError } = await client.from('reviews').insert({
    booking_id: id, reviewer_id: student.id, subject_user_id: tutor.id, rating: 5,
  });
  assert.ok(reviewError, 'reviews still require the guarded server endpoint');

  const addReview = async (bookingId: string, reviewer: string, subject: string) => {
    const { error } = await admin.from('reviews').insert({
      booking_id: bookingId, reviewer_id: reviewer, subject_user_id: subject, rating: 5, approval_status: 'pending',
    });
    if (error) throw error;
  };
  await addReview(id, student.id, tutor.id);
  assert.deepEqual(await api.reviews.listRatedBookingIds([id]), [id], 'own pending review counts as rated');
  await login(tutor.email);
  const { data: hidden, error: hiddenError } = await client.from('notifications').select('id').eq('id', rows[0].id);
  if (hiddenError) throw hiddenError;
  assert.equal(hidden?.length, 0, 'tutor cannot read the student prompt');
  assert.deepEqual(await api.reviews.listRatedBookingIds([id]), [], 'student review does not hide tutor entry');
  await addReview(id, tutor.id, student.id);
  assert.deepEqual(await api.reviews.listRatedBookingIds([id]), [id], 'tutor can have their own pending review');

  const alreadyRated = await makeBooking('completed');
  await addReview(alreadyRated, student.id, tutor.id);
  await setStatus(alreadyRated, 'confirmed');
  await setStatus(alreadyRated, 'completed');
  assert.equal((await notices(alreadyRated)).length, 0, 'no prompt when student has already rated');
  const cancelled = await makeBooking();
  await setStatus(cancelled, 'cancelled');
  assert.equal((await notices(cancelled)).length, 0, 'cancellation does not prompt');
  console.log('verify_rating_notifications: completion, deduplication, RLS and two-sided rated lookup passed');
} finally {
  await auth.signOut();
  if (bookings.length) {
    const { error } = await admin.from('reviews').delete().in('booking_id', bookings);
    if (error) throw error;
    const { error: bookingError } = await admin.from('bookings').delete().in('id', bookings);
    if (bookingError) throw bookingError;
  }
  for (const id of users) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw error;
  }
}
