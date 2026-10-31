import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { DEV_PASSWORD } from './_devPassword.mjs';

const url = 'http://127.0.0.1:54321';
const anon = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const service = createClient(url, serviceKey, { auth: { persistSession: false } });
const sql = spawnSync('docker', ['exec', 'supabase_db_noot', 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-c',
  "select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'bookings' and column_name = 'refunded_cents' and data_type = 'integer'"], { encoding: 'utf8' });
assert.equal(sql.status, 0, sql.stderr);
assert.equal(sql.stdout.trim(), 'YES', 'refunded_cents must exist, be integer and nullable');
console.log('✅ refunded_cents exists and is nullable');

async function signIn(email: string) {
  const client = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: DEV_PASSWORD });
  if (error || !data.user) throw error ?? new Error('user not found');
  return { client, id: data.user.id };
}

const student = await signIn('student@crimson.ua.edu');
const tutor = await signIn('sara@crimson.ua.edu');
const scheduled = new Date(Date.now() - 72 * 3600_000);
const { data: booking, error: insertError } = await service.from('bookings').insert({
  student_id: student.id, tutor_id: tutor.id, subject: 'VERIFY REFUNDED CENTS',
  scheduled_at: scheduled.toISOString(), duration_minutes: 60, price: 30, student_fee: 5.1,
  platform_fee: 5, tutor_payout_amount: 25, session_type: 'in_person', status: 'completed',
  cancellation_deadline: new Date(scheduled.getTime() - 12 * 3600_000).toISOString(),
}).select('id, refunded_cents').single();
if (insertError || !booking) throw insertError ?? new Error('booking insert failed');
try {
  assert.equal(booking.refunded_cents, null);
  const negative = await service.from('bookings').update({ refunded_cents: -1 }).eq('id', booking.id);
  assert.ok(negative.error, 'negative cents must be rejected');
  console.log('✅ negative cents rejected');
  const write = await service.from('bookings').update({ refunded_cents: 1000 }).eq('id', booking.id);
  if (write.error) throw write.error;
  for (const [role, client] of [['student', student.client], ['tutor', tutor.client]] as const) {
    await client.from('bookings').update({ refunded_cents: 1 }).eq('id', booking.id);
    const { data, error } = await service.from('bookings').select('refunded_cents').eq('id', booking.id).single();
    if (error) throw error;
    assert.equal(data.refunded_cents, 1000, `${role} must not change refunded cents`);
    console.log(`✅ ${role} cannot update refunded_cents`);
  }
  const { data, error } = await service.from('bookings').select('refunded_cents').eq('id', booking.id).single();
  if (error) throw error;
  assert.equal(data.refunded_cents, 1000);
  console.log('✅ service-role write succeeds');
} finally {
  const { error } = await service.from('bookings').delete().eq('id', booking.id);
  if (error) throw error;
}
