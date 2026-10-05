// Run: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEmailCode } from '../src/auth/index.ts';

test('a code is accepted the ways people type or paste it', () => {
  assert.equal(normalizeEmailCode('123456'), '123456');
  assert.equal(normalizeEmailCode(' 123 456 '), '123456');
  assert.equal(normalizeEmailCode('1234-5678'), '12345678');
  assert.equal(normalizeEmailCode('12345678\n'), '12345678');
});

test('anything that cannot be a code is refused before it is sent', () => {
  assert.equal(normalizeEmailCode(''), null);
  assert.equal(normalizeEmailCode('12345'), null);
  assert.equal(normalizeEmailCode('12345678901'), null);
  assert.equal(normalizeEmailCode('12345a'), null);
  assert.equal(normalizeEmailCode('１２３４５６'), null);
});
