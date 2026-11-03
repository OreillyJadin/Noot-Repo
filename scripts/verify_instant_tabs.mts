import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const layout = read('apps/mobile/app/_layout.tsx');
const bar = read('packages/ui/src/TabBar.tsx');
const adminTabs = read('apps/mobile/lib/AdminTabs.tsx');
const adminAmbassadors = read('apps/mobile/app/admin_ambassadors.tsx');
const roots = new Set([
  ...Array.from(bar.matchAll(/key: '([^']+)'/g), (match) => match[1]),
  ...Array.from((adminTabs + adminAmbassadors).matchAll(/href: '\/([^?']+)/g), (match) => match[1]),
  'saved',
]);
const instant = new Set(Array.from(layout.matchAll(/<Stack.Screen name="([^"]+)" options=\{\{ animation: 'none' \}\}/g), (match) => match[1]));
assert.deepEqual([...instant].sort(), [...roots].sort());
assert.doesNotMatch(layout, /animation: 'fade'/);
assert.doesNotMatch(layout, /<Stack.Screen name="(?:admin_user|b2|chat)"/);
assert.match(layout, /<Stack screenOptions=\{\{ headerShown: false \}\}>/);
assert.match(layout, /Tab roots switch instantly/);
for (const source of [bar, adminTabs]) assert.match(source, /<TabPressScale pressed=\{pressed\}/);
assert.match(read('packages/ui/src/TabPressScale.tsx'), /toValue: pressed \? 0\.92 : 1, duration: 100, useNativeDriver: true/);
console.log(`PASS: all ${roots.size} tab/sub-tab routes across student, tutor, ambassador and admin switch instantly.`);
console.log('PASS: drill-down routes retain the default push slide; both tab bars use shared native press-scale feedback.');
