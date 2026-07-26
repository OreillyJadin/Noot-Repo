// What a tutor sees at the top of the tutor screens before they're verified.
//
// Three states, because they need three different things said. The old UI had none of this:
// an applicant landed on the dashboard under a hardcoded "✓ Verified" badge with no sign they
// were still in review, and a rejected applicant looked identical to someone who'd never
// applied — including a live "Become a tutor" button that silently re-upserted the same
// profile. The copy states the situation plainly and, where there's something to do, offers
// exactly one action; where there isn't, it deliberately offers none rather than a button
// that does nothing.
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ic, useTheme, type IconName } from '@noot/ui';
import type { TutorStatus } from './useMe';

const COPY: Record<
  Exclude<TutorStatus, 'approved'>,
  { icon: IconName; title: string; body: string; cta: string | null }
> = {
  none: {
    icon: 'cap',
    title: 'You’re previewing Tutor mode',
    body: 'This is what tutoring on noot looks like. Apply to start taking sessions.',
    cta: 'Apply',
  },
  pending: {
    icon: 'clock',
    title: 'Waiting on verification',
    body: 'We’re checking your transcript against the courses you listed — usually within 24 hours. You can set your rates and availability now so you’re bookable the moment you’re approved.',
    cta: null,
  },
  rejected: {
    icon: 'alert',
    title: 'Application not approved',
    body: 'We couldn’t verify your grades from what you sent. Check your transcript and course list, then send it again.',
    cta: 'Apply again',
  },
};

export function TutorStatusBanner({
  status,
  onApply,
}: {
  status: TutorStatus;
  onApply: () => void;
}) {
  const t = useTheme();
  if (status === 'approved') return null;
  const copy = COPY[status];

  const body = (
    <View style={styles.row}>
      <View style={[styles.icon, { backgroundColor: t.accent }]}>
        <Ic name={copy.icon} size={17} color={t.onAccent} strokeWidth={1.9} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: t.text }]}>{copy.title}</Text>
        <Text style={[styles.body, { color: t.text2 }]}>{copy.body}</Text>
      </View>
      {copy.cta ? <Text style={[styles.cta, { color: t.accent }]}>{copy.cta}</Text> : null}
    </View>
  );

  // Pending has no action — don't render a pressable that would do nothing when tapped.
  const style = [styles.wrap, { backgroundColor: t.accentWeak, borderColor: t.accentBorder }];
  return copy.cta ? (
    <Pressable onPress={onApply} accessibilityRole="button" accessibilityLabel={copy.cta} style={style}>
      {body}
    </Pressable>
  ) : (
    <View accessibilityLabel={`${copy.title}. ${copy.body}`} style={style}>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 13, borderRadius: 14, borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  icon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 13.5, fontWeight: '700' },
  body: { fontSize: 12, lineHeight: 16.8, marginTop: 3 },
  cta: { fontSize: 13, fontWeight: '700', marginTop: 6 },
});
