import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('graduation prompt waits until the biometric gate is open', () => {
  assert.match(source('../lib/AuthGate.tsx'), /phase === 'open' \? <GraduationPrompt \/> : null/);
  assert.doesNotMatch(source('../app/_layout.tsx'), /<GraduationPrompt/);
});

test('graduation prompt uses the server response and keeps keyboard actions reachable', () => {
  const prompt = source('../lib/GraduationPrompt.tsx');
  assert.match(prompt, /api\.profile\.respondToGraduation/);
  assert.match(prompt, /KeyboardAvoidingView/);
  assert.match(prompt, /keyboardDismissMode="on-drag"/);
  assert.match(prompt, /dismissedKey !== key/);
});

test('student and tutor profile entry points save and prefill expected graduation year', () => {
  for (const screen of ['edit_personal', 'student_profile', 't2', 't9']) {
    const screenSource = source(`../app/${screen}.tsx`);
    assert.match(screenSource, /<GraduationYearField/, screen);
    assert.match(screenSource, /setExpectedYear\(me\.expectedGraduationYear/, screen);
    assert.match(screenSource, /expectedGraduationYear: year === 'Post Grad'/, screen);
    assert.match(screenSource, /options=\{ACADEMIC_YEAR_OPTIONS\}/, screen);
  }
});

test('account deletion clears the newly collected private field', () => {
  assert.match(source('../../../supabase/functions/delete-account/index.ts'), /expected_graduation_year: null/);
});
