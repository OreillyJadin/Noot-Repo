// The Verified badge (tracker T6): shown only for a tutor whose transcript a noot admin has
// checked (tutor_profiles.grades_verified_at). Renders nothing otherwise — being approved
// to tutor is not the same as being verified. Tapping it explains what it means.
//
// Every screen that shows a tutor used to hard-code "✓ Verified", so every tutor looked
// verified. Use this instead of a literal badge.
import React from 'react';
import { Alert, Pressable } from 'react-native';
import { Badge } from '@noot/ui';

export const VERIFIED_EXPLAINER =
  'A noot team member checked this tutor’s transcript and confirmed the grades they list for their courses.';

export function VerifiedBadge({ verified, compact = false }: { verified: boolean; compact?: boolean }) {
  if (!verified) return null;
  return (
    <Pressable
      onPress={() => Alert.alert('Verified tutor', VERIFIED_EXPLAINER)}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel="Verified tutor. Tap for what this means."
    >
      <Badge label={compact ? '✓' : '✓ Verified'} tone="good" />
    </Pressable>
  );
}
