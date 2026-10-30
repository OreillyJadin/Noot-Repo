import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { DEV_PASSWORD } from './_devPassword.mjs';
import { api, auth, initSupabase, tutorEarnedAmount } from '../packages/core/src/index.ts';

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
  assert.match(historySource, /import\s*\{[^}]*\btutorEarnedAmount\b[^}]*\}\s*from\s*'@noot\/core'/);
  assert.match(historySource, /const amount = isTutor \? tutorEarnedAmount\(b\) :/);
  assert.match(historySource, /\{isTutor && amount > 0 \? '\+' : ''\}/);
  assert.doesNotMatch(historySource, /\bisTutor\s*\?\s*'\+'\s*:/);
  console.log('✅ history source uses refund-aware tutor earnings and gates the plus on positive amounts');

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
    refundPercent?: number,
  ): Promise<string> => {
    const scheduledAt = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    const row = {
      student_id: studentId,
      tutor_id: tutorId,
      subject,
      scheduled_at: scheduledAt,
      scheduled_end: new Date(Date.parse(scheduledAt) + 60 * 60_000).toISOString(),
      duration_minutes: 60,
      price: 20.25,
      student_fee: 0,
      platform_fee: 0,
      tutor_payout_amount: 20.25,
      session_type: 'in_person',
      cancellation_deadline: new Date(Date.parse(scheduledAt) - 12 * 60 * 60_000).toISOString(),
      status,
      ...(status === 'cancelled'
        ? {
            cancelled_by_role: 'student',
            cancelled_from_status: 'confirmed',
            cancelled_at: new Date().toISOString(),
            refund_percent: refundPercent,
            refund_status: 'refunded',
          }
        : {}),
    };
    const { data, error } = await service.from('bookings').insert(row).select('id').single();
    if (error || !data) throw error ?? new Error(`Could not create ${subject} booking`);
    insertedIds.push(data.id);
    return data.id;
  };

  try {
    const completedId = await insertBooking('VERIFY TUTOR EARNINGS COMPLETED', 'completed');
    const fullRefundId = await insertBooking('VERIFY TUTOR EARNINGS REFUND 100', 'cancelled', 100);
    const halfRefundId = await insertBooking('VERIFY TUTOR EARNINGS REFUND 50', 'cancelled', 50);

    const signIn = await auth.signInWithPassword('sara@crimson.ua.edu', DEV_PASSWORD);
    if (!signIn.ok) throw new Error(signIn.error);

    const past = await api.listPast('tutor');
    const expected = [
      { id: completedId, refundPercent: 0, amount: 20.25 },
      { id: fullRefundId, refundPercent: 100, amount: 0 },
      { id: halfRefundId, refundPercent: 50, amount: 10.13 },
    ];
    for (const item of expected) {
      const booking = past.find((candidate) => candidate.id === item.id);
      assert.ok(booking, `api.listPast('tutor') should include ${item.id}`);
      assert.equal(booking.refundPercent, item.refundPercent, `refundPercent for ${item.id}`);
      assert.equal(tutorEarnedAmount(booking), item.amount, `tutorEarnedAmount for ${item.id}`);
    }
    console.log('✅ api.listPast maps refundPercent and tutorEarnedAmount returns $20.25 / $0 / $10.13');
  } finally {
    await auth.signOut();
    if (insertedIds.length) {
      const { error } = await service.from('bookings').delete().in('id', insertedIds);
      if (error) throw error;
    }
  }
}

main().catch((error: unknown) => {
  console.error(`❌ verify_tutor_history_refunds: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
