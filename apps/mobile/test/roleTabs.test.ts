// Run: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPreviewSwitch, previewRolesFor, shouldSaveHeldMode, showsReferCard } from '../lib/roleTabs.ts';

test('a plain student gets no preview tabs', () => {
  assert.deepEqual(previewRolesFor(['student'], 'student', 'none'), []);
});

test('a draft or rejected application does not add the Tutor tab', () => {
  assert.deepEqual(previewRolesFor(['student'], 'student', 'draft'), []);
  assert.deepEqual(previewRolesFor(['student'], 'student', 'rejected'), []);
});

test('a submitted application adds Tutor as a preview', () => {
  assert.deepEqual(previewRolesFor(['student'], 'student', 'pending'), ['tutor']);
});

test('held roles are never previews', () => {
  assert.deepEqual(previewRolesFor(['student', 'tutor', 'ambassador'], 'tutor', 'approved'), []);
});

test('ambassador is never offered as a preview', () => {
  assert.deepEqual(previewRolesFor(['student', 'tutor'], 'student', 'approved'), []);
});

test('the mode you are in stays switchable so you can always get back', () => {
  assert.deepEqual(previewRolesFor(['student'], 'tutor', 'rejected'), ['tutor']);
  assert.deepEqual(previewRolesFor(['student'], 'tutor', 'draft'), ['tutor']);
});

test('the Profile referral card is hidden only in ambassador mode (ERR-025)', () => {
  assert.equal(showsReferCard('ambassador'), false);
  assert.equal(showsReferCard('student'), true);
  assert.equal(showsReferCard('tutor'), true);
});

test('switching to a role you hold is saved, not a preview', () => {
  assert.equal(isPreviewSwitch(['student', 'ambassador'], 'ambassador'), false);
});

test('switching to a role you do not hold is a preview', () => {
  assert.equal(isPreviewSwitch(['student'], 'tutor'), true);
});

test('a role granted in the same tap is saved even before the profile reloads', () => {
  assert.equal(isPreviewSwitch(['student'], 'ambassador', ['ambassador']), false);
  assert.equal(isPreviewSwitch(['student'], 'tutor', ['ambassador']), true);
});

test('a previewed mode is saved once the role arrives', () => {
  assert.equal(shouldSaveHeldMode(true, ['student', 'tutor'], 'tutor', 'student'), true);
});

test('nothing is saved while still previewing, if already saved, or without a preview', () => {
  assert.equal(shouldSaveHeldMode(true, ['student'], 'tutor', 'student'), false);
  assert.equal(shouldSaveHeldMode(true, ['student', 'tutor'], 'tutor', 'tutor'), false);
  assert.equal(shouldSaveHeldMode(false, ['student', 'tutor'], 'student', 'tutor'), false);
});
