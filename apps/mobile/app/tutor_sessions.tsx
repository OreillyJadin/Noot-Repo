// TS Tutor Sessions — ported from screens-home.jsx (TutorSessions). Upcoming/Past
// segmented list of a tutor's sessions. Tab root (tutor Sessions tab).
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, type ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Body, TabBar, Card, Avatar, Ic, H2, EmptyState, Skeleton, useTheme } from '@noot/ui';
import { api } from '@noot/core';
import { useApp } from '../lib/store';
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

// Upcoming is live (api.listUpcoming, tutor side). Past has no read endpoint yet
// (Phase 5 gap) so it renders an empty state until one exists.

export default function TutorSessions() {
  const t = useTheme();
  const router = useRouter();
  const { role } = useApp();
  const [tab, setTab] = useState<Tab>('upcoming');

  // Upcoming: live confirmed future sessions for the signed-in tutor.
  const [upcoming, setUpcoming] = useState<UpRow[]>([]);
  const [past] = useState<UpRow[]>([]); // TODO(api): no past-sessions read endpoint yet (Phase 5 gap)
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    // Resolve real student names via the edge function (RLS blocks a tutor reading a
    // student row directly). Falls back to "Student" if it's unavailable.
    Promise.all([
      api.listUpcoming(),
      api.resolveParticipantNames().catch(() => ({} as Record<string, { firstName: string; lastName: string }>)),
    ])
      .then(([bookings, names]) => {
        if (!active) return;
        setUpcoming(
          bookings.map((b) => {
            const nm = names[b.studentId];
            const name = (nm ? `${nm.firstName} ${nm.lastName}`.trim() : '') || 'Student';
            return {
              name,
              av: name.charAt(0) || 'S',
              course: b.subject,
              when: formatWhen(b.scheduledAt),
              where: b.sessionType === 'video' ? 'Online — Integrated Video' : b.location ?? 'In person',
              pay: `$${b.tutorPayoutAmount}`,
            };
          }),
        );
      })
      .catch(() => { /* no session / offline → empty state */ })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const scrollRef = useRef<ScrollView>(null);
  const { active, onTab } = useTabNav({ scrollRef, onReselect: () => setTab('upcoming') });
  const openDetail = () => {
    // TODO(api): pass the tapped booking id so tb2 can load this exact session.
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
          loading ? (
            <View style={{ gap: 10 }}>
              <Skeleton height={92} radius={16} />
              <Skeleton height={92} radius={16} />
            </View>
          ) : upcoming.length === 0 ? (
            <EmptyState icon="cal" title="No upcoming sessions" subtitle="Sessions students book with you will show up here." />
          ) : (
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
          )
        ) : past.length === 0 ? (
          <EmptyState icon="list" title="No past sessions yet" subtitle="Your completed sessions will appear here." />
        ) : (
          <View style={{ gap: 10 }}>
            {past.map((r, i) => (
              <Card key={i} style={styles.pastRow}>
                <Avatar size={44} label={r.av} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.name, { color: t.text }]}>{r.name}</Text>
                  <Text style={[styles.meta, { color: t.text3 }]}>
                    {r.course} · {r.when}
                  </Text>
                </View>
                <Text style={[styles.pastPay, { color: t.text2 }]}>{r.pay}</Text>
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
