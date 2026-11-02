import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('tutor preview shows amount-only take-home in the success token and hides when off', () => {
  const source = readFileSync(new URL('../lib/TutorRatePreview.tsx', import.meta.url), 'utf8');
  assert.match(source, /if \(!showNet\) return null/);
  assert.match(source, /name="wallet"/);
  assert.match(source, /color: t.good/);
  assert.match(source, /estimate.net.toFixed\(2\)/);
  assert.match(source, /Set a valid rate/);
  assert.doesNotMatch(source, /estimate.feeRate|%|student service fee/);
  assert.match(source, /You always edit the before-fee rate/);
});

test('rate editor uses server bounds, cards and sliders instead of steppers', () => {
  const source = readFileSync(new URL('../app/edit_rates.tsx', import.meta.url), 'utf8');
  assert.match(source, /<Card key=\{r.code\}/);
  assert.match(source, /min=\{MIN_HOURLY_RATE\} max=\{MAX_HOURLY_RATE\}/);
  assert.match(source, /r.rate.toFixed\(2\)/);
  assert.match(source, /label="Save changes"/);
  assert.doesNotMatch(source, /bump\(|name="minus"/);
});
