import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
function checkTree(path: string) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (['node_modules', '.git', '.expo', '.next', 'dist', '.turbo'].includes(entry.name)) continue;
    const child = join(path, entry.name);
    if (entry.isDirectory()) checkTree(child);
    else if (/\.(tsx?|jsx?|md)$/.test(entry.name)) assert.doesNotMatch(read(child), /TODO\(api\)/, child);
  }
}
checkTree('apps');
checkTree('packages');

const calendar = read('apps/mobile/app/tutor_calendar.tsx');
assert.match(calendar, /api\.listUpcoming\('tutor'\)/);
assert.match(calendar, /api\.resolveParticipantNames\(\)\.catch/);
assert.match(calendar, /names\[b\.studentId\]/);
assert.match(calendar, /\.trim\(\) \|\| 'Student'/);
assert.match(calendar, /booking: b/);
assert.match(calendar, /patchBooking\(draftFromBooking\(session\.booking\)\)/);
assert.match(calendar, /onPress=\{\(\) => openDetail\(s\)\}/);
assert.doesNotMatch(calendar, /!active \|\| bookings\.length === 0/);

const recap = read('apps/mobile/app/c4.tsx');
assert.match(recap, /if \(!isTutor \|\| !booking\.bookingId\) return/);
assert.match(recap, /api\.bookings\.get\(id\)/);
assert.match(recap, /data \? 'ready' : 'error'/);
assert.match(recap, /\.catch\(/);
assert.match(recap, /read\.id === booking\.bookingId/);
assert.match(recap, /active = false/);
assert.match(recap, /current\?\.data\?\.tutorPayoutAmount \?\? booking\.tutorPayoutAmount/);
assert.match(recap, /payoutFailedAt: current\?\.data\?\.payoutFailedAt/);
assert.match(recap, /payout\.message/);
assert.match(recap, /payout\.label/);
assert.match(recap, /label="Retry"/);
assert.doesNotMatch(recap, /2 business days|payment is released/);
assert.match(read('packages/core/src/api/index.ts'), /payoutFailedAt: row\.payout_failed_at \?\? null/);
assert.match(read('packages/core/src/models/index.ts'), /payoutFailedAt\??: Timestamp \| null/);

for (const path of ['apps/mobile/app/chat.tsx', 'apps/mobile/app/chat_tutor.tsx']) {
  assert.doesNotMatch(read(path), /const notify =|Built with backend\./);
}
console.log('PASS API TODO cleanup: calendar names and selected session, payout read/states, core mapping, and dead-handler removal');
