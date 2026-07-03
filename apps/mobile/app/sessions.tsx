// S5 My Sessions — ported from screens-tabs.jsx (SessionsTab). Upcoming / Past / Saved
// segmented tabs. The prototype reads session lists from NootStore (localStorage);
// there's no backend store yet, so this uses local demo data.
// TODO(api): replace UPCOMING/PAST with real session data (and wire "Saved" to the
// student's actual saved-tutors list) once the backend is available.
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Screen, Body, Card, Avatar, Badge, Chip, Button, Ic, H1, TabBar, useTheme } from '@noot/ui';
import { useApp } from '../lib/store';
import { TUTORS, tutorById } from '../lib/data';

type SegmentKey = 'upcoming' | 'past' | 'saved';

interface DemoSession {
  id: string;
  course: string;
  when: string;
  where?: string;
  soon?: boolean;
  rated?: boolean;
}

const UPCOMING: DemoSession[] = [
  { id: 'sara', course: 'MGT 300', when: 'Today · 3:00 PM', where: 'Online · Zoom', soon: true },
  { id: 'devon', course: 'MGT 300', when: 'Tomorrow · 10:30 AM', where: 'Gorgas Library, 2nd floor' },
];

const PAST: DemoSession[] = [
  { id: 'maya', course: 'MGT 300', when: 'Last Tue · 4:00 PM', rated: true },
  { id: 'alex', course: 'MGT 300', when: 'Last Thu · 1:30 PM', rated: false },
];

const SAVED_IDS = ['sara', 'nina', 'devon'];

function TabHeader({ title }: { title: string }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 4, backgroundColor: t.bg }]}>
      <H1 style={styles.headerTitle}>{title}</H1>
    </View>
  );
}

