import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const screens = [
  'b1',
  'b2',
  'b3',
  'b4',
  'b5',
  'c1',
  'c2',
  'c3',
  'c4',
  'tb1',
  'tb2',
  'xbr',
  'xns',
  'xsc',
  'xsr',
  'xtc',
  'xtr',
].map((screen) => ({
  screen,
  path: `apps/mobile/app/${screen}.tsx`,
  source: readFileSync(join(root, `apps/mobile/app/${screen}.tsx`), 'utf8'),
}));

for (const { path, source } of screens) {
  assert.doesNotMatch(source, /textTransform:\s*['"]uppercase['"]/, `${path} has uppercase text styling`);
  assert.doesNotMatch(source, /\bletterSpacing\b/, `${path} has letter spacing`);
  // B3's "Hey, I'm …" strings are draft messages written by the student, not greetings.
  assert.doesNotMatch(source, /Hey,\s(?!I'm )/, `${path} contains a greeting`);
  assert.doesNotMatch(source, /from ['"]@supabase\//, `${path} imports Supabase directly`);
  assert.doesNotMatch(source, /(<Badge\b[^>]*\/>|<\/Badge>)\s*<Badge\b/, `${path} has adjacent badges`);
}

const allSources = screens.map(({ source }) => source).join('\n');
assert.doesNotMatch(allSources, /\b(recapIcon|factIcon|choiceIcon|iconBox|courseGrade|gradeBox)\b/, 'a pale icon-tile style remains');

for (const screen of ['b1', 'b2', 'b3', 'b5', 'tb2']) {
  const source = screens.find((entry) => entry.screen === screen)?.source ?? '';
  assert.match(source, /\bListSection\b/, `${screen} must use ListSection`);
}

console.log('Option B booking screen source checks passed.');
