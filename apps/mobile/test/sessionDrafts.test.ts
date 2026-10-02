// Run: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tutorSessionDrafts } from '../lib/sessionDrafts.ts';

const base = { studentFirstName: 'Sam', tutorFirstName: 'Sara', course: 'MATH 125', location: 'Gorgas Library', when: 'Thursday at 3:00 PM' };
const loc = (over: Partial<typeof base>) => tutorSessionDrafts({ ...base, ...over }).find((d) => d.key === 'location')!.text;

test('the location draft names the booked library and asks the tutor for the exact spot', () => {
  const text = loc({});
  assert.match(text, /^Hi Sam! For our MATH 125 session Thursday at 3:00 PM, let's meet at Gorgas Library\./);
  assert.match(text, /\[room number\]/);
  assert.match(text, /\[floor \/ area\]/);
});

test('"Other — I\'ll suggest" is not treated as a place', () => {
  const text = loc({ location: "Other — I'll suggest" });
  assert.doesNotMatch(text, /meet at Other/);
  assert.match(text, /\[library or hall\]/);
});

test('no location at all asks where works', () => {
  assert.match(loc({ location: '' }), /^Hi Sam! Where works best/);
});

test('missing names and times degrade cleanly, with no "undefined"', () => {
  for (const d of tutorSessionDrafts({ studentFirstName: '', tutorFirstName: '', course: '', location: '', when: '' })) {
    assert.doesNotMatch(d.text, /undefined|null| {2}/, d.key);
  }
});

test('the location prompt is offered first', () => {
  assert.equal(tutorSessionDrafts(base)[0]!.key, 'location');
});
