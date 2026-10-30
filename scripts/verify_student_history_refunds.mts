import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { DEV_PASSWORD } from './_devPassword.mjs';
import { api, auth, initSupabase, studentPaidAmount } from '../packages/core/src/index.ts';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const mobileRoot = fileURLToPath(new globalThis.URL('../apps/mobile', import.meta.url));
const historySource = readFileSync(join(mobileRoot, 'app/history.tsx'), 'utf8');
const service = createClient(URL, SERVICE, { auth: { persistSession: false } });
const insertedIds: string[] = [];

async function main() {
  assert.match(historySource, /import\s*\{[^}]*\bstudentPaidAmount\b[^}]*\}\s*from\s*'@noot\/core'/);
  assert.match(historySource, /const paid = isTutor \? null : studentPaidAmount\(b\);/);
  assert.match(historySource, /const amount = isTutor \? tutorEarnedAmount\(b\) : \(paid\?\.net \?\? 0\);/);
  assert.doesNotMatch(historySource, /b\.price \+ b\.studentFee - b\.creditApplied/);
  assert.match(historySource, /textDecorationLine: 'line-through'/);
  assert.match(historySource, /refunded to your card/);
  assert.match(historySource, /back as Noot credit/);
  console.log('✅ history source shows the student amount net of refunds, original struck through, with refund note');

  initSupabase({ url: URL, anonKey: ANON });
  const { data: users, error: usersError } = await service
    .from('users')
    .select('id,email')
    .in('email', ['student@crimson.ua.edu', 'sara@crimson.ua.edu']);
  if (usersError) throw usersError;
  const studentId = users?.find((user) => user.email === 'student@crimson.ua.edu')?.id;
  const tutorId = users?.find((user) => user.email === 'sara@crimson.ua.edu')?.id;
  assert.ok(studentId && tutorId, 'seeded student and Sara tutor must exist; run node supabase/seed_demo.mjs');

  const insertBooking = async (
    subject: string,
    status: 'completed' | 'cancelled',
    refundPercent: number,
    creditApplied: number,
  ): Promise<string> => {
    const scheduledAt = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    const row = {
      student_id: studentId,
      tutor_id: tutorId,
      subject,
      scheduled_at: scheduledAt,
      scheduled_end: new Date(Date.parse(scheduledAt) + 60 * 60_000).toISOString(),
      duration_minutes: 60,
      price: 25,
      student_fee: 4.25,
      credit_applied: creditApplied,
      platform_fee: 4.38,
      tutor_payout_amount: 20.62,
      session_type: 'in_person',
      cancellation_deadline: new Date(Date.parse(scheduledAt) - 12 * 60 * 60_000).toISOString(),
      status,
      ...(status === 'cancelled'
        ? {
            cancelled_by_role: 'student',
            cancelled_from_status: 'confirmed',
            cancelled_at: new Date().toISOString(),
            refund_percent: refundPercent,
            refund_status: refundPercent > 0 ? 'refunded' : 'not_refunded',
          }
        : {}),
    };
    const { data, error } = await service.from('bookings').insert(row).select('id').single();
    if (error || !data) throw error ?? new Error(`Could not create ${subject} booking`);
    insertedIds.push(data.id);
    return data.id;
  };

  try {
    const expected = [
      { id: await insertBooking('VERIFY STUDENT PAID COMPLETED', 'completed', 0, 0), charged: 29.25, net: 29.25, refundedToCard: 0, creditReturned: 0 },
      { id: await insertBooking('VERIFY STUDENT PAID REFUND 100', 'cancelled', 100, 0), charged: 29.25, net: 0, refundedToCard: 29.25, creditReturned: 0 },
      { id: await insertBooking('VERIFY STUDENT PAID REFUND 50', 'cancelled', 50, 0), charged: 29.25, net: 14.63, refundedToCard: 14.62, creditReturned: 0 },
      { id: await insertBooking('VERIFY STUDENT PAID REFUND 50 CREDIT', 'cancelled', 50, 10), charged: 19.25, net: 9.63, refundedToCard: 9.62, creditReturned: 5 },
      { id: await insertBooking('VERIFY STUDENT PAID REFUND 0', 'cancelled', 0, 0), charged: 29.25, net: 29.25, refundedToCard: 0, creditReturned: 0 },
    ];

    const signIn = await auth.signInWithPassword('student@crimson.ua.edu', DEV_PASSWORD);
    if (!signIn.ok) throw new Error(signIn.error);

    const past = await api.listPast('student');
    for (const { id, ...amounts } of expected) {
      const booking = past.find((candidate) => candidate.id === id);
      assert.ok(booking, `api.listPast('student') should include ${id}`);
      assert.deepEqual(studentPaidAmount(booking), amounts, `studentPaidAmount for ${booking.subject}`);
    }
    console.log('✅ api.listPast maps price/fee/credit/refundPercent; studentPaidAmount nets out card refunds and returned credit');
  } finally {
    await auth.signOut();
    if (insertedIds.length) {
      const { error } = await service.from('bookings').delete().in('id', insertedIds);
      if (error) throw error;
    }
  }
}

main().catch((error: unknown) => {
  console.error(`❌ verify_student_history_refunds: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
