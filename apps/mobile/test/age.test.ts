import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAdult, parseDob } from '../lib/age.ts';

test('turning 18 today is adult, while turning 18 tomorrow is not', () => {
  const today = new Date(2026, 5, 15);
  assert.equal(isAdult('2008-06-15', today), true);
  assert.equal(isAdult('2008-06-16', today), false);
});

test('a February 29 birthday reaches 18 on March 1 in a non-leap year', () => {
  assert.equal(isAdult('2008-02-29', new Date(2026, 1, 28)), false);
  assert.equal(isAdult('2008-02-29', new Date(2026, 2, 1)), true);
});

test('a February 29 birthday is adult on February 29 in a leap year', () => {
  assert.equal(isAdult('2012-02-29', new Date(2032, 1, 28)), true);
  assert.equal(isAdult('2012-02-29', new Date(2032, 1, 29)), true);
});

test('parseDob returns a normalized date for a real calendar date', () => {
  assert.equal(parseDob('2', '9', '2000'), '2000-02-09');
  assert.equal(parseDob('02', '29', '2000'), '2000-02-29');
});

test('parseDob rejects impossible, too-old, malformed, and future dates', () => {
  assert.equal(parseDob('2', '30', '2000'), null);
  assert.equal(parseDob('2', '29', '2001'), null);
  assert.equal(parseDob('1', '1', '1899'), null);
  assert.equal(parseDob('13', '1', '2000'), null);
  assert.equal(parseDob('1', '1', '9999'), null);
  assert.equal(isAdult('2008-02-30', new Date(2026, 5, 15)), false);
});
