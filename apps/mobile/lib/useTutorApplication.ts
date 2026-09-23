// The tutor's application as saved, plus what's still missing (tracker T4). One read that
// every onboarding step uses to decide what it enables, re-read whenever the screen
// regains focus — so coming back from Stripe or an earlier step shows the current state.
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { api, missingRequirements, type MyTutorProfile, type Requirement } from '@noot/core';
import { useMe } from './useMe';

export function useTutorApplication() {
  const { me } = useMe();
  const [app, setApp] = useState<MyTutorProfile | null>(null);
  const [error, setError] = useState(false);

  const reload = useCallback(async () => {
    try {
      setApp(await api.profile.getMyTutorProfile());
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  const missing: Requirement[] | null =
    app && me
      ? missingRequirements({
          firstName: me.firstName,
          lastName: me.lastName,
          avatarUrl: me.avatarUrl,
          courses: app.courses,
          availabilityCount: app.availability.length,
          transcriptUploaded: app.transcriptUploaded,
          transcriptSkipped: app.transcriptSkipped,
          agreementSignedAt: app.agreementSignedAt,
          payoutsEnabled: app.payoutsEnabled,
        })
      : null;

  return { app, missing, loading: !app && !error, error, reload };
}
