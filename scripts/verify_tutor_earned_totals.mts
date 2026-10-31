// Local Supabase only; no Edge Functions or Stripe credentials needed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { api, auth, initSupabase, tutorEarnedAmount, type BookingStatus } from '../packages/core/src/index.ts';
import { lateCancelTutorPayoutCents } from '../supabase/functions/_shared/cancellation.ts';
import { DEV_PASSWORD } from './_devPassword.mjs';

const URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const ANON = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
assert(['127.0.0.1', 'localhost'].includes(new globalThis.URL(URL).hostname), 'local Supabase only');
const service = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
initSupabase({ url: URL, anonKey: ANON });
const users: string[] = [];
const bookings: string[] = [];
const now = Date.now();

async function createUser(role: 'student' | 'tutor') {
  const email = `earned-${role}-${crypto.randomUUID()}@crimson.ua.edu`;
  const { data, error } = await service.auth.admin.createUser({ email, password: DEV_PASSWORD, email_confirm: true });
  if (error || !data.user) throw error ?? new Error('missing user');
  users.push(data.user.id);
  const { error: roleError } = await service.from('user_roles').upsert({ user_id: data.user.id, role });
  if (roleError) throw roleError;
  return { id: data.user.id, email };
}

try {
  for (const refundPercent of [0, 50, 100]) {
    assert.equal(
      Math.round(tutorEarnedAmount({ status: 'cancelled', refundStatus: 'not_applicable', tutorPayoutAmount: 20.25, refundPercent }) * 100),
      lateCancelTutorPayoutCents(20.25, refundPercent),
      `displayed cancellation earnings match the server's cent rounding at ${refundPercent}%`,
    );
  }
  for (const screen of ['tutor_home', 'tutor_profile']) {
    const source = readFileSync(new globalThis.URL(`../apps/mobile/app/${screen}.tsx`, import.meta.url), 'utf8');
    assert.match(source, /api\.tutorStats\(\)/, `${screen} reads shared earnings totals`);
  }

  const student = await createUser('student');
  const tutor = await createUser('tutor');
  const otherTutor = await createUser('tutor');
  const login = await auth.signInWithPassword(tutor.email, DEV_PASSWORD);
  assert(login.ok, 'tutor signs in through core');
  const empty = await api.tutorStats();
  assert.equal(empty.earnedTotal, 0);
  assert.equal(empty.earnedThisWeek, 0);

  const fixtures: {
    name: string;
    status: BookingStatus;
    hoursAgo: number;
    refundPercent: number;
    earnedCents: number;
    cancelledBy?: 'student' | 'tutor';
    noShowParty?: 'student' | 'tutor';
    asStudent?: boolean;
  }[] = [
    { name: 'completed', status: 'completed', hoursAgo: 24, refundPercent: 0, earnedCents: 2025 },
    { name: 'half-refund late cancel', status: 'cancelled', hoursAgo: 26, refundPercent: 50, earnedCents: 1013, cancelledBy: 'student' },
    { name: 'no-refund late cancel', status: 'cancelled', hoursAgo: 28, refundPercent: 0, earnedCents: 2025, cancelledBy: 'student' },
    { name: 'student no-show', status: 'no_show', hoursAgo: 30, refundPercent: 0, earnedCents: 2025, noShowParty: 'student' },
    { name: 'fully refunded student cancel', status: 'cancelled', hoursAgo: 32, refundPercent: 100, earnedCents: 0, cancelledBy: 'student' },
    { name: 'tutor cancel', status: 'cancelled', hoursAgo: 34, refundPercent: 100, earnedCents: 0, cancelledBy: 'tutor' },
    { name: 'tutor no-show', status: 'no_show', hoursAgo: 36, refundPercent: 100, earnedCents: 0, noShowParty: 'tutor' },
    { name: 'pending request', status: 'pending', hoursAgo: -72, refundPercent: 0, earnedCents: 0 },
    { name: 'confirmed upcoming', status: 'confirmed', hoursAgo: -75, refundPercent: 0, earnedCents: 0 },
    { name: 'confirmed awaiting completion', status: 'confirmed', hoursAgo: 40, refundPercent: 0, earnedCents: 0 },
    { name: 'old completed', status: 'completed', hoursAgo: 240, refundPercent: 0, earnedCents: 2025 },
    { name: 'old half-refund cancel', status: 'cancelled', hoursAgo: 242, refundPercent: 50, earnedCents: 1013, cancelledBy: 'student' },
    { name: 'old student no-show', status: 'no_show', hoursAgo: 244, refundPercent: 0, earnedCents: 2025, noShowParty: 'student' },
    { name: 'late cancel before scheduled start', status: 'cancelled', hoursAgo: -1, refundPercent: 0, earnedCents: 2025, cancelledBy: 'student' },
    { name: 'own booking as student', status: 'completed', hoursAgo: 44, refundPercent: 0, earnedCents: 0, asStudent: true },
  ];
  let totalCents = 0;
  let weekCents = 0;
  for (const fixture of fixtures) {
    const scheduled = new Date(now - fixture.hoursAgo * 3600_000);
    const { data, error } = await service.from('bookings').insert({
      student_id: fixture.asStudent ? tutor.id : student.id,
      tutor_id: fixture.asStudent ? otherTutor.id : tutor.id,
      subject: 'VERIFY EARNED TOTALS',
      scheduled_at: scheduled.toISOString(), duration_minutes: 60,
      price: 20.25, platform_fee: 0, student_fee: 0, tutor_payout_amount: 20.25,
      session_type: 'in_person', status: fixture.status,
      cancellation_deadline: new Date(scheduled.getTime() - 12 * 3600_000).toISOString(),
      refund_percent: fixture.refundPercent,
      refund_status: fixture.refundPercent > 0 ? 'refunded' : 'not_refunded',
      cancelled_by_role: fixture.cancelledBy ?? null,
      cancelled_from_status: fixture.cancelledBy ? 'confirmed' : null,
      no_show_party: fixture.noShowParty ?? null,
    }).select('id').single();
    if (error || !data) throw error ?? new Error('missing booking');
    bookings.push(data.id);
    totalCents += fixture.earnedCents;
    if (fixture.hoursAgo < 7 * 24) weekCents += fixture.earnedCents;
    const stats = await api.tutorStats();
    assert.equal(stats.earnedTotal, totalCents / 100, `${fixture.name}: all-time earnings`);
    assert.equal(stats.earnedThisWeek, weekCents / 100, `${fixture.name}: rolling-week earnings`);
    console.log(`PASS ${fixture.name}`);
  }

  const stats = await api.tutorStats();
  assert.equal(stats.sessionsTaught, 2, 'only completed sessions count as taught');
  assert.equal(stats.hoursTaught, 2, 'cancels and no-shows add no teaching hours');
  assert.equal(stats.cancelledCount, 1, 'standing counts only tutor cancellations');
  assert.equal(stats.noShowCount, 1, 'standing counts only tutor no-shows');
  assert.equal(stats.cancelRate, 0.5);
  const upcoming = await api.listUpcoming('tutor');
  assert.deepEqual(upcoming.map((b) => b.status).sort(), ['confirmed', 'pending']);
  assert(upcoming.every((b) => b.tutorPayoutAmount === 20.25), 'upcoming estimated payouts are unchanged');
  await auth.signOut();
  await assert.rejects(() => api.tutorStats(), 'signed-out tutor cannot read totals');
  console.log('PASS teaching/standing counts, upcoming estimates, role scoping and signed-out access');
} finally {
  await auth.signOut();
  if (bookings.length) {
    const { error } = await service.from('bookings').delete().in('id', bookings);
    if (error) throw error;
  }
  for (const id of users) {
    const { error } = await service.auth.admin.deleteUser(id);
    if (error) throw error;
  }
}