export default function Sessions() {
  const t = useTheme();
  const router = useRouter();
  const { patchBooking } = useApp();
  const [tab, setTab] = useState<SegmentKey>('upcoming');

  const message = (id: string) => {
    const tutor = tutorById(id) ?? TUTORS[0]!;
    patchBooking({ tutor });
    router.push('/chat');
  };
  const bookAgain = (id: string, course?: string) => {
    const tutor = tutorById(id) ?? TUTORS[0]!;
    patchBooking({ tutor, course: course || 'MGT 300', slot: undefined, dayIndex: undefined, tag: undefined, message: '' });
    router.push('/b3');
  };
  const reschedule = (id: string) => {
    const tutor = tutorById(id) ?? TUTORS[0]!;
    patchBooking({ tutor });
    router.push('/xsr');
  };
  const openTutor = (id: string) => {
    const tutor = tutorById(id) ?? TUTORS[0]!;
    patchBooking({ tutor, course: 'MGT 300' });
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
      <TabHeader title="Sessions" />
      <View style={[styles.segments, { backgroundColor: t.bg }]}>
        {(
          [
            ['upcoming', 'Upcoming'],
            ['past', 'Past'],
            ['saved', 'Saved'],
          ] as [SegmentKey, string][]
        ).map(([v, l]) => (
          <Chip key={v} label={l} on={tab === v} onPress={() => setTab(v)} />
        ))}
      </View>
      <Body pad={20} contentStyle={{ paddingTop: 4 }}>
        {tab === 'saved' ? (
          <View style={{ gap: 10 }}>
            <Text style={[styles.count, { color: t.text3 }]}>{SAVED_IDS.length} tutors saved for later</Text>
            {SAVED_IDS.map((id) => {
              const tutor = tutorById(id) ?? TUTORS[0]!;
              return (
                <Card key={id} onPress={() => openTutor(id)} style={styles.savedRow}>
                  <Avatar size={46} />
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
                      <Badge label="✓ Verified" tone="good" />
                      <Text style={[styles.sessions, { color: t.text3 }]}>{tutor.sessions} sessions</Text>
                    </View>
                  </View>
                  <Ic name="bookmark" size={19} color={t.accent} strokeWidth={1.6} fill={t.accent} />
                </Card>
              );
            })}
          </View>
        ) : tab === 'upcoming' ? (
          <View style={{ gap: 12 }}>
            {UPCOMING.map((s, i) => {
              const tutor = tutorById(s.id) ?? TUTORS[0]!;
              const online = (s.where ?? '').startsWith('Online');
              return (
                <Card key={i} style={styles.cardNoPad}>
                  {s.soon ? (
                    <View style={[styles.soonBanner, { backgroundColor: t.accent }]}>
                      <Ic name="clock" size={13} color={t.onAccent} strokeWidth={2.2} />
                      <Text style={[styles.soonText, { color: t.onAccent }]}>Starts soon · reminder set</Text>
                    </View>
                  ) : null}
                  <View style={{ padding: 14 }}>
                    <View style={styles.upcomingHead}>
                      <Avatar size={46} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.name, { color: t.text }]}>{tutor.name}</Text>
                        <Text style={[styles.sub, { color: t.text3 }]}>{s.course}</Text>
                      </View>
                      <Badge label={tutor.name.split(' ')[0] ?? ''} tone="accentSoft" />
                    </View>
                    <View style={{ gap: 8, marginTop: 12 }}>
                      <View style={styles.metaRow}>
                        <Ic name="cal" size={15} color={t.accent} strokeWidth={1.8} />
                        <Text style={[styles.metaText, { color: t.text2 }]}>{s.when}</Text>
                      </View>
                      <View style={styles.metaRow}>
                        <Ic name={online ? 'video' : 'pin'} size={15} color={t.accent} strokeWidth={1.8} />
                        <Text style={[styles.metaText, { color: t.text2 }]}>{s.where}</Text>
                      </View>
                    </View>
                    <View style={styles.btnRow}>
                      <Button label="Message" kind="secondary" size="sm" iconRight="chat" style={{ flex: 1 }} onPress={() => message(s.id)} />
                      <Button label="Reschedule" kind="tint" size="sm" style={{ flex: 1 }} onPress={() => reschedule(s.id)} />
                    </View>
                  </View>
                </Card>
              );
            })}
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {PAST.map((s, i) => {
              const tutor = tutorById(s.id) ?? TUTORS[0]!;
              return (
                <Card key={i} style={{ padding: 14 }}>
                  <View style={styles.pastHead}>
                    <Avatar size={44} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.nameSm, { color: t.text }]}>{tutor.name}</Text>
                      <Text style={[styles.sub, { color: t.text3 }]}>
                        {s.course} · {s.when}
                      </Text>
                    </View>
                    {s.rated ? (
                      <Badge label="✓ Rated" tone="neutral" />
                    ) : (
                      <Button label="Rate" kind="primary" size="sm" onPress={() => router.push('/c1')} />
                    )}
                  </View>
                  <View style={styles.btnRow}>
                    <Button label="Message" kind="secondary" size="sm" iconRight="chat" style={{ flex: 1 }} onPress={() => message(s.id)} />
                    <Button label="Book again" kind="tint" size="sm" iconRight="plus" style={{ flex: 1 }} onPress={() => bookAgain(s.id, s.course)} />
                  </View>
                </Card>
              );
            })}
          </View>
        )}
      </Body>
      <TabBar active="sessions" onTab={onTab} role="student" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexShrink: 0, paddingHorizontal: 20, paddingBottom: 8 },
  headerTitle: { fontSize: 30 },
  segments: { flexShrink: 0, flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 12 },
  count: { fontSize: 13, marginBottom: 2 },
  cardNoPad: { padding: 0, overflow: 'hidden' },
  soonBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 6 },
  soonText: { fontSize: 12, fontWeight: '700' },
  upcomingHead: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  metaText: { fontSize: 13 },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  pastHead: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  savedRow: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 12 },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  name: { fontSize: 16, fontWeight: '600' },
  nameSm: { fontSize: 15, fontWeight: '600' },
  rate: { fontSize: 15, fontWeight: '700' },
  rateUnit: { fontSize: 11, fontWeight: '500' },
  sub: { fontSize: 13, marginTop: 1 },
  tagsRow: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 8 },
  sessions: { marginLeft: 'auto', fontSize: 12 },
});
