import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { videoJoinState } from '../lib/videoSession.ts';
import { tutorSessionDrafts } from '../lib/sessionDrafts.ts';

const start = Date.parse('2026-11-15T18:00:00Z');
const booking = { sessionType: 'video' as const, status: 'confirmed' as const,
  scheduledAt: new Date(start).toISOString(), durationMinutes: 60,
  videoLinkSentAt: new Date(start - 3600_000).toISOString(), dailyRoomName: 'noot-abcd1234', dailyRoomDeletedAt: null };

test('video join waits for accepted session, published link, and opening time', () => {
  assert.equal(videoJoinState(null, start).enabled, false);
  assert.equal(videoJoinState({ ...booking, videoLinkSentAt: null }, start).enabled, false);
  assert.equal(videoJoinState({ ...booking, dailyRoomName: null }, start).enabled, false);
  assert.equal(videoJoinState({ ...booking, status: 'pending' }, start).enabled, false);
  assert.equal(videoJoinState({ ...booking, sessionType: 'in_person' }, start).enabled, false);
  assert.equal(videoJoinState(booking, start - 3600_001).label, 'Link arrives 1 hour before');
  assert.equal(videoJoinState(booking, start - 3600_000).enabled, true);
});

test('video join closes after grace period or cancellation and handles invalid dates', () => {
  assert.equal(videoJoinState(booking, start + 90 * 60_000).label, 'Join video session');
  assert.equal(videoJoinState(booking, start + 90 * 60_000 + 1).enabled, false);
  assert.equal(videoJoinState({ ...booking, status: 'cancelled' }, start).enabled, false);
  assert.equal(videoJoinState({ ...booking, dailyRoomDeletedAt: new Date(start).toISOString() }, start).enabled, false);
  assert.equal(videoJoinState({ ...booking, scheduledAt: 'invalid' }, start).enabled, false);
});

test('virtual quick reply retains existing replies and names the unique meeting code without a URL', () => {
  const context = { studentFirstName: '', tutorFirstName: '', course: '', location: '', when: '', sessionType: 'video' as const };
  const drafts = tutorSessionDrafts({ ...context, dailyRoomName: booking.dailyRoomName });
  const virtual = drafts.find((d) => d.key === 'virtual')!;
  assert.equal(virtual.label, 'Virtual session setup');
  assert.match(virtual.text, /Your meeting code is NOOT-ABCD1234/);
  assert.match(virtual.text, /1 hour before/);
  assert.doesNotMatch(virtual.text, /https:|\?t=/);
  assert.deepEqual(drafts.slice(1).map((d) => d.key), ['location', 'intro', 'bring']);
  const notReady = tutorSessionDrafts(context)[0]!;
  assert.doesNotMatch(notReady.text, /undefined|null|NOOT-/);
});

test('browser join uses core, shows friendly errors, and refreshes readiness', () => {
  const code = readFileSync(new URL('../lib/JoinVideoButton.tsx', import.meta.url), 'utf8');
  assert.match(code, /api\.bookings\.joinVideo\(bookingId\)/);
  assert.match(code, /WebBrowser\.openBrowserAsync\(url\)/);
  assert.match(code, /Alert\.alert\('Video session'/);
  assert.match(code, /disabled=\{busy \|\| \(!loadFailed && !state\.enabled\)\}/);
  assert.match(code, /setInterval\(refresh, 30_000\)/);
  assert.doesNotMatch(code, /@supabase/);
});
