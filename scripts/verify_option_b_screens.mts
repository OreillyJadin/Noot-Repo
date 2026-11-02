import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { countdownLabel } from '../apps/mobile/lib/countdownLabel';

const root = process.cwd();
const referenceScreens = [
  'apps/mobile/app/student_home.tsx',
  'apps/mobile/app/tutor_home.tsx',
  'apps/mobile/app/profile.tsx',
  'apps/mobile/app/tutor_profile.tsx',
];
const phase3aScreens = [
  'apps/mobile/app/home.tsx',
  'apps/mobile/app/sessions.tsx',
  'apps/mobile/app/tutor_sessions.tsx',
  'apps/mobile/app/tutor_calendar.tsx',
  'apps/mobile/app/chats.tsx',
  'apps/mobile/app/saved.tsx',
  'apps/mobile/app/ambassador_home.tsx',
  'apps/mobile/app/ambassador_referrals.tsx',
];
const screens = [...referenceScreens, ...phase3aScreens];
const listScreens = new Set([
  'apps/mobile/app/home.tsx',
  'apps/mobile/app/sessions.tsx',
  'apps/mobile/app/tutor_sessions.tsx',
  'apps/mobile/app/chats.tsx',
  'apps/mobile/app/saved.tsx',
  'apps/mobile/app/ambassador_home.tsx',
]);

for (const path of screens) {
  const source = readFileSync(join(root, path), 'utf8');
  assert.match(source, /<Body\b[^>]*\bheader=\{\s*<BandHeader\b/s, `${path} must pass BandHeader to Body`);
  assert.match(source, /refreshTint=\{t\.onBand\}/, `${path} must use the on-band refresh tint`);
  assert.doesNotMatch(source, /Hey,\s/, `${path} still has a greeting`);
  assert.doesNotMatch(source, /textTransform:\s*['"]uppercase['"]/, `${path} still has uppercase text styling`);
  assert.doesNotMatch(source, /\bTEXT_CAPS\b/, `${path} still uses TEXT_CAPS`);
  assert.doesNotMatch(source, /<SafeAreaView[^>]*edges=\{\[\s*['"]top['"]\s*\]\}/s, `${path} still wraps its header in a top SafeAreaView`);
  assert.doesNotMatch(source, /paddingTop\s*:\s*insets\.top/, `${path} still adds top inset header padding`);
  assert.doesNotMatch(source, /<ListSection\s+label=["']["']/, `${path} has a blank section label`);
  if (listScreens.has(path)) assert.match(source, /\bListSection\b/, `${path} must use grouped list sections`);
  for (const [, value] of source.matchAll(/letterSpacing\s*:\s*(-?\d+(?:\.\d+)?)/g)) {
    assert.ok(Number(value) < 0.5, `${path} has small-label letter spacing ${value}`);
  }
}

const studentHome = readFileSync(join(root, screens[0]), 'utf8');
assert.doesNotMatch(studentHome, /Welcome back/);
const tutorHome = readFileSync(join(root, screens[1]), 'utf8');
assert.doesNotMatch(tutorHome, /CountdownPills|geckoDeco|Wordmark/);
assert.match(tutorHome, /overlap=\{previewing \? undefined : 56\}/, 'tutor Home must skip overlap while previewing');
assert.match(tutorHome, /marginTop: previewing \? 0 : -56/, 'tutor Home card offset must match the preview overlap');
const studentTabHome = readFileSync(join(root, 'apps/mobile/app/home.tsx'), 'utf8');
assert.doesNotMatch(studentTabHome, /CountdownPills|Wordmark/, 'student Home should use the band header and countdown text');
const sessionTab = readFileSync(join(root, 'apps/mobile/app/sessions.tsx'), 'utf8');
const savedTab = readFileSync(join(root, 'apps/mobile/app/saved.tsx'), 'utf8');
for (const [path, source] of [
  ['student_home.tsx', studentHome],
  ['home.tsx', studentTabHome],
  ['sessions.tsx', sessionTab],
  ['saved.tsx', savedTab],
] as const) {
  assert.match(source, /from ['"]\.\.\/lib\/tutorMeta['"]/, `${path} must use the shared tutor metadata helper`);
  assert.match(source, /verified tutor/, `${path} must include verified tutor accessibility text`);
}
const homeTutorRow = studentTabHome.slice(studentTabHome.indexOf('function TutorRow('), studentTabHome.indexOf('export default function Home'));
assert.doesNotMatch(homeTutorRow, /<Badge\b|<VerifiedBadge\b/, 'Home TutorRow must not stack badges');
const sessionsSavedRows = sessionTab.match(/<ListSection label="Saved tutors">([\s\S]*?)<\/ListSection>/)?.[1];
assert.ok(sessionsSavedRows, 'Sessions Saved tab must contain its grouped tutor rows');
assert.doesNotMatch(sessionsSavedRows, /<Badge\b|<VerifiedBadge\b/, 'Sessions Saved rows must not stack badges');
assert.doesNotMatch(savedTab, /<Badge\b|<VerifiedBadge\b/, 'Saved screen rows must not stack badges');
const ambassadorHome = readFileSync(join(root, 'apps/mobile/app/ambassador_home.tsx'), 'utf8');
assert.match(ambassadorHome, /<ListSection>\s*<Pressable/, 'Ambassador CTA must be inside a ListSection');
assert.match(ambassadorHome, /<ListSection label="People you invited">/, 'Invited people heading must be a ListSection label');
assert.doesNotMatch(ambassadorHome, /sectionTitle/, 'Ambassador Home must not use a custom invited-people heading');
const tutorCalendar = readFileSync(join(root, 'apps/mobile/app/tutor_calendar.tsx'), 'utf8');
assert.match(tutorCalendar, /accessibilityRole="tab"/, 'Tutor Calendar week pills must expose tab roles');
assert.match(tutorCalendar, /accessibilityState=\{\{\s*selected:\s*on\s*\}\}/, 'Tutor Calendar week pills must expose selected state');
const ambassadorReferrals = readFileSync(join(root, 'apps/mobile/app/ambassador_referrals.tsx'), 'utf8');
assert.match(ambassadorReferrals, /<InviteView\b[^>]*presentation="referralsTab"/, 'Ambassador Referrals must use the tab-root invite presentation');
const inviteView = readFileSync(join(root, 'apps/mobile/lib/InviteView.tsx'), 'utf8');
assert.match(inviteView, /presentation === 'referralsTab'/, 'InviteView must provide the grouped Ambassador Referrals presentation');
assert.match(inviteView, /groupedInviteRow/);
assert.match(readFileSync(join(root, 'apps/mobile/lib/NotificationBell.tsx'), 'utf8'), /color\?:\s*string/);
assert.match(readFileSync(join(root, 'apps/mobile/lib/AdminShortcut.tsx'), 'utf8'), /color\?:\s*string/);

const now = Date.parse('2026-01-01T00:00:00Z');
assert.equal(countdownLabel(now + 46 * 60 * 60_000, now + 47 * 60 * 60_000, now), 'In 1 day, 22 hr');
assert.equal(countdownLabel(now + 25 * 60_000, now + 85 * 60_000, now), 'In 25 min');
assert.equal(countdownLabel(now + 59_000, now + 60_000, now), 'Starting now');
assert.equal(countdownLabel(now - 20 * 60_000, now + 40 * 60_000, now), 'In progress · ends in 40 min');
assert.equal(countdownLabel(now - 20 * 60_000, now, now), 'Session ended');

console.log('Option B mobile screen source checks passed.');
