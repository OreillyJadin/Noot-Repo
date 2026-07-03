// TH Tutor Home (Dashboard) — ported from screens-home.jsx (TutorHome).
// Lightweight dashboard: next session + payout countdown, weekly stats, quick
// management actions, recent message. Tab root (tutor Home tab).
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Body, TabBar, Wordmark, Card, Badge, Avatar, Ic, H2, Eyebrow, useTheme, type IconName } from '@noot/ui';
import { useApp } from '../lib/store';
import { tutorById } from '../lib/data';

function useCountdown(target: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  let ms = Math.max(0, target - now);
  const d = Math.floor(ms / 86400000);
  ms -= d * 86400000;
  const h = Math.floor(ms / 3600000);
  ms -= h * 3600000;
  const m = Math.floor(ms / 60000);
  return { d, h, m };
}

function CountdownPills({ target }: { target: number }) {
  const t = useTheme();
  const { d, h, m } = useCountdown(target);
  const parts: [number, string][] = [
    [d, 'days'],
    [h, 'hrs'],
    [m, 'min'],
  ];
  return (
    <View style={styles.pillsRow}>
      {parts.map(([v, l]) => (
        <View key={l} style={styles.pill}>
          <Text style={[styles.pillValue, { color: t.onAccent }]}>{String(v).padStart(2, '0')}</Text>
          <Text style={[styles.pillLabel, { color: t.onAccent }]}>{l.toUpperCase()}</Text>
        </View>
      ))}
    </View>
  );
}

function StatCard({ icon, big, label }: { icon: IconName; big: string; label: string }) {
  const t = useTheme();
  return (
    <View style={[styles.statCard, { backgroundColor: t.surface, borderColor: t.border }]}>
      <View style={[styles.statIcon, { backgroundColor: t.accentWeak }]}>
        <Ic name={icon} size={16} color={t.accent} strokeWidth={1.9} />
      </View>
      <Text style={[styles.statBig, { color: t.text }]}>{big}</Text>
      <Text style={[styles.statLabel, { color: t.text3 }]}>{label}</Text>
    </View>
  );
}

const ACTIONS: [IconName, string, string][] = [
  ['cal', 'Set your availability', 'edit_availability'],
  ['dollar', 'Adjust your rates', 'edit_rates'],
  ['user', 'Edit tutor profile', 'edit_tutor'],
];

