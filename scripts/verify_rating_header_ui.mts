import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const c2 = readFileSync(new URL('../apps/mobile/app/c2.tsx', import.meta.url), 'utf8');

assert.match(c2, /\[\s*booking\.course,\s*tutor\.year\s*\]\s*\.filter\(Boolean\)\s*\.join\(\s*['"] · ['"]\s*\)/);
console.log('✅ c2.tsx joins the course and tutor year while filtering empty values');

assert.doesNotMatch(c2, /\$\{booking\.course\} · /);
console.log('✅ c2.tsx does not contain the dangling-separator template');

const headerMeta = (course?: string, year?: string) => [course, year].filter(Boolean).join(' · ');
assert.equal(headerMeta('MATH125', 'Junior'), 'MATH125 · Junior');
assert.equal(headerMeta('MATH125', ''), 'MATH125');
assert.equal(headerMeta('MATH125', undefined), 'MATH125');
assert.equal(headerMeta('', 'Junior'), 'Junior');
console.log('✅ documenting expected output for course/year combinations');
