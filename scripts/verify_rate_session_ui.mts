import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sessions = readFileSync(new URL('../apps/mobile/app/sessions.tsx', import.meta.url), 'utf8');
const history = readFileSync(new URL('../apps/mobile/app/history.tsx', import.meta.url), 'utf8');
const c2 = readFileSync(new URL('../apps/mobile/app/c2.tsx', import.meta.url), 'utf8');
const core = readFileSync(new URL('../packages/core/src/api/index.ts', import.meta.url), 'utf8');

for (const [name, source] of [['sessions', sessions], ['history', history]] as const) {
  assert.match(source, /import\s+\{\s*canRateBooking\s*\}\s+from\s+['"][^'"]*\/rating['"]/);
  assert.match(source, /api\.reviews\s*\.listRatedBookingIds\s*\(/);
  assert.match(source, /useFocusEffect\s*\(/);
  assert.match(source, /label="Rate session"/);
  assert.match(source, /label="Rated"/);
  assert.match(source, /patchBooking\(\{\s*\.\.\.draftFromBooking\([\s\S]*?router\.push\('\/c2'\)/);
  assert.doesNotMatch(source, /from\s+['"]@supabase\//);
}

assert.match(c2, /api\.reviews\.submit\(\s*\{[\s\S]*?bookingId:\s*booking\.bookingId/);
assert.match(core, /async listRatedBookingIds\(bookingIds: string\[\]\): Promise<string\[\]>[\s\S]*?\.eq\('reviewer_id', uid\)/);

console.log('verify_rate_session_ui: completed unrated sessions link to C2 and rated state is user-scoped');
