import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const card = read('packages/ui/src/Card.tsx');
const raisedShadow = card.match(/\.\.\.\(raised\s*\?\s*(\{(?:[^{}]|\{[^{}]*\})*\})\s*:\s*\{\}\)/s)?.[1];
assert.ok(raisedShadow);
assert.match(raisedShadow, /shadowOpacity:\s*0\.06/);
assert.equal(card.match(/shadowOpacity/g)?.length, 1);
console.log('✅ Card shadow is only applied when raised');

const typography = read('packages/ui/src/Typography.tsx');
assert.doesNotMatch(typography, /uppercase/i);
console.log('✅ Typography has no uppercase text transformation');

const layout = read('packages/ui/src/Layout.tsx');
assert.match(layout, /export interface BandHeaderProps/);
assert.match(layout, /export function BandHeader/);
assert.match(layout, /useSafeAreaInsets/);
assert.match(layout, /barStyle="light-content"/);
assert.match(layout, /t\.band/);
assert.match(layout, /header\?: React\.ReactNode/);
assert.match(layout, /refreshTint\?: string/);
console.log('✅ Layout exports BandHeader and Body header/refreshTint slots');

const tabBar = read('packages/ui/src/TabBar.tsx');
assert.match(tabBar, /<GeckoMark size=\{44\}/);
console.log('✅ TabBar uses the enlarged Home gecko');

const list = read('packages/ui/src/List.tsx');
for (const name of ['LargeHeader', 'ListSection', 'ListRow', 'CountPill', 'StatusDot']) {
  assert.match(list, new RegExp(`export function ${name}\\b`));
}
assert.match(list, /export const STACK_FONT_SCALE/);
console.log('✅ List exports the shared grouped-list primitives');

const adminUi = read('apps/mobile/lib/adminUi.tsx');
assert.match(adminUi, /export \{ LargeHeader as AdminLargeHeader, ListSection as AdminSection, ListRow as AdminRow, StatusDot, CountPill, STACK_FONT_SCALE \} from '@noot\/ui'/);
assert.doesNotMatch(adminUi, /function AdminRow/);
console.log('✅ adminUi re-exports the shared list primitives');

assert.doesNotMatch(read('packages/theme/src/index.ts'), /Poppins/i);
console.log('✅ Theme tokens do not reference Poppins');
