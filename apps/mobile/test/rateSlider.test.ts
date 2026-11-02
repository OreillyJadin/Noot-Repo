import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rateAtPosition, adjustedRate } from '../lib/rateSliderMath.ts';

test('rate slider maps track endpoints and rounds to whole dollars', () => {
  assert.equal(rateAtPosition(0, 220, 10, 120), 10);
  assert.equal(rateAtPosition(220, 220, 10, 120), 120);
  assert.equal(rateAtPosition(21, 220, 10, 120), 21);
  assert.equal(rateAtPosition(-50, 220, 10, 120), 10);
  assert.equal(rateAtPosition(300, 220, 10, 120), 120);
});

test('rate slider ignores unmeasured and invalid positions', () => {
  assert.equal(rateAtPosition(20, 0, 10, 120), null);
  assert.equal(rateAtPosition(NaN, 220, 10, 120), null);
  assert.equal(rateAtPosition(20, Infinity, 10, 120), null);
});

test('accessible rate actions increment and decrement by one within bounds', () => {
  assert.equal(adjustedRate(20, 'increment', 10, 120), 21);
  assert.equal(adjustedRate(20, 'decrement', 10, 120), 19);
  assert.equal(adjustedRate(10, 'decrement', 10, 120), 10);
  assert.equal(adjustedRate(120, 'increment', 10, 120), 120);
});

test('slider exposes adjustable actions and touch decoration cannot steal coordinates', () => {
  const source = readFileSync(new URL('../lib/RateSlider.tsx', import.meta.url), 'utf8');
  assert.match(source, /accessibilityRole="adjustable"/);
  assert.match(source, /onAccessibilityAction/);
  assert.match(source, /pointerEvents="none"/);
});
