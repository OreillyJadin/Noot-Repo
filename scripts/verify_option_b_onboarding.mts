import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const screens = [
  'apps/mobile/app/t1.tsx',
  'apps/mobile/app/t2.tsx',
  'apps/mobile/app/t3.tsx',
  'apps/mobile/app/t4.tsx',
  'apps/mobile/app/t5.tsx',
  'apps/mobile/app/t6.tsx',
  'apps/mobile/app/t7.tsx',
  'apps/mobile/app/t8.tsx',
  'apps/mobile/app/t9.tsx',
  'apps/mobile/app/t10.tsx',
  'apps/mobile/app/student_profile.tsx',
  'apps/mobile/app/signin.tsx',
  'apps/mobile/app/signup.tsx',
  'apps/mobile/app/forgot_password.tsx',
  'apps/mobile/app/set_password.tsx',
  'apps/mobile/app/accept_terms.tsx',
  'apps/mobile/app/age_gate.tsx',
  'apps/mobile/app/verified.tsx',
  'apps/mobile/app/role.tsx',
  'apps/mobile/app/enable_faceid.tsx',
  'apps/mobile/app/under_age.tsx',
  'apps/mobile/app/guidelines.tsx',
  'apps/mobile/app/index.tsx',
];

for (const path of screens) {
  const source = readFileSync(join(root, path), 'utf8');
  assert.doesNotMatch(source, /textTransform:\s*['"]uppercase['"]/, `${path} still has uppercase text styling`);
  for (const [, value] of source.matchAll(/letterSpacing\s*:\s*(-?\d+(?:\.\d+)?)/g)) {
    assert.ok(Number(value) < 0.5, `${path} has letter spacing ${value}`);
  }
  assert.doesNotMatch(source, /Hey,\s/, `${path} still has a greeting`);
  assert.doesNotMatch(source, /from ['"]@supabase\//, `${path} imports Supabase directly`);
  assert.doesNotMatch(source, /#C0392B/, `${path} still has the hard-coded error color`);
}

for (const screen of ['t1', 't3', 't4', 't6', 't9', 't10', 'verified', 'index']) {
  const path = `apps/mobile/app/${screen}.tsx`;
  assert.match(readFileSync(join(root, path), 'utf8'), /\bListSection\b/, `${path} must use ListSection`);
}

for (const [screen, phrase] of [
  ['set_password', 'zero tolerance for objectionable content and abusive behavior'],
  ['accept_terms', 'zero tolerance for objectionable content and abusive behavior'],
  ['accept_terms', 'Using noot means agreeing to how we keep it safe for everyone. Please read and accept the terms below.'],
  ['signup', 'noot is closed to verified students.'],
  ['t6', 'We never share your transcript.'],
  ['t4', 'You keep the majority of every session.'],
  ['t8', 'noot never sees your SSN or bank info.'],
  ['age_gate', 'noot is for people 18 and older'],
  ['signup', 'You must be 18 or older to use noot.'],
] as const) {
  const path = `apps/mobile/app/${screen}.tsx`;
  assert.ok(readFileSync(join(root, path), 'utf8').includes(phrase), `${path} must retain "${phrase}"`);
}

console.log('Option B onboarding/auth screen source checks passed.');
