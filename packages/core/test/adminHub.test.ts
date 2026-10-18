import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attentionTotal, type AdminHubCounts } from '../src/adminHub.ts';

const emptyCounts: AdminHubCounts = {
  applications: 0,
  gradeChecks: 0,
  interviews: 12,
  nextInterviewAt: null,
  reviews: 0,
  complaints: 0,
  disputes: 0,
  ambassadorApplications: 0,
  cashouts: 0,
};

test('attentionTotal sums actionable queues and excludes interviews', () => {
  assert.equal(
    attentionTotal({
      ...emptyCounts, applications: 2, gradeChecks: 1, reviews: 3, complaints: 4, disputes: 5,
      ambassadorApplications: 6, cashouts: 7,
    }),
    28,
  );
});

test('attentionTotal is zero when all actionable queues are empty', () => {
  assert.equal(attentionTotal(emptyCounts), 0);
});
