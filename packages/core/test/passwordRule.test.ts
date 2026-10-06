// Run: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { passwordProblem, PASSWORD_SPECIAL_CHARACTERS } from '../src/auth/passwordRule.ts';

test('a password meeting the rule has no problem', () => {
  assert.equal(passwordProblem('Abcdefg1!'), null);
  assert.equal(passwordProblem('Roll-Tide2026'), null);
});

test('each missing piece is named, shortest fix first', () => {
  assert.equal(passwordProblem('Ab1!xyz'), 'Use at least 8 characters.');
  assert.equal(passwordProblem('ABCDEFG1!'), 'Add a lowercase letter.');
  assert.equal(passwordProblem('abcdefg1!'), 'Add an uppercase letter.');
  assert.equal(passwordProblem('Abcdefgh!'), 'Add a number.');
  assert.equal(passwordProblem('Abcdefg12'), 'Add a special character, like ! or #.');
});

test('only the characters the auth server counts are special', () => {
  for (const c of PASSWORD_SPECIAL_CHARACTERS) assert.equal(passwordProblem(`Abcdefg1${c}`), null, c);
  // A space, an accented letter or an emoji is not on the server's list.
  for (const c of [' ', 'é', '😀', '£']) assert.notEqual(passwordProblem(`Abcdefg1${c}`), null, c);
});

test('a password past the server\'s 72-byte cap is refused, counting bytes not characters', () => {
  assert.equal(passwordProblem('Aa1!' + 'x'.repeat(68)), null);
  assert.equal(passwordProblem('Aa1!' + 'x'.repeat(69)), 'That password is too long. Use a shorter one.');
  // 39 characters, 74 bytes.
  assert.equal(passwordProblem('Aa1!' + 'é'.repeat(35)), 'That password is too long. Use a shorter one.');
  assert.equal(passwordProblem('Aa1!' + 'é'.repeat(34)), null);
});

test('non-ASCII letters and digits do not stand in for the required ones', () => {
  assert.equal(passwordProblem('ÀBCDEFG1!'), 'Add a lowercase letter.');
  assert.equal(passwordProblem('Abcdefg١!'), 'Add a number.');
});
