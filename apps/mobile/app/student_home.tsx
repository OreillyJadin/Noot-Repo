// S3 Search / Browse — ported from screens-student.jsx (StudentHome). Browse-first
// hub into the booking flow: tappable search bar + category tabs → a "popular"
// carousel and a detailed tutor list, both opening the tutor profile (B2).
// Real wiring later: replace TUTORS with @noot/core per-category search results.
import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Screen, Body, Card, Avatar, Badge, Field, Ic, H2, Muted, TabBar, useTheme } from '@noot/ui';
import { useApp } from '../lib/store';
import { TUTORS, type Tutor } from '../lib/data';

const CATS = ['For you', 'Business', 'STEM', 'Humanities'] as const;
const TITLES: Record<(typeof CATS)[number], string> = {
  'For you': 'Popular this week',
  Business: 'Top in Business',
  STEM: 'Top in STEM',
  Humanities: 'Top in Humanities',
};
// NOTE(api): the demo pool (lib/data TUTORS) currently only covers MGT 300 /
// business tutors, so every tab draws from the same list — only the section
// title changes. Swap in real per-department queries once the API exists.

function courseFor(tutor: Tutor): string {
  return tutor.courses[0]?.[0] ?? 'MGT 300';
}

// ── local helper (used only by this screen) ─────────────────────────────────
function TutorRow({ tutor, onPress }: { tutor: Tutor; onPress: () => void }) {
  const t = useTheme();
  const course = courseFor(tutor);
  return (
    <Card onPress={onPress} style={styles.rowCard}>
      <View style={styles.rowInner}>
        <Avatar size={46} />
        <View style={styles.rowBody}>
          <View style={styles.rowTop}>
            <Text style={[styles.rowName, { color: t.text }]}>{tutor.name}</Text>
            <Text style={[styles.rowRate, { color: t.text }]}>
              ${tutor.rate}
              <Text style={[styles.rowRateUnit, { color: t.text3 }]}>/hr</Text>
            </Text>
          </View>
          <Text style={[styles.rowMeta, { color: t.text3 }]}>
            {tutor.year} · {tutor.major}
          </Text>
          <View style={styles.rowFoot}>
            <Badge label={course} tone="accentSoft" />
            <Badge label="Verified" tone="good" />
            <Text style={[styles.rowSessions, { color: t.text3 }]}>{tutor.sessions} sessions</Text>
          </View>
        </View>
      </View>
    </Card>
  );
}

export default function StudentHome() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { patchBooking } = useApp();
  const [tab, setTab] = useState(0);

  const cat = CATS[tab] ?? CATS[0];
  const rows = TUTORS; // see NOTE(api) above — same pool for every category today

  const openSearch = () => router.push('/b1');
  const openTutor = (tutor: Tutor) => {
    patchBooking({ tutor, course: courseFor(tutor) });
    router.push('/b2');
  };
  const onTab = (key: string) => {
    // TODO: sessions/profile tabs aren't ported yet — this will 404 until they are.
    router.replace(`/${key}` as never);
  };

  return (
    <Screen>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <View>
            <Muted style={styles.welcome}>Welcome back</Muted>
            <H2 style={styles.name}>Hey, Lindsay</H2>
          </View>
          <Avatar size={40} />
        </View>

        {/* Tapping anywhere on the field opens Search (B1); it isn't a live text input here. */}
        <Pressable onPress={openSearch}>
          <View pointerEvents="none">
            <Field
              placeholder="What class? e.g. MGT 300"
              value=""
              prefix={<Ic name="search" size={18} color={t.text3} strokeWidth={1.8} />}
              suffix={<Ic name="sliders" size={18} color={t.accent} strokeWidth={1.8} />}
            />
          </View>
        </Pressable>
      </View>

      <View style={[styles.tabs, { borderBottomColor: t.border }]}>
        {CATS.map((c, i) => {
          const on = i === tab;
          return (
            <Pressable
              key={c}
              onPress={() => setTab(i)}
              style={[styles.tabItem, { borderBottomColor: on ? t.accent : 'transparent' }]}
            >
              <Text style={[styles.tabLabel, { color: on ? t.accent : t.text3, fontWeight: on ? '700' : '500' }]}>
                {c}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Body pad={0} contentStyle={styles.bodyContent}>
        <View style={styles.sectionHead}>
          <H2 style={styles.sectionTitle}>{tab === 0 ? 'Popular this week' : cat}</H2>
          <Text onPress={openSearch} style={[styles.seeAll, { color: t.accent }]}>
            See all
          </Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel}>
          {rows.map((tutor) => (
            <Card key={tutor.id} onPress={() => openTutor(tutor)} style={styles.miniCard}>
              <Avatar size={40} />
              <Text style={[styles.miniName, { color: t.text }]}>{tutor.name}</Text>
              <Badge label={courseFor(tutor)} tone="accentSoft" />
              <View style={styles.miniVerified}>
                <Ic name="check" size={13} color={t.good} strokeWidth={2.6} />
                <Text style={[styles.miniVerifiedLabel, { color: t.good }]}>Verified</Text>
              </View>
            </Card>
          ))}
        </ScrollView>

        <View style={[styles.sectionHead, styles.sectionHeadSpaced]}>
          <H2 style={styles.sectionTitle}>{TITLES[cat] ?? cat}</H2>
          <Text onPress={openSearch} style={[styles.seeAll, { color: t.accent }]}>
            See all
          </Text>
        </View>
        <View style={styles.list}>
          {rows.map((tutor) => (
            <TutorRow key={tutor.id} tutor={tutor} onPress={() => openTutor(tutor)} />
          ))}
        </View>
      </Body>

      <TabBar active="student_home" role="student" onTab={onTab} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 6, gap: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  welcome: { fontSize: 13 },
  name: { fontSize: 22 },
  tabs: { flexDirection: 'row', gap: 18, paddingHorizontal: 20, borderBottomWidth: 1 },
  tabItem: { paddingBottom: 10, borderBottomWidth: 2 },
  tabLabel: { fontSize: 15 },
  bodyContent: { paddingTop: 16 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 20, paddingBottom: 10 },
  sectionHeadSpaced: { paddingTop: 20 },
  sectionTitle: { fontSize: 18 },
  seeAll: { fontSize: 14, fontWeight: '600' },
  carousel: { gap: 12, paddingHorizontal: 20, paddingVertical: 2 },
  miniCard: { width: 132, padding: 14, gap: 10 },
  miniName: { fontSize: 15, fontWeight: '600' },
  miniVerified: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  miniVerifiedLabel: { fontSize: 12, fontWeight: '600' },
  list: { paddingHorizontal: 20, paddingBottom: 8, gap: 10 },
  rowCard: { padding: 12 },
  rowInner: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  rowBody: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  rowName: { fontSize: 16, fontWeight: '600' },
  rowRate: { fontSize: 15, fontWeight: '700' },
  rowRateUnit: { fontSize: 11, fontWeight: '500' },
  rowMeta: { fontSize: 13, marginTop: 2 },
  rowFoot: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 8 },
  rowSessions: { fontSize: 12, marginLeft: 'auto' },
});
