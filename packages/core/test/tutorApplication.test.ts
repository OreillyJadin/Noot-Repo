// Run: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  missingRequirements,
  stepComplete,
  firstIncompleteStep,
  type ApplicationFacts,
} from '../src/tutorApplication.ts';

const complete: ApplicationFacts = {
  firstName: 'Landon',
  lastName: 'E',
  avatarUrl: 'https://x/a.jpg',
  courses: [{ hourlyRate: 25 }, { hourlyRate: 30 }],
  availabilityCount: 2,
  transcriptUploaded: true,
  transcriptSkipped: false,
  agreementSignedAt: '2026-09-23T00:00:00Z',
  payoutsEnabled: true,
};

test('a complete application is missing nothing and lands on review', () => {
  assert.deepEqual(missingRequirements(complete), []);
  assert.equal(firstIncompleteStep([]), 9);
});

test('an empty application is missing everything, in step order', () => {
  const missing = missingRequirements({
    firstName: ' ', lastName: '', avatarUrl: null, courses: [], availabilityCount: 0,
    transcriptUploaded: false, transcriptSkipped: false, agreementSignedAt: null, payoutsEnabled: false,
  });
  assert.deepEqual(missing, ['name', 'photo', 'courses', 'rates', 'availability', 'transcript', 'agreement', 'payouts']);
  assert.equal(firstIncompleteStep(missing), 2);
});

test('step 6: skipping the transcript satisfies it; doing neither does not', () => {
  assert.ok(stepComplete(6, missingRequirements({ ...complete, transcriptUploaded: false, transcriptSkipped: true })));
  assert.ok(!stepComplete(6, missingRequirements({ ...complete, transcriptUploaded: false, transcriptSkipped: false })));
});

test('step 4: any course under $10/hr (e.g. a new $0 course) blocks it', () => {
  const m = missingRequirements({ ...complete, courses: [{ hourlyRate: 25 }, { hourlyRate: 0 }] });
  assert.deepEqual(m, ['rates']);
  assert.equal(firstIncompleteStep(m), 4);
});

test('step 7 needs a signature; step 8 needs Stripe payouts enabled', () => {
  assert.deepEqual(missingRequirements({ ...complete, agreementSignedAt: null }), ['agreement']);
  assert.deepEqual(missingRequirements({ ...complete, payoutsEnabled: false }), ['payouts']);
  assert.equal(firstIncompleteStep(['payouts']), 8);
});

test('step 2 needs a photo, not just a name', () => {
  assert.equal(firstIncompleteStep(missingRequirements({ ...complete, avatarUrl: null })), 2);
});