export default function TutorHome() {
  const t = useTheme();
  const router = useRouter();
  const { patchBooking } = useApp();

  const target = useMemo(() => Date.now() + 20 * 3600000, []);

  const goTab = (key: string) => router.replace((`/${key}`) as any);
  const openChat = () => {
    patchBooking({ tutor: tutorById('sara') });
    router.push('/chat_tutor');
  };
  const openEarnings = () => Alert.alert('Earnings history', 'Coming soon — built with backend'); // TODO(api)

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: t.bg }]}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Wordmark size={22} />
          <Badge label="✓ Verified" tone="good" />
        </View>
        <View style={styles.welcomeRow}>
          <View>
            <Text style={[styles.welcomeLabel, { color: t.text3 }]}>Tutor dashboard</Text>
            <H2 style={{ fontSize: 24 }}>Hey, Lindsay</H2>
          </View>
          <Text style={{ fontSize: 40 }}>🦎</Text>
        </View>
      </View>

      <Body contentStyle={{ paddingTop: 8 }}>
        {/* Next session + payout */}
        <View style={[styles.nextCard, { backgroundColor: t.accent }]}>
          <Text style={styles.geckoDeco}>🦎</Text>
          <View style={styles.rowBetween}>
            <Text style={[styles.nextEyebrow, { color: t.onAccent }]}>YOUR NEXT SESSION</Text>
            <Badge label="MGT 300" tone="ink" />
          </View>
          <View style={styles.nextTutorRow}>
            <Avatar size={40} label="L" />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.nextName, { color: t.onAccent }]}>Lindsay Thomas</Text>
              <Text style={[styles.nextMeta, { color: t.onAccent }]}>Tomorrow · 3:00 PM · Gorgas Library</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.payout, { color: t.onAccent }]}>$28</Text>
              <Text style={[styles.payoutLabel, { color: t.onAccent }]}>payout</Text>
            </View>
          </View>
          <CountdownPills target={target} />
          <View style={styles.nextActions}>
            <Pressable onPress={openChat} style={[styles.nextBtn, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
              <Ic name="chat" size={15} color={t.onAccent} strokeWidth={1.9} />
              <Text style={[styles.nextBtnLabel, { color: t.onAccent }]}>Message</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/tb2')} style={[styles.nextBtn, { backgroundColor: t.surface }]}>
              <Text style={[styles.nextBtnLabel, { color: t.accent, fontWeight: '700' }]}>Details</Text>
            </Pressable>
          </View>
        </View>

        {/* This week stats */}
        <View style={styles.sectionHead}>
          <H2 style={{ fontSize: 17 }}>This week</H2>
          <Text onPress={openEarnings} style={[styles.earningsLink, { color: t.accent }]}>
            Earnings →
          </Text>
        </View>
        <View style={styles.statsRow}>
          <StatCard icon="dollar" big="$182" label="Earned this week" />
          <StatCard icon="cap" big="6" label="Sessions taught" />
          <StatCard icon="flame" big="4.9" label="Avg rating (noot)" />
        </View>

        {/* Quick actions */}
        <Eyebrow style={{ marginTop: 8 }}>Manage</Eyebrow>
        <View style={{ gap: 8 }}>
          {ACTIONS.map(([icon, label, key]) => (
            <Card key={label} onPress={() => router.push((`/${key}`) as any)} style={styles.actionRow}>
              <View style={[styles.actionIcon, { backgroundColor: t.accentWeak }]}>
                <Ic name={icon} size={17} color={t.accent} strokeWidth={1.8} />
              </View>
              <Text style={[styles.actionLabel, { color: t.text }]}>{label}</Text>
              <Ic name="chevR" size={17} color={t.text3} strokeWidth={2} />
            </Card>
          ))}
        </View>

        {/* Recent message */}
        <Eyebrow style={{ marginTop: 8 }}>Recent message</Eyebrow>
        <Card onPress={openChat} style={styles.msgRow}>
          <Avatar size={40} label="L" />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.msgName, { color: t.text }]}>Lindsay Thomas</Text>
            <Text numberOfLines={1} style={[styles.msgPreview, { color: t.text3 }]}>
              That session was super helpful, thank you!
            </Text>
          </View>
          <Ic name="chevR" size={17} color={t.text3} strokeWidth={2} />
        </Card>
      </Body>

      <TabBar active="tutor_home" onTab={goTab} role="tutor" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  welcomeRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  welcomeLabel: { fontSize: 13 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  nextCard: { position: 'relative', overflow: 'hidden', borderRadius: 20, padding: 16, marginBottom: 4 },
  geckoDeco: { position: 'absolute', right: -10, bottom: -18, fontSize: 100, opacity: 0.16, transform: [{ rotate: '10deg' }] },
  nextEyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1, opacity: 0.9 },
  nextTutorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 12 },
  nextName: { fontSize: 16, fontWeight: '700' },
  nextMeta: { fontSize: 12.5, opacity: 0.85, marginTop: 1 },
  payout: { fontSize: 18, fontWeight: '800' },
  payoutLabel: { fontSize: 10, opacity: 0.8 },
  nextActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  nextBtn: { flex: 1, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  nextBtnLabel: { fontSize: 14, fontWeight: '600' },

  pillsRow: { flexDirection: 'row', gap: 8 },
  pill: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.16)' },
  pillValue: { fontWeight: '800', fontSize: 22, lineHeight: 24 },
  pillLabel: { fontSize: 10, opacity: 0.85, marginTop: 3, letterSpacing: 0.6 },

  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 },
  earningsLink: { fontSize: 12.5, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, padding: 12, borderRadius: 16, borderWidth: 1 },
  statIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statBig: { fontWeight: '800', fontSize: 20, lineHeight: 22 },
  statLabel: { fontSize: 11.5, marginTop: 3, lineHeight: 15 },

  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  actionIcon: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { flex: 1, fontSize: 15 },

  msgRow: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14 },
  msgName: { fontSize: 15, fontWeight: '600' },
  msgPreview: { fontSize: 13, marginTop: 2 },
});
