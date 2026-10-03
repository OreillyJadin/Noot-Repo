// What a tutor sees at the top of the tutor screens before they're verified.
//
// Three states, because they need three different things said. The old UI had none of this:
// an applicant landed on the dashboard under a hardcoded "✓ Verified" badge with no sign they
// were still in review, and a rejected applicant looked identical to someone who'd never
// applied — including a live "Become a tutor" button that silently re-upserted the same
// profile. The copy states the situation plainly and, where there's something to do, offers
// exactly one action; where there isn't, it deliberately offers none rather than a button
// that does nothing.
//
// While an application is in review, the banner also shows the interview the noot team has
// scheduled with the tutor, once there is one (ERR-005).
import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, Linking, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ic, useTheme, type IconName } from '@noot/ui';
import { api, type TutorInterview } from '@noot/core';
import type { TutorStatus } from './useMe';
import { interviewLabel } from './interviewSlots';

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
  // Started, not submitted (0038). Nobody is reviewing it yet, so say so.
  draft: {
    icon: 'edit',
    title: 'Finish your application',
    body: 'You’re part-way through. Pick up where you left off — students can book you once you submit and we approve it.',
    cta: 'Continue',
  },
  pending: {
    icon: 'clock',
    title: 'Application in review',
    body: 'A noot team member is reviewing your application — usually within 24 hours. You can adjust your rates and availability now so you’re bookable the moment you’re approved.',
    cta: null,
  },
  rejected: {
    icon: 'alert',
    title: 'Application not approved',
    body: 'We couldn’t approve your application as sent. Check your profile, courses and transcript, then submit again.',
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
  const [interview, setInterview] = useState<TutorInterview | null>(null);
  // Re-read whenever the screen comes back into view: tab roots stay mounted, and the tutor
  // usually arrives here straight from the notification that the time was set or changed.
  useFocusEffect(
    useCallback(() => {
      if (status !== 'pending') {
        setInterview(null);
        return;
      }
      let active = true;
      api.profile
        .getMyInterview()
        .then((i) => { if (active) setInterview(i); })
        .catch(() => { /* the banner still says "in review" without it */ });
      return () => { active = false; };
    }, [status]),
  );

  if (status === 'approved') return null;
  // An interview still ahead (or under an hour past its start) replaces the generic copy.
  const upcoming = interview && new Date(interview.scheduledAt).getTime() > Date.now() - 60 * 60 * 1000 ? interview : null;
  const copy = upcoming
    ? {
        ...COPY.pending,
        title: `Interview: ${interviewLabel(new Date(upcoming.scheduledAt))}`,
        body: 'A noot team member will meet you then to finish reviewing your application.',
      }
    : COPY[status];
  // Where to meet, as the admin typed it. A link in it opens on tap; the text can be copied.
  const where = upcoming?.details ?? '';
  const link = /https?:\/\/\S+/.exec(where)?.[0];

  const body = (
    <View style={styles.row}>
      <View style={[styles.icon, { backgroundColor: t.accent }]}>
        <Ic name={copy.icon} size={17} color={t.onAccent} strokeWidth={1.9} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: t.text }]}>{copy.title}</Text>
        <Text style={[styles.body, { color: t.text2 }]}>{copy.body}</Text>
        {where ? (
          <Text
            selectable
            onPress={link ? () => { void Linking.openURL(link).catch(() => {}); } : undefined}
            accessibilityRole={link ? 'link' : 'text'}
            style={[styles.where, { color: link ? t.accent : t.text }]}
          >
            {where}
          </Text>
        ) : null}
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
    <View accessibilityLabel={`${copy.title}. ${copy.body}${where ? ` ${where}` : ''}`} style={style}>
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
  where: { fontSize: 12.5, lineHeight: 18, fontWeight: '600', marginTop: 5 },
  cta: { fontSize: 13, fontWeight: '700', marginTop: 6 },
});
