import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tutorEarnedAmount } from '../packages/core/src/index.ts';

const mobileRoot = fileURLToPath(new URL('../apps/mobile', import.meta.url));
const tutorSessionsSource = readFileSync(join(mobileRoot, 'app/tutor_sessions.tsx'), 'utf8');
const tutorCalendarSource = readFileSync(join(mobileRoot, 'app/tutor_calendar.tsx'), 'utf8');
const tutorHomeSource = readFileSync(join(mobileRoot, 'app/tutor_home.tsx'), 'utf8');

async function main() {
  assert.match(tutorSessionsSource, /import\s*\{[^}]*\btutorEarnedAmount\b[^}]*\}\s*from\s*'@noot\/core'/);
  assert.match(tutorSessionsSource, /pay: `\$\$\{tutorEarnedAmount\(b\)\.toFixed\(2\)\}`/);
  assert.doesNotMatch(tutorSessionsSource, /tutorPayoutAmount\.toFixed/);
  console.log('✅ tutor Sessions uses tutorEarnedAmount for the displayed pay');

  const displayAmount = (
    booking: { status: 'cancelled' | 'no_show' | 'completed' | 'confirmed'; tutorPayoutAmount: number; refundPercent: number },
  ) => `$${tutorEarnedAmount(booking).toFixed(2)}`;
  assert.deepEqual(
    [
      displayAmount({ status: 'cancelled', tutorPayoutAmount: 24.75, refundPercent: 100 }),
      displayAmount({ status: 'cancelled', tutorPayoutAmount: 24.75, refundPercent: 50 }),
      displayAmount({ status: 'no_show', tutorPayoutAmount: 24.75, refundPercent: 100 }),
      displayAmount({ status: 'completed', tutorPayoutAmount: 24.75, refundPercent: 0 }),
      displayAmount({ status: 'confirmed', tutorPayoutAmount: 24.75, refundPercent: 0 }),
    ],
    ['$0.00', '$12.38', '$0.00', '$24.75', '$24.75'],
  );
  console.log('✅ Past amounts display $0.00 / $12.38 for refunded cancellations and $24.75 otherwise');

  // These screens render tutorPayoutAmount only for confirmed bookings, which cannot be refunded.
  assert.match(tutorCalendarSource, /bookings\.filter\(\(booking\) => booking\.status === 'confirmed'\)/);
  assert.match(tutorHomeSource, /list\.find\(\(booking\) => booking\.status === 'confirmed'\)/);
  console.log('✅ other tutor-facing per-session amounts are restricted to confirmed bookings');
}

main().catch((error: unknown) => {
  console.error(`❌ verify_tutor_sessions_past_refunds: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
