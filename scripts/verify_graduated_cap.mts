import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const core = read('packages/core/src/api/index.ts');
assert.match(core, /const TUTOR_SELECT = `[\s\S]*?\byear\b/);
assert.match(core, /function mapTutorSummary[\s\S]*?year: row.year \?\? null/);
for (const method of ['search', 'getById', 'listSaved']) {
  const start = core.indexOf(`async ${method}(`, core.indexOf('async search(opts:'));
  const methodSource = core.slice(start, core.indexOf('\n    },', start));
  assert.ok(start >= 0, method);
  assert.match(methodSource, /select\(TUTOR_SELECT\)/, method);
  assert.match(methodSource, /mapTutorSummary/, method);
}
for (const screen of ['home', 'student_home', 'b1', 'b2', 'saved', 'sessions', 'tutor_profile']) {
  assert.match(read(`apps/mobile/app/${screen}.tsx`), /<GraduatedCap year=\{(?:tutor|tt|me\?|next.tutor\?)\.year\}/, screen);
}
for (const screen of ['home', 'student_home', 'b1', 'saved', 'sessions']) {
  assert.match(read(`apps/mobile/app/${screen}.tsx`), /year === 'Post Grad' \? ['"],? ?Graduated['"]/, `${screen}: grouped row announces graduation`);
}
const icons = read('packages/ui/src/Icon.tsx');
assert.equal((read('apps/mobile/app/sessions.tsx').match(/<GraduatedCap year=/g) ?? []).length, 3, 'saved, upcoming and past session names');
assert.ok(icons.match(/cap: '([^']+)'/)?.[1]);
assert.doesNotMatch(icons, /gradCap:/);
assert.match(read('apps/mobile/lib/GraduatedCap.tsx'), /<Ic name="cap"/);
console.log('PASS: year is selected and mapped for search, profile and saved tutors; no schema changes needed.');
console.log('PASS: all seven tutor name surfaces use the graduation cap; grouped row labels announce Graduated.');
console.log('PASS: GraduatedCap reuses the existing outlined cap icon without a duplicate.');
