// S4 Saved — ported from screens-tabs.jsx (SavedTab). Bottom-tab destination.
// Note: per screens-map.jsx this list has since been folded into the Sessions tab's
// "Saved" segment (see sessions.tsx), but the standalone route is kept per the nav map.
// Tapping a tutor stashes it on the in-progress booking draft and opens their profile (B2).
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Screen, Body, Card, Avatar, Badge, Ic, H1, TabBar, useTheme } from '@noot/ui';
import { api } from '@noot/core';
import { useApp } from '../lib/store';
import { toTutor, type Tutor } from '../lib/data';

function TabHeader({ title }: { title: string }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 4, backgroundColor: t.bg }]}>
      <H1 style={styles.headerTitle}>{title}</H1>
    </View>
  );
}

export default function Saved() {
  const t = useTheme();
  const router = useRouter();
  const { patchBooking } = useApp();
  const [tutors, setTutors] = useState<Tutor[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    api.tutors
      .listSaved()
      .then((list) => { if (active) setTutors(list.map(toTutor)); })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const open = (tutor: Tutor) => {
    patchBooking({ tutor, course: tutor.courses[0]?.[0] ?? 'MGT 300' });
    router.push('/b2');
  };

  const onTab = (key: string) => {
    switch (key) {
      case 'home':
        router.replace('/home');
        break;
      case 'student_home':
        router.replace('/student_home');
        break;
      case 'sessions':
        router.replace('/sessions');
        break;
      case 'profile':
        router.replace('/profile');
        break;
    }
  };

  return (
    <Screen>
      <TabHeader title="Saved" />
      <Body pad={20} contentStyle={{ paddingTop: 8 }}>
        <Text style={[styles.count, { color: t.text3 }]}>
          {loading ? 'Loading…' : `${tutors.length} tutor${tutors.length === 1 ? '' : 's'} saved for later`}
        </Text>
        <View style={{ gap: 10 }}>
          {tutors.map((tutor) => (
            <Card key={tutor.id} onPress={() => open(tutor)} style={styles.row}>
              <Avatar size={48} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.rowHead}>
                  <Text style={[styles.name, { color: t.text }]}>{tutor.name}</Text>
                  <Text style={[styles.rate, { color: t.text }]}>
                    ${tutor.rate}
                    <Text style={[styles.rateUnit, { color: t.text3 }]}>/hr</Text>
                  </Text>
                </View>
                <Text style={[styles.sub, { color: t.text3 }]}>
                  {tutor.year} · {tutor.major}
                </Text>
                <View style={styles.tagsRow}>
                  <Badge label={tutor.courses[0]?.[0] ?? 'MGT 300'} tone="accentSoft" />
                  <Badge label="✓ Verified" tone="good" />
                  <Text style={[styles.sessions, { color: t.text3 }]}>{tutor.sessions} sessions</Text>
                </View>
              </View>
              <Ic name="bookmark" size={19} color={t.accent} strokeWidth={1.6} fill={t.accent} />
            </Card>
          ))}
          {!loading && tutors.length === 0 ? (
            <Text style={[styles.count, { color: t.text3, marginTop: 8 }]}>No saved tutors yet.</Text>
          ) : null}
        </View>
      </Body>
      <TabBar active="saved" onTab={onTab} role="student" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexShrink: 0, paddingHorizontal: 20, paddingBottom: 8 },
  headerTitle: { fontSize: 30 },
  count: { fontSize: 13, marginBottom: 2 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 12 },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  name: { fontSize: 16, fontWeight: '600' },
  rate: { fontSize: 15, fontWeight: '700' },
  rateUnit: { fontSize: 11, fontWeight: '500' },
  sub: { fontSize: 13, marginTop: 1 },
  tagsRow: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 8 },
  sessions: { marginLeft: 'auto', fontSize: 12 },
});
