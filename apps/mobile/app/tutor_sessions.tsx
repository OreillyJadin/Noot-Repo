// TS Tutor Sessions — ported from screens-home.jsx (TutorSessions). Upcoming/Past
// segmented list of a tutor's sessions. Tab root (tutor Sessions tab).
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, type ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Body, TabBar, Card, Avatar, Ic, H2, useTheme } from '@noot/ui';
import { api } from '@noot/core';
import { useApp } from '../lib/store';
import { tutorById } from '../lib/data';
import { useTabNav } from '../lib/useTabNav';

type Tab = 'upcoming' | 'past';

/** scheduledAt ISO → "Tomorrow · 3:00 PM" style label (matches the prototype). */
function formatWhen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startDay - startToday) / 86400000);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const label =
    dayDiff === 0 ? 'Today' : dayDiff === 1 ? 'Tomorrow' : d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  return `${label} · ${time}`;
}

interface UpRow { name: string; av: string; course: string; when: string; where: string; pay: string; }

// Demo fallback shown before data loads or when there's no session.
const UPCOMING_DEMO: UpRow[] = [
  { name: 'Lindsay Thomas', av: 'L', course: 'MGT 300', when: 'Tomorrow · 3:00 PM', where: 'Gorgas Library, Fl 2', pay: '$28' },
  { name: 'Marcus B.', av: 'M', course: 'MGT 300', when: 'Thu Jun 25 · 10:30 AM', where: 'Online — Integrated Video', pay: '$28' },
];

// TODO(api): no read endpoint for past/completed sessions — demo values.
const PAST: [string, string, string, string, string][] = [
  ['Priya S.', 'P', 'CH 101', 'Jun 12 · 2:00 PM', '$25'],
  ['Jordan K.', 'J', 'CH 102', 'Jun 5 · 4:30 PM', '$30'],
];

export default function TutorSessions() {
  const t = useTheme();
  const router = useRouter();
  const { patchBooking, role } = useApp();
  const [tab, setTab] = useState<Tab>('upcoming');

  // Upcoming: live confirmed future sessions for the signed-in tutor; demo fallback otherwise.
  const [upcoming, setUpcoming] = useState<UpRow[]>(UPCOMING_DEMO);
  useEffect(() => {
    let active = true;
    api
      .listUpcoming()
      .then((bookings) => {
        if (!active || bookings.length === 0) return; // no upcoming → keep demo fallback
        setUpcoming(
          bookings.map((b) => {
            // TODO(api): no endpoint to resolve a booking's student name from studentId.
            const name = 'Student';
            return {
              name,
              av: name.charAt(0),
              course: b.subject,
              when: formatWhen(b.scheduledAt),
              where: b.sessionType === 'video' ? 'Online — Integrated Video' : b.location ?? 'In person',
              pay: `$${b.tutorPayoutAmount}`,
            };
          }),
        );
      })
      .catch(() => { /* no session / offline → keep demo fallback */ });
    return () => { active = false; };
  }, []);

  const scrollRef = useRef<ScrollView>(null);
  const { active, onTab } = useTabNav({ scrollRef, onReselect: () => setTab('upcoming') });
  const openDetail = () => {
    // TODO(api): pass the tapped booking's real tutor/session once detail wiring lands.
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

      <Body ref={scrollRef} contentStyle={{ paddingTop: 14 }}>
        {tab === 'upcoming' ? (
          <View style={{ gap: 10 }}>
            {upcoming.map((r, i) => (
              <Card key={i} onPress={openDetail} style={{ padding: 14 }}>
                <View style={styles.upcomingRow}>
                  <Avatar size={44} label={r.av} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.rowBetween}>
                      <Text style={[styles.name, { color: t.text }]}>{r.name}</Text>
                      <Text style={[styles.pay, { color: t.good }]}>{r.pay}</Text>
                    </View>
                    <Text style={[styles.meta, { color: t.text3 }]}>
                      {r.course} · {r.when}
                    </Text>
                    <View style={styles.whereRow}>
                      <Ic name={r.where.startsWith('Online') ? 'video' : 'pin'} size={13} color={t.accent} strokeWidth={1.8} />
                      <Text style={[styles.whereText, { color: t.text2 }]}>{r.where}</Text>
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

      <TabBar active={active} onTab={onTab} role={role} />
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
