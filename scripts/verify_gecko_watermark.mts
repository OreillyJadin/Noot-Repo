import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const roots = ['home.tsx', 'tutor_home.tsx', 'ambassador_home.tsx'];
const screens = new URL('../apps/mobile/app/', import.meta.url);
for (const file of readdirSync(screens).filter((name) => name.endsWith('.tsx'))) {
  const source = read(`apps/mobile/app/${file}`);
  if (roots.includes(file)) assert.match(source, /<BandHeader\s+watermark\b/);
  else assert.doesNotMatch(source, /<BandHeader\b[^>]*\bwatermark\b/);
  assert.doesNotMatch(source, /GeckoWatermark/);
}
assert.match(read('packages/ui/src/Gecko.tsx'), /require\('\.\.\/assets\/gecko-sage.png'\)/);
const asset = readFileSync(new URL('../packages/ui/assets/gecko-sage.png', import.meta.url));
assert.equal(asset.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
assert.match(read('packages/ui/src/Layout.tsx'), /watermark \? <GeckoWatermark \/> : null/);
assert.doesNotMatch(read('packages/ui/src/ThemeProvider.tsx'), /DirectionContext|useThemeDirection/);
assert.match(read('packages/ui/src/EmptyState.tsx'), /<GeckoWatermark centered \/>/);
assert.doesNotMatch(read('packages/ui/src/List.tsx'), /GeckoWatermark/);
console.log('PASS: only the three Home tab roots opt into band watermarks; list primitives remain untouched.');
console.log('PASS: shared EmptyState uses the decorative watermark, backed by the real gecko-sage PNG.');
