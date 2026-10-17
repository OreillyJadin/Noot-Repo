import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GUIDELINES, splitGuidelineBody } from '../lib/guidelines.ts';

test('a section without bullets keeps every paragraph before the bullets position', () => {
  const result = splitGuidelineBody({ body: ['First paragraph.', 'Second paragraph.'] });
  assert.deepEqual(result, { before: ['First paragraph.', 'Second paragraph.'], after: [] });
});

test('a section with bullets splits its body after the first paragraph', () => {
  const result = splitGuidelineBody({
    body: ['First paragraph.', 'Second paragraph.'],
    bullets: ['A bullet.'],
  });
  assert.deepEqual(result, { before: ['First paragraph.'], after: ['Second paragraph.'] });
});

test('every guideline body paragraph is present exactly once across the split', () => {
  for (const section of GUIDELINES) {
    const { before, after } = splitGuidelineBody(section);
    assert.deepEqual(before.concat(after), section.body, section.title);
  }
});
