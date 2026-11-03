import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../packages/ui/src/Icon.tsx', import.meta.url), 'utf8');
const search = source.match(/search: '([^']+)'/)?.[1];

assert.equal(search, 'circle:11,11,7|M16 16l4 4');
assert.match(source, /viewBox="0 0 24 24"/);
assert.match(source, /<Circle[^>]+strokeWidth=\{strokeWidth\}/);
assert.match(source, /<Path[^>]+strokeWidth=\{strokeWidth\}/);

for (const size of [17, 18, 20, 21, 24, 26, 28]) {
  for (const stroke of [1.6, 1.7, 1.8, 2.1]) {
    const scale = size / 24;
    assert.ok((11 - 7 - stroke / 2) * scale > 0, 'circle fits within canvas');
    assert.ok((20 + stroke / 2) * scale < size, 'handle fits within canvas');
  }
}

console.log('PASS: closed Search magnifier matches approved mockup; shared stroke and 24px canvas retained.');
console.log('PASS: circle and handle fit all consumer sizes (17, 18, 20, 21, 24, 26, 28px) and stroke weights.');
