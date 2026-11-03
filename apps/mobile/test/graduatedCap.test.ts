import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { toTutor } from '../lib/data';
import type { TutorSummary } from '@noot/core';

const source = readFileSync(new URL('../lib/GraduatedCap.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText;
const exports: Record<string, any> = {};
runInNewContext(compiled, {
  exports,
  require: (name: string) => {
    if (name === 'react') return { createElement: (type: unknown, props: unknown, ...children: unknown[]) => ({ type, props, children }) };
    if (name === 'react-native') return { View: 'View' };
    if (name === '@noot/ui') return { Ic: 'Ic', useTheme: () => ({ accent: '#78A070' }) };
    throw new Error(`Unexpected import: ${name}`);
  },
});

test('Post Grad cap is outlined, name-sized, theme-aware and labelled Graduated', () => {
  const badge = exports.GraduatedCap({ year: 'Post Grad' });
  assert.equal(badge.props.accessible, true);
  assert.equal(badge.props.accessibilityRole, 'image');
  assert.equal(badge.props.accessibilityLabel, 'Graduated');
  assert.equal(badge.children[0].props.name, 'gradCap');
  assert.equal(badge.children[0].props.size, 16);
  assert.equal(badge.children[0].props.strokeWidth, 1.8);
  assert.equal(badge.children[0].props.color, '#78A070');
  const header = exports.GraduatedCap({ year: 'Post Grad', size: 23, color: '#5A6157' });
  assert.equal(header.children[0].props.size, 23);
  assert.equal(header.children[0].props.color, '#5A6157');
});

test('cap is absent for undergraduate, missing and unexpected year values', () => {
  for (const year of ['Freshman', 'Senior', '', null, undefined, 'post grad', 'Post Grad ']) {
    assert.equal(exports.GraduatedCap({ year }), null);
  }
});

test('TutorSummary academic year survives the screen adapter', () => {
  const tutor: TutorSummary = {
    userId: 'tutor', firstName: 'Sara', lastName: 'Mitchell', year: 'Post Grad', major: 'Math',
    avatarUrl: null, bio: '', subjects: ['MATH 125'], hourlyRate: 28, ratingAvg: null,
    totalSessions: 42, verifiedGrade: null, verified: false, courses: [],
  };
  for (const year of ['Post Grad', 'Senior', null]) {
    assert.equal(toTutor({ ...tutor, year }).year, year ?? '');
  }
});
