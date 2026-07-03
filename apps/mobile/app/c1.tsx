// C1 · Session Completion Prompt — ported from screens-completion.jsx (C1).
// Auto-routes by the signed-in role: a student rates the tutor (C2), a tutor
// rates the student (C3). The "preview" link is a demo-only way to peek at the
// other side without actually changing your role.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Screen, Body, ActionBar, Button, Card, Avatar, Badge, Ic, HeroIcon, useTheme } from '@noot/ui';
import { useApp } from '../lib/store';
import { TUTORS, DAYS } from '../lib/data';

const STUDENT = { name: 'Lindsay Thomas', first: 'Lindsay' };

export default function C1() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { role, booking } = useApp();
  const tutor = booking.tutor ?? TUTORS[0]!;
  const isTutor = role === 'tutor';

  const course = booking.course || 'MGT 300';
  const dayObj = DAYS.find((d) => d.i === booking.dayIndex) || DAYS[1]!;
  const slot = booking.slot || '3:00 PM';
  const rateTarget = isTutor ? STUDENT.first : tutor.name;

  return (
    <Screen>
      <View style={{ height: insets.top + 8 }} />
      <Body pad={24}>
        <View style={styles.heroWrap}>
          <HeroIcon name="check" size={72} />
          <Text style={[styles.h1, { color: t.text }]}>How did your session go?</Text>
          <Text style={[styles.sub, { color: t.text2 }]}>
            Your {course} session just wrapped up. Take a few seconds to rate {rateTarget}.
          </Text>
        </View>

        <Card style={{ marginTop: 26, padding: 16 }}>
          <View style={styles.courseRow}>
            <Ic name="cap" size={17} color={t.accent} strokeWidth={1.8} />
            <Text style={[styles.courseText, { color: t.text }]}>{course}</Text>
            <Text style={[styles.courseMeta, { color: t.text3 }]}>{dayObj.label} · {slot}</Text>
          </View>
        </Card>

        <View style={[styles.rateRow, { backgroundColor: t.surfaceAlt }]}>
          <Avatar size={42} label={isTutor ? STUDENT.first[0] : undefined} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, color: t.text3 }}>You&apos;re rating</Text>
            <Text style={{ fontSize: 16, fontWeight: '600', color: t.text }}>{rateTarget}</Text>
          </View>
          <Badge label={isTutor ? 'Tutor view' : 'Student view'} tone="accentSoft" />
        </View>
      </Body>
      <ActionBar style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
        <Button
          label="Rate your session"
          kind="primary"
          full
          iconRight="chevron"
          onPress={() => router.push(isTutor ? '/c3' : '/c2')}
        />
        <Text onPress={() => router.push(isTutor ? '/c2' : '/c3')} style={[styles.preview, { color: t.text3 }]}>
          Demo: preview the {isTutor ? 'student' : 'tutor'} side →
        </Text>
      </ActionBar>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroWrap: { alignItems: 'center', paddingTop: 30 },
  h1: { fontSize: 26, fontWeight: '700', marginTop: 20, maxWidth: 280, textAlign: 'center' },
  sub: { fontSize: 15, lineHeight: 21, marginTop: 8, maxWidth: 260, textAlign: 'center' },
  courseRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  courseText: { fontSize: 15, fontWeight: '600' },
  courseMeta: { marginLeft: 'auto', fontSize: 13 },
  rateRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20, padding: 14, borderRadius: 16 },
  preview: { fontSize: 12.5, textAlign: 'center' },
});
