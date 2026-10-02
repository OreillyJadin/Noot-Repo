// Run: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previewRolesFor } from '../lib/roleTabs.ts';

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
