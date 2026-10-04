// Run: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previousStepHref } from '../lib/stepBack.ts';

test('a step reached by walking forward just goes back', () => {
  for (let step = 2; step <= 9; step++) assert.equal(previousStepHref(step, false), null);
});

test('a resumed step goes to the step before it, still marked resumed', () => {
  assert.equal(previousStepHref(6, true), '/t5?resumed=1');
  assert.equal(previousStepHref(9, true), '/t8?resumed=1');
  assert.equal(previousStepHref(3, true), '/t2?resumed=1');
});

test('resumed all the way back to step 2 returns to the intro', () => {
  assert.equal(previousStepHref(2, true), null);
});
