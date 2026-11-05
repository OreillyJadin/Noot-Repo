import { test } from 'node:test';
import assert from 'node:assert/strict';
import { responseLabel } from '../src/tutorResponse.ts';

test('response labels follow the documented time bands', () => {
  assert.equal(responseLabel(60), 'Usually responds within an hour');
  assert.equal(responseLabel(61), 'Usually responds within a few hours');
  assert.equal(responseLabel(240), 'Usually responds within a few hours');
  assert.equal(responseLabel(241), 'Usually responds within 12 hours');
  assert.equal(responseLabel(720), 'Usually responds within 12 hours');
  assert.equal(responseLabel(721), 'Usually responds within a day');
});

test('missing response time has no label', () => {
  assert.equal(responseLabel(null), null);
});
