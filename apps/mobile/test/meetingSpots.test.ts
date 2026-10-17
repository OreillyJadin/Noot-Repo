import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { TutoringLocation } from '@noot/core';
import { defaultMeetingSpot, meetingSpotSections, OTHER_SPOT } from '../lib/meetingSpots.ts';

const locations: TutoringLocation[] = [
  { id: 'building-b', category: 'building', name: 'Bidgood Hall' },
  { id: 'library-g', category: 'library', name: 'Gorgas Library' },
  { id: 'building-a', category: 'building', name: 'B. B. Comer Hall' },
  { id: 'library-a', category: 'library', name: 'Angelo Bruno Business Library' },
];

test('groups libraries before buildings and sorts names within each section', () => {
  assert.deepEqual(meetingSpotSections(locations, ''), [
    { title: 'Libraries', items: ['Angelo Bruno Business Library', 'Gorgas Library'] },
    { title: 'Campus buildings', items: ['B. B. Comer Hall', 'Bidgood Hall'] },
  ]);
});

test('filters case-insensitively by substring and ignores punctuation', () => {
  assert.deepEqual(meetingSpotSections(locations, 'LIBRARY'), [
    { title: 'Libraries', items: ['Angelo Bruno Business Library', 'Gorgas Library'] },
  ]);
  assert.deepEqual(meetingSpotSections(locations, 'bb comer'), [
    { title: 'Campus buildings', items: ['B. B. Comer Hall'] },
  ]);
});

test('drops empty sections', () => {
  assert.deepEqual(meetingSpotSections(locations, 'bidgood'), [
    { title: 'Campus buildings', items: ['Bidgood Hall'] },
  ]);
});

test('keeps a non-online current location', () => {
  assert.equal(defaultMeetingSpot(locations, 'A saved custom spot'), 'A saved custom spot');
});

test('replaces an online location with the preferred campus location', () => {
  assert.equal(defaultMeetingSpot(locations, 'Online'), 'Gorgas Library');
});

test('prefers Gorgas Library, then the first library, then the first location', () => {
  assert.equal(defaultMeetingSpot(locations), 'Gorgas Library');
  assert.equal(defaultMeetingSpot([
    { id: 'b', category: 'building', name: 'First building' },
    { id: 'l', category: 'library', name: 'First library' },
  ]), 'First library');
  assert.equal(defaultMeetingSpot([
    { id: 'b', category: 'building', name: 'First building' },
  ]), 'First building');
});

test('uses Other when there are no locations', () => {
  assert.equal(defaultMeetingSpot([]), OTHER_SPOT);
});
