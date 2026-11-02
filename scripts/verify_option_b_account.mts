import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const screenPaths = [
  'apps/mobile/app/edit_availability.tsx',
  'apps/mobile/app/edit_courses.tsx',
  'apps/mobile/app/edit_personal.tsx',
  'apps/mobile/app/edit_rates.tsx',
  'apps/mobile/app/edit_tutor.tsx',
  'apps/mobile/app/history.tsx',
  'apps/mobile/app/notifications.tsx',
  'apps/mobile/app/chat.tsx',
  'apps/mobile/app/chat_tutor.tsx',
  'apps/mobile/app/help.tsx',
  'apps/mobile/app/standing.tsx',
  'apps/mobile/app/blocked_users.tsx',
  'apps/mobile/app/invite.tsx',
];

const screens = new Map(
  screenPaths.map((path) => [path, readFileSync(join(process.cwd(), path), 'utf8')]),
);

for (const [path, source] of screens) {
  assert.doesNotMatch(source, /textTransform\s*:\s*['"]uppercase['"]/i, `${path}: uppercase text transform`);
  assert.doesNotMatch(source, /<Eyebrow\b/, `${path}: Eyebrow`);
  assert.doesNotMatch(source, /Hey,\s/, `${path}: greeting`);
  assert.doesNotMatch(source, /from\s*['"]@supabase\//, `${path}: direct Supabase import`);
  for (const [, value] of source.matchAll(/letterSpacing\s*:\s*['"]?(-?(?:\d+(?:\.\d*)?|\.\d+))['"]?/g)) {
    assert.ok(Number(value) < 0.5, `${path}: letterSpacing ${value} must be below 0.5`);
  }
}

for (const path of [
  'apps/mobile/app/help.tsx',
  'apps/mobile/app/standing.tsx',
  'apps/mobile/app/blocked_users.tsx',
  'apps/mobile/app/edit_courses.tsx',
  'apps/mobile/app/edit_rates.tsx',
  'apps/mobile/app/edit_tutor.tsx',
  'apps/mobile/app/history.tsx',
  'apps/mobile/app/notifications.tsx',
]) {
  assert.match(screens.get(path)!, /\bListSection\b/, `${path}: missing ListSection`);
}

assert.doesNotMatch(screens.get('apps/mobile/app/history.tsx')!, /<Badge\b/);
assert.ok(screens.get('apps/mobile/app/history.tsx')!.includes('const rated = !isTutor && isRatedBooking(b, ratedLookup)'));
assert.doesNotMatch(screens.get('apps/mobile/app/edit_rates.tsx')!, /gradeBadge/);
for (const path of [
  'apps/mobile/app/help.tsx',
  'apps/mobile/app/edit_courses.tsx',
  'apps/mobile/app/edit_tutor.tsx',
  'apps/mobile/app/notifications.tsx',
]) {
  assert.doesNotMatch(screens.get(path)!, /iconBox|contactIcon/);
}

const standing = screens.get('apps/mobile/app/standing.tsx')!;
for (const line of [
  'Complete your booked sessions and let students know if plans change.',
  'Cancellations you make after confirming and sessions you miss are recorded. Student cancellations do not count against you.',
  'Our team reviews these records. Counts do not automatically pause bookings, change your ranking, or add penalties.',
]) {
  assert.ok(standing.includes(line), `standing.tsx: missing policy text: ${line}`);
}
assert.ok(screens.get('apps/mobile/app/edit_rates.tsx')!.includes('Changes apply to new bookings only'));

console.log('verify_option_b_account: passed');
