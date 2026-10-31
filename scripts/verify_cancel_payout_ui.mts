// No stack or Stripe key required; covers the shared iOS/Android screen.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tutorEarnedAmount } from '../packages/core/src/earnings.ts';
import { campusParts } from '../packages/core/src/campusTime.ts';
import { lateCancelTutorPayoutCents } from '../supabase/functions/_shared/cancellation.ts';
import { bookingTime } from './_booking_test.mts';

const screen = readFileSync(new URL('../apps/mobile/app/xsc.tsx', import.meta.url), 'utf8');
assert.match(screen, /import\s*\{[^}]*\btutorEarnedAmount\b[^}]*\}\s*from '@noot\/core'/);
assert.match(screen, /const tutorPayout = tobj && booking\.tutorPayoutAmount != null\s*\? tutorEarnedAmount\(\{\s*status: 'cancelled',\s*tutorPayoutAmount: booking\.tutorPayoutAmount,\s*refundPercent: Math\.round\(tobj\.refundPct \* 100\),/);
assert.match(screen, /Paid to tutor[\s\S]*?\{tutorPayout == null \? '—' : money\(tutorPayout\)\}/);
assert.doesNotMatch(screen, /sessionPrice\s*\*\s*tobj\.tutorPct|@supabase\//);
assert.match(screen, /booking\.status === 'pending' \? 'early'/);
const sessions = readFileSync(new URL('../apps/mobile/app/sessions.tsx', import.meta.url), 'utf8');
const cancelSession = sessions.slice(sessions.indexOf('const cancelSession ='), sessions.indexOf('const reportNoShow ='));
assert.match(cancelSession, /tutorPayoutAmount: realBooking\?\.tutorPayoutAmount/);
assert.match(cancelSession, /if \(!bookingId\) \{\s*patchBooking\(\{[^}]*tutorPayoutAmount: undefined/);

for (const payout of [20.25, 0]) {
  for (const [refundPercent, expected] of [[0, payout], [50, payout === 0 ? 0 : 10.13], [100, 0]] as const) {
    const displayed = tutorEarnedAmount({ status: 'cancelled', tutorPayoutAmount: payout, refundPercent });
    assert.equal(displayed, expected);
    assert.equal(Math.round(displayed * 100), lateCancelTutorPayoutCents(payout, refundPercent));
  }
}
console.log('PASS: cancellation uses stored tutor payout: $20.25 / $10.13 / $0, including free bookings');

// Exercise quarter-hours and sub-minute clocks around both DST changes and a normal midnight.
for (const date of ['2026-03-07', '2026-10-31', '2026-07-01']) {
  for (let quarter = 0; quarter < 72 * 4 * 2; quarter++) {
    const now = Date.parse(`${date}T00:00:00Z`) + Math.floor(quarter / 2) * 900_000 + (quarter % 2 ? 37_123 : 0);
    for (const ahead of [1, 5, 10, 30, 40, 50, 60, 70, 72, 90, 95, 96]) {
      const at = Date.parse(bookingTime(ahead, now));
      const start = campusParts(at);
      const end = campusParts(at + 3600_000);
      assert.ok(start.minutes + 60 <= 23 * 60 + 59);
      assert.equal(start.day, end.day);
      const hoursUntil = (at - now) / 3600_000;
      if (ahead < 2) assert.ok(hoursUntil >= 0.5 && hoursUntil < 2, 'late refund tier');
      else assert.ok(hoursUntil >= ahead && hoursUntil < ahead + 2);
      if (ahead >= 2 && ahead <= 10) assert.ok(hoursUntil >= 2 && hoursUntil < 12, 'partial refund tier');
      if (ahead >= 12) assert.ok(hoursUntil >= 12 && hoursUntil < 144, 'early refund inside booking horizon');
    }
  }
}
console.log('PASS: verification booking times stay within campus availability and intended refund tiers across DST');

const source = readFileSync(new URL('./verify_payout_source.mts', import.meta.url), 'utf8');
assert.match(source, /const at = \(hoursAhead: number\) => bookingTime\(hoursAhead\)/);
assert.doesNotMatch(source, /slot\+\+|chicagoHour/);
const guards = readFileSync(new URL('./verify_payout_guards.mts', import.meta.url), 'utf8');
assert.match(guards, /createBookingTutor\(admin, 'payout-guards'\)/);
assert.match(guards, /const scheduledAt = bookingTime\(hoursAhead\)/);
assert.match(guards, /newScheduledAt: bookingTime\(96\)/);
assert.doesNotMatch(guards, /api\.tutors\.search\(\)/);
