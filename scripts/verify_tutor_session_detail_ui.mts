// Source-level checks for tutor session details to ensure they use stored booking data.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const source = async (path: string) =>
  readFile(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8');

const [tb1, tb2, bookingDraft, tutorSessions] = await Promise.all([
  source('apps/mobile/app/tb1.tsx'),
  source('apps/mobile/app/tb2.tsx'),
  source('apps/mobile/lib/bookingDraft.ts'),
  source('apps/mobile/app/tutor_sessions.tsx'),
]);

for (const [name, screen] of [['tb1', tb1], ['tb2', tb2]] as const) {
  for (const placeholder of [
    /3:00 PM/,
    /Gorgas Library/,
    /Looking forward to working through/,
    /booking\.slot/,
    /booking\.dayIndex/,
    /booking\.message/,
    /booking\.tag/,
    /DAYS\[/,
  ]) {
    assert.doesNotMatch(screen, placeholder, `${name} should not use ${placeholder}`);
  }
  assert.match(screen, /formatSessionTime\(/);
  assert.match(screen, /scheduledAt/);
  assert.match(screen, /NoSession/);
}
console.log('✅ tb1 and tb2 use real booking time and have no prototype fallbacks');

assert.match(tb2, /booking\.requestNote/);
console.log('✅ tb2 renders only the stored request note');

assert.match(bookingDraft, /requestNote: b\.requestNote/);
assert.match(bookingDraft, /requestNote: undefined/);
console.log('✅ booking draft maps and clears requestNote');

assert.match(tutorSessions, /formatSessionTime/);
assert.doesNotMatch(tutorSessions, /function formatWhen/);
console.log('✅ tutor session list shares the session time formatter');
