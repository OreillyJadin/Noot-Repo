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
assert.match(sessions, /tutorPayoutAmount: realBooking\?\.tutorPayoutAmount/);

for (const payout of [20.25, 0]) {
  for (const [refundPercent, expected] of [[0, payout], [50, payout === 0 ? 0 : 10.13], [100, 0]] as const) {
    const displayed = tutorEarnedAmount({ status: 'cancelled', tutorPayoutAmount: payout, refundPercent });
    assert.equal(displayed, expected);
    assert.equal(Math.round(displayed * 100), lateCancelTutorPayoutCents(payout, refundPercent));
  }
}
console.log('PASS: cancellation uses stored tutor payout: $20.25 / $10.13 / $0, including free bookings');

// Exercise every clock hour around both DST changes and a normal midnight.
for (const date of ['2026-03-07', '2026-10-31', '2026-07-01']) {
  for (let hour = 0; hour < 72; hour++) {
    const now = Date.parse(`${date}T00:37:00Z`) + hour * 3600_000;
    for (const ahead of [5, 10, 30, 40, 50, 60, 70]) {
      const at = Date.parse(bookingTime(ahead, now));
      const start = campusParts(at);
      const end = campusParts(at + 3600_000);
      assert.ok(start.minutes + 60 <= 23 * 60 + 59);
      assert.equal(start.day, end.day);
      const hoursUntil = (at - now) / 3600_000;
      assert.ok(hoursUntil >= ahead && hoursUntil < ahead + 2);
      if (ahead <= 10) assert.ok(hoursUntil >= 2 && hoursUntil < 12, 'partial refund tier');
      else assert.ok(hoursUntil >= 12 && hoursUntil < 144, 'early refund inside booking horizon');
    }
  }
}
console.log('PASS: verification booking times stay within campus availability and intended refund tiers across DST');
