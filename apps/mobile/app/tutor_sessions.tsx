// TS Tutor Sessions — ported from screens-home.jsx (TutorSessions). Upcoming/Past
// segmented list of a tutor's sessions. Tab root (tutor Sessions tab).
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Body, TabBar, Card, Avatar, Ic, H2, useTheme } from '@noot/ui';
import { useApp } from '../lib/store';
import { tutorById } from '../lib/data';

type Tab = 'upcoming' | 'past';

const UPCOMING: [string, string, string, string, string, string][] = [
  ['Lindsay Thomas', 'L', 'MGT 300', 'Tomorrow · 3:00 PM', 'Gorgas Library, Fl 2', '$28'],
  ['Marcus B.', 'M', 'MGT 300', 'Thu Jun 25 · 10:30 AM', 'Online — Integrated Video', '$28'],
];

const PAST: [string, string, string, string, string][] = [
  ['Priya S.', 'P', 'CH 101', 'Jun 12 · 2:00 PM', '$25'],
  ['Jordan K.', 'J', 'CH 102', 'Jun 5 · 4:30 PM', '$30'],
];

export default function TutorSessions() {
  const t = useTheme();
  const router = useRouter();
  const { patchBooking } = useApp();
  const [tab, setTab] = useState<Tab>('upcoming');

  const goTab = (key: string) => router.replace((`/${key}`) as any);
  const openDetail = () => {
    patchBooking({ tutor: tutorById('sara') });
    router.push('/tb2');
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: t.bg }]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <H2 style={{ fontSize: 22 }}>Your sessions</H2>
          <Text style={{ fontSize: 18 }}>🦎</Text>
        </View>
        <View style={[styles.segment, { backgroundColor: t.surface2 }]}>
          {(['upcoming', 'past'] as const).map((v) => {
            const on = tab === v;
            return (
              <Pressable
                key={v}
                onPress={() => setTab(v)}
                style={[styles.segmentItem, on && { backgroundColor: t.surface }]}
              >
                <Text style={[styles.segmentLabel, { color: on ? t.text : t.text3, fontWeight: on ? '700' : '600' }]}>
                  {v === 'upcoming' ? 'Upcoming' : 'Past'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Body contentStyle={{ paddingTop: 14 }}>
        {tab === 'upcoming' ? (
          <View style={{ gap: 10 }}>
            {UPCOMING.map(([n, av, course, when, where, pay], i) => (
              <Card key={i} onPress={openDetail} style={{ padding: 14 }}>
                <View style={styles.upcomingRow}>
                  <Avatar size={44} label={av} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.rowBetween}>
                      <Text style={[styles.name, { color: t.text }]}>{n}</Text>
                      <Text style={[styles.pay, { color: t.good }]}>{pay}</Text>
                    </View>
                    <Text style={[styles.meta, { color: t.text3 }]}>
                      {course} · {when}
                    </Text>
                    <View style={styles.whereRow}>
                      <Ic name={where.startsWith('Online') ? 'video' : 'pin'} size={13} color={t.accent} strokeWidth={1.8} />
                      <Text style={[styles.whereText, { color: t.text2 }]}>{where}</Text>
                    </View>
                  </View>
                </View>
              </Card>
            ))}
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {PAST.map(([n, av, course, when, pay], i) => (
              <Card key={i} style={styles.pastRow}>
                <Avatar size={44} label={av} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.name, { color: t.text }]}>{n}</Text>
                  <Text style={[styles.meta, { color: t.text3 }]}>
                    {course} · {when}
                  </Text>
                </View>
                <Text style={[styles.pastPay, { color: t.text2 }]}>{pay}</Text>
              </Card>
            ))}
          </View>
        )}
      </Body>

      <TabBar active="tutor_sessions" onTab={goTab} role="tutor" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  segment: { flexDirection: 'row', gap: 6, padding: 4, borderRadius: 13, marginTop: 14, marginBottom: 4 },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 11 },
  segmentLabel: { fontSize: 14 },
  rowBetween: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },

  upcomingRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  name: { fontSize: 16, fontWeight: '600' },
  pay: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 13, marginTop: 2 },
  whereRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  whereText: { fontSize: 12.5 },

  pastRow: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14 },
  pastPay: { fontSize: 15, fontWeight: '700' },
});
