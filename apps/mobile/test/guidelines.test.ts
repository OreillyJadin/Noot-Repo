import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GUIDELINES, splitGuidelineBody } from '../lib/guidelines.ts';

test('each guideline paragraph appears exactly once across the split body', () => {
  for (const section of GUIDELINES) {
    const { before, after } = splitGuidelineBody(section);
    const paragraphs = [...before, ...after];

    assert.deepEqual(paragraphs, section.body);
    for (const paragraph of section.body) {
      assert.equal(paragraphs.filter((item) => item === paragraph).length, 1);
    }
  }
});
