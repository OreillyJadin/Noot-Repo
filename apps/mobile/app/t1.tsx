// T1 Become a Tutor — ported from screens-tutor.jsx (T1). Intro screen for the
// 10-step tutor application. → T2 Your profile.
import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, NavTop, Body, ActionBar, Button, HeroIcon, H1, Sub, ListSection, ListRow, type IconName } from '@noot/ui';
import { firstIncompleteStep } from '@noot/core';
import { useMe } from '../lib/useMe';
import { useTutorApplication } from '../lib/useTutorApplication';

const NEED: [IconName, string][] = [
  ['cap', 'Profile photo'],
  ['doc', 'Courses you can tutor'],
  ['shield', 'Transcript or grade screenshot (optional — to get verified)'],
  ['card', 'Bank account for payouts'],
];

export default function T1() {
  const router = useRouter();
  // A draft picks up at the first step with something left to do (T4), not at step 2.
  const { tutorStatus } = useMe();
  const { missing } = useTutorApplication();
  const resuming = tutorStatus === 'draft' || tutorStatus === 'rejected';
  const start = () => {
    // ?resumed=1: the earlier steps aren't on the stack, so each step's back arrow walks to
    // the one before it instead of popping straight back here (ERR-020, lib/stepBack.ts).
    if (resuming && missing) router.push(`/t${firstIncompleteStep(missing)}?resumed=1` as never);
    else router.push('/t2');
  };

  return (
    <Screen>
      <NavTop title="Become a tutor" onBack={() => router.back()} />
      <Body pad={22}>
        <View style={{ marginTop: 8 }}>
          <HeroIcon name="cap" size={64} />
        </View>
        <H1 style={{ fontSize: 28, marginTop: 18, maxWidth: 280 }}>You&apos;re about to become a tutor.</H1>
        <Sub style={{ marginTop: 10 }}>About 10–15 minutes. You can save and pick up later.</Sub>

        <View style={{ marginTop: 26 }}>
          <ListSection label="You'll need">
            {NEED.map(([ic, label]) => (
              <ListRow key={label} icon={ic} title={label} titleLines={2} size="regular" />
            ))}
          </ListSection>
        </View>
      </Body>
      <ActionBar>
        <Button
          label={resuming ? 'Continue where you left off' : 'Get started'}
          kind="primary"
          full
          iconRight="chevron"
          onPress={start}
        />
      </ActionBar>
    </Screen>
  );
}
