// Honest fallback for the booking/session action screens (pay, cancel, reschedule,
// rate, no-show, tutor detail) when they're reached without a real session in the
// draft — e.g. via the dev launcher. In the normal flow the draft always carries a
// real tutor + booking, so this never shows; it replaces the old fake-tutor fallback.
import React from 'react';
import { useRouter } from 'expo-router';
import { Screen, NavTop, Body, EmptyState } from '@noot/ui';

export function NoSession({
  title = 'No session selected',
  subtitle = 'Open this from one of your sessions and the details will load here.',
}: {
  title?: string;
  subtitle?: string;
}) {
  const router = useRouter();
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/home'));
  return (
    <Screen>
      <NavTop title="" onBack={goBack} />
      <Body pad={24}>
        <EmptyState icon="cal" title={title} subtitle={subtitle} actionLabel="Go back" onAction={goBack} />
      </Body>
    </Screen>
  );
}
