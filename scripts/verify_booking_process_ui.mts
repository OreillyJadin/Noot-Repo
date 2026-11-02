// Source-level checks for the student/tutor booking-process surfaces.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const source = async (path: string) =>
  readFile(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8');

const [b5, sessions, tutorSessions, layout] = await Promise.all([
  source('apps/mobile/app/b5.tsx'),
  source('apps/mobile/app/sessions.tsx'),
  source('apps/mobile/app/tutor_sessions.tsx'),
  source('apps/mobile/app/_layout.tsx'),
]);

const requestStart = b5.indexOf('function RequestMode()');
const confirmedStart = b5.indexOf('function ConfirmedMode');
assert.ok(requestStart >= 0 && confirmedStart > requestStart, 'B5 defines request and confirmed modes');
const requestMode = b5.slice(requestStart, confirmedStart);
assert.match(requestMode, /Session request sent/);
assert.match(requestMode, /name="clock"/);
assert.match(requestMode, /accentWeak/);
assert.match(requestMode, /has until/);
assert.match(requestMode, /View session/);
assert.match(requestMode, /label="Done"/);
assert.doesNotMatch(requestMode, /handshake|Message|openChat/);

const confirmedMode = b5.slice(confirmedStart);
assert.match(confirmedMode, /api\.bookings\.get\(bookingId\)/);
assert.match(confirmedMode, /Deal locked in\./);
assert.match(confirmedMode, /accepted your session\./);
assert.match(confirmedMode, /name="handshake"/);
assert.match(confirmedMode, /label="Message"/);
assert.match(confirmedMode, /bookingId: booking\.id/);
assert.match(confirmedMode, /router\.push\('\/chat'\)/);
assert.match(confirmedMode, /router\.replace\('\/sessions'\)/);
assert.match(confirmedMode, /router\.replace\('\/home'\)/);

const studentPendingStart = sessions.indexOf("{b.status === 'pending' ? (");
assert.ok(studentPendingStart >= 0, 'student sessions has a pending branch');
const studentPendingEnd = sessions.indexOf(') : (', studentPendingStart);
assert.ok(studentPendingEnd > studentPendingStart, 'student pending branch is closed');
const studentPending = sessions.slice(studentPendingStart, studentPendingEnd);
assert.match(studentPending, /Waiting for .* to accept/);
assert.match(studentPending, /Cancel request/);
assert.doesNotMatch(studentPending, /Message/);
assert.match(studentPending, /full/);

const tutorUpcomingStart = tutorSessions.indexOf('<ListSection label="Upcoming sessions">');
assert.ok(tutorUpcomingStart >= 0, 'tutor sessions groups upcoming rows');
const tutorUpcomingEnd = tutorSessions.indexOf('</ListSection>', tutorUpcomingStart);
assert.ok(tutorUpcomingEnd > tutorUpcomingStart, 'tutor upcoming rows are grouped');
const tutorUpcoming = tutorSessions.slice(tutorUpcomingStart, tutorUpcomingEnd);
assert.match(tutorUpcoming, /<View key={r\.id}/);
assert.match(tutorUpcoming, /disabled=\{r\.status !== 'confirmed'\}/, 'only confirmed tutor sessions are navigable');
assert.match(tutorUpcoming, /requestNote/);
assert.match(tutorUpcoming, /numberOfLines=\{3\}/);
assert.match(tutorUpcoming, /color: t\.text2/);
assert.doesNotMatch(tutorUpcoming, /openChat|\/chat|Message/);
assert.doesNotMatch(tutorSessions, /openChat/);
assert.match(tutorSessions, /router\.push\('\/chat_tutor'\)/);

assert.match(layout, /<BookingConfirmedHost\s*\/>/);

console.log('✅ B5 request/confirmed modes, pending session cards, and confirmation host are wired');
