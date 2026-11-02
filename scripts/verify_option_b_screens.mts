import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { countdownLabel } from '../apps/mobile/lib/countdownLabel';

const root = process.cwd();
const screens = [
  'apps/mobile/app/student_home.tsx',
  'apps/mobile/app/tutor_home.tsx',
  'apps/mobile/app/profile.tsx',
  'apps/mobile/app/tutor_profile.tsx',
];

for (const path of screens) {
  const source = readFileSync(join(root, path), 'utf8');
  assert.match(source, /<Body\b[^>]*\bheader=\{\s*<BandHeader\b/s, `${path} must pass BandHeader to Body`);
  assert.match(source, /refreshTint=\{t\.onBand\}/, `${path} must use the on-band refresh tint`);
  assert.doesNotMatch(source, /Hey,\s/, `${path} still has a greeting`);
  assert.doesNotMatch(source, /textTransform:\s*['"]uppercase['"]/, `${path} still has uppercase text styling`);
  assert.doesNotMatch(source, /<ListSection\s+label=["']["']/, `${path} has a blank section label`);
  assert.match(source, /\bListSection\b/, `${path} must use grouped list sections`);
  for (const [, value] of source.matchAll(/letterSpacing\s*:\s*(-?\d+(?:\.\d+)?)/g)) {
    assert.ok(Number(value) < 0.5, `${path} has small-label letter spacing ${value}`);
  }
}

const studentHome = readFileSync(join(root, screens[0]), 'utf8');
assert.doesNotMatch(studentHome, /Welcome back/);
const tutorHome = readFileSync(join(root, screens[1]), 'utf8');
assert.doesNotMatch(tutorHome, /CountdownPills|geckoDeco|Wordmark/);
assert.match(tutorHome, /overlap=\{56\}/, 'tutor Home must overlap the session card onto the band');
assert.match(readFileSync(join(root, 'apps/mobile/lib/NotificationBell.tsx'), 'utf8'), /color\?:\s*string/);
assert.match(readFileSync(join(root, 'apps/mobile/lib/AdminShortcut.tsx'), 'utf8'), /color\?:\s*string/);

const now = Date.parse('2026-01-01T00:00:00Z');
assert.equal(countdownLabel(now + 46 * 60 * 60_000, now + 47 * 60 * 60_000, now), 'In 1 day, 22 hr');
assert.equal(countdownLabel(now + 25 * 60_000, now + 85 * 60_000, now), 'In 25 min');
assert.equal(countdownLabel(now - 20 * 60_000, now + 40 * 60_000, now), 'In progress · ends in 40 min');

console.log('Option B mobile screen source checks passed.');
