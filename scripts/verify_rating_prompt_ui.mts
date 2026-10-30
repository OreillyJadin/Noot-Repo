import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const tutor = read('apps/mobile/app/tutor_sessions.tsx');
const c3 = read('apps/mobile/app/c3.tsx');
const c4 = read('apps/mobile/app/c4.tsx');
const open = read('apps/mobile/lib/openNotification.ts');
const target = read('apps/mobile/lib/notificationTarget.ts');

assert.match(tutor, /useFocusEffect\(useCallback/);
assert.match(tutor, /setRatedLookup\(null\)/);
assert.match(tutor, /api\.reviews\s*\.listRatedBookingIds\(bookingIds\)/);
assert.match(tutor, /canRateBooking\(r\.booking, ratedLookup\)/);
assert.match(tutor, /label="Rate student"/);
assert.match(tutor, /isRatedBooking\(r\.booking, ratedLookup\)/);
assert.match(tutor, /label="Rated"/);
assert.match(tutor, /patchBooking\(draftFromBooking\(r\.booking\)\);\s*router\.push\('\/c3'\)/);
assert.match(tutor, /booking: \{ \.\.\.r\.booking, status: 'completed' \}/);
assert.match(c3, /api\.reviews\.submit\(\{\s*bookingId: booking\.bookingId/);
assert.match(c3, /router\.push\('\/c4\?role=tutor'\)/);
assert.match(c4, /const isTutor = role === 'tutor'/);
assert.match(c4, /router\.replace\(isTutor \? '\/tutor_home' : '\/home'\)/);
assert.doesNotMatch(c3, /Private notes|Never shown to students|open a dispute and hold/);
assert.match(open, /api\.reviews\.listRatedBookingIds\(\[booking\.id\]\)/);
assert.match(open, /canRate = !rated\.includes\(booking\.id\)/);
assert.match(target, /n\.data\.event === 'rate_session'/);
assert.match(target, /route: '\/c2',\s*draft: \{ \.\.\.draftFromBooking\(booking\), tutor: ctx\.tutor \}/);
for (const source of [tutor, c3, c4, open]) assert.doesNotMatch(source, /from\s+['"]@supabase\//);

console.log('verify_rating_prompt_ui: completion notices hydrate C2; tutors enter C3 only for completed unrated bookings');
