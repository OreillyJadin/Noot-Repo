// B2 Tutor Profile — ported from design_handoff_noot_app/app/screens-booking.jsx (B2).
// Shows the tutor selected in B1 (booking.tutor); if opened without one it renders
// <NoSession/> instead of a fake tutor. "Book a session" carries the tutor
// (+ chosen course) forward into B3. Ratings/reviews are collected but never shown.
import React from 'react';
import { View, Text, Pressable, Alert, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Screen, NavTop, Body, ActionBar, Button, Card, Badge, Avatar, H1, Sub, Eyebrow, Ic, useTheme } from '@noot/ui';
import { api } from '@noot/core';
import { useApp } from '../lib/store';
import { NoSession } from '../lib/NoSession';

export default function B2() {
  const { booking } = useApp();
  if (!booking.tutor) return <NoSession />;
  return <B2Inner />;
}

function B2Inner() {
  const t = useTheme();
  const router = useRouter();
  const { booking, patchBooking } = useApp();
  // preview=1 → the tutor is viewing their OWN public profile from "Edit tutor
  // profile". Same layout students see, but the booking/save actions are hidden.
  const { preview } = useLocalSearchParams<{ preview?: string }>();
  const isPreview = preview === '1';
  const tutor = booking.tutor!;
  const minRate = Math.min(...tutor.courses.map((c) => c[2]));
  const activeCourse = booking.course ?? tutor.courses[0]?.[0] ?? '';

  const book = (courseCode?: string) => {
    if (isPreview) return; // read-only self-preview — can't book yourself
    patchBooking({ tutor, course: courseCode ?? activeCourse });
    router.push('/b3');
  };

  const save = async () => {
    try {
      await api.tutors.save(tutor.id);
      Alert.alert('Saved to your list');
    } catch {
      Alert.alert('Sign in to save tutors');
    }
  };

  return (
    <Screen>
      <NavTop
        title={isPreview ? 'Profile preview' : ''}
        onBack={() => router.back()}
        trailing={
          isPreview ? undefined : (
            <Pressable onPress={save} style={[styles.bookmarkBtn, { backgroundColor: t.surface, borderColor: t.border }]}>
              <Ic name="bookmark" size={17} color={t.text2} strokeWidth={1.8} />
            </Pressable>
          )
        }
      />

      <Body pad={20} contentStyle={{ paddingTop: 0 }}>
        <View style={styles.header}>
          <Avatar size={92} />
          <H1 style={{ fontSize: 24, marginTop: 14 }}>{tutor.name}</H1>
          <Text style={{ fontSize: 14, color: t.text3, marginTop: 3 }}>
            {tutor.year} · {tutor.major}
          </Text>
          <View style={styles.headerStats}>
            <Text style={{ fontSize: 14, color: t.text2 }}>
              <Text style={{ color: t.text, fontWeight: '700' }}>{tutor.sessions}</Text> sessions completed
            </Text>
            <View style={[styles.divider, { backgroundColor: t.border }]} />
            <Badge label="Verified" tone="good" />
          </View>
        </View>

        <Section title="About">
          <Sub style={{ fontSize: 14 }}>{tutor.bio}</Sub>
        </Section>

        <Section title="Courses & rates">
          <View style={{ gap: 8 }}>
            {tutor.courses.map(([code, grade, rate, sess]) => (
              <Card key={code} onPress={() => book(code)} style={styles.courseCard}>
                <View style={[styles.gradeBox, { backgroundColor: t.accent }]}>
                  <Text style={{ color: t.onAccent, fontWeight: '700', fontSize: 14 }}>{grade}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: t.text }}>{code}</Text>
                  <View style={styles.courseMetaRow}>
                    <Badge label={`Grade ${grade}`} tone="good" />
                    <Text style={{ fontSize: 12, color: t.text3 }}>· {sess} sessions</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 16, fontWeight: '700', color: t.text }}>
                  ${rate}
                  <Text style={{ fontSize: 11, color: t.text3, fontWeight: '500' }}>/hr</Text>
                </Text>
              </Card>
            ))}
          </View>
        </Section>

        <Section title="Verified by noot">
          <Card flat style={{ ...styles.verifiedCard, backgroundColor: t.surfaceAlt }}>
            <Ic name="shield" size={18} color={t.good} strokeWidth={1.8} />
            <Text style={{ flex: 1, fontSize: 13, color: t.text2, lineHeight: 19.5 }}>
              Grades are confirmed against official UA transcripts. Session quality is monitored by our team — flag
              any concern and we&apos;ll review it directly.
            </Text>
          </Card>
        </Section>
      </Body>

      <ActionBar>
        {isPreview ? (
          <Button label="Done" kind="primary" full onPress={() => router.back()} />
        ) : (
          <>
            <View style={{ flexShrink: 0 }}>
              <Text style={{ fontSize: 12, color: t.text3 }}>From</Text>
              <Text style={{ fontSize: 20, fontWeight: '700', color: t.text }}>
                ${minRate}
                <Text style={{ fontSize: 12, color: t.text3, fontWeight: '500' }}>/hr</Text>
              </Text>
            </View>
            <Button label="Book a session" kind="primary" iconRight="chevron" style={{ flex: 1 }} onPress={() => book(activeCourse)} />
          </>
        )}
      </ActionBar>
    </Screen>
  );
}

// ── local helpers (used only by this screen) ───────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ marginTop: 24 }}>
      <Eyebrow style={{ color: t.text3, marginBottom: 12 }}>{title}</Eyebrow>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  bookmarkBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: { alignItems: 'center' },
  headerStats: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 12 },
  divider: { width: 1, height: 16 },
  courseCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  gradeBox: { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  courseMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  verifiedCard: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 14 },
});
