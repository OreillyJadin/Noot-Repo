// TH Tutor Home (Dashboard) — ported from screens-home.jsx (TutorHome).
// Lightweight dashboard: next session + payout countdown, weekly stats, quick
// management actions, recent message. Tab root (tutor Home tab).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, Alert, StyleSheet, type ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Body, TabBar, Wordmark, Card, Badge, Avatar, Ic, H2, Eyebrow, Skeleton, ViewingAs, useTheme, type IconName } from '@noot/ui';
import { api, type Booking, type Message } from '@noot/core';
import { useApp } from '../lib/store';
import { useMe, firstName } from '../lib/useMe';
import { useTabNav } from '../lib/useTabNav';
import { GeckoLogo } from '../lib/GeckoLogo';
import { NotificationBell } from '../lib/NotificationBell';

// Chat-list preview. An attachment-only message has content '' — describe it rather than
// rendering a blank row.
function messagePreview(m: Message | null | undefined): string {
  if (!m) return 'Start the conversation';
  if (m.content) return m.content;
  if (m.attachmentCount > 0) return `📎 ${m.attachmentCount} attachment${m.attachmentCount > 1 ? 's' : ''}`;
  return 'Start the conversation';
}

/** Booking scheduledAt (+ optional location) → "Tomorrow · 3:00 PM · Gorgas Library". */
function sessionMeta(iso: string, location: string | null): string {
  const d = new Date(iso);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round((startOf(d) - startOf(now)) / 86400000);
  const dayLabel =
    dayDiff === 0 ? 'Today' : dayDiff === 1 ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return [dayLabel, time, location].filter(Boolean).join(' · ');
}

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
  const { role } = useApp();
  const { me, loading } = useMe();
  const multiRole = (me?.roles ?? []).filter((r) => r === 'student' || r === 'tutor' || r === 'ambassador').length > 1;

  // Next confirmed, future session (as tutor OR student) from the live API.
  const [next, setNext] = useState<Booking | null>(null);
  // Live dashboard numbers + counterparty names + most-recent conversation.
  const [stats, setStats] = useState<{ sessionsTaught: number; earnedThisWeek: number } | null>(null);
  const [names, setNames] = useState<Record<string, { firstName: string; lastName: string }>>({});
  const [recent, setRecent] = useState<{ name: string; preview: string } | null>(null);
  useEffect(() => {
    let active = true;
    api.listUpcoming().then((list) => { if (active) setNext(list[0] ?? null); }).catch(() => {});
    api.tutorStats().then((s) => { if (active) setStats(s); }).catch(() => {});
    api.resolveParticipantNames().then((n) => { if (active) setNames(n); }).catch(() => {});
    api.chat
      .listConversations()
      .then((cs) => {
        if (!active) return;
        const c = cs[0];
        if (c) {
          const nm = `${c.counterpart.firstName} ${c.counterpart.lastName}`.trim() || 'Student';
          setRecent({ name: nm, preview: messagePreview(c.lastMessage) });
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // Countdown to the real session when we have one.
  const target = useMemo(() => (next ? new Date(next.scheduledAt).getTime() : Date.now()), [next]);
  const studentName = next && names[next.studentId]
    ? `${names[next.studentId]!.firstName} ${names[next.studentId]!.lastName}`.trim() || 'Your student'
    : 'Your student';

  const scrollRef = useRef<ScrollView>(null);
  const { active, onTab } = useTabNav({ scrollRef });
  const openChat = () => {
    router.push('/chat_tutor');
  };
  const openEarnings = () =>
    Alert.alert('Earnings', stats ? `You've earned $${stats.earnedThisWeek.toFixed(2)} this week.` : 'Loading…');

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: t.bg }]}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Wordmark size={22} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Badge label="✓ Verified" tone="good" />
            <NotificationBell />
          </View>
        </View>
        <View style={styles.welcomeRow}>
          <View>
            <Text style={[styles.welcomeLabel, { color: t.text3 }]}>Tutor dashboard</Text>
            {loading ? <Skeleton width={150} height={26} /> : <H2 style={{ fontSize: 24 }}>Hey, {firstName(me, 'there')}</H2>}
          </View>
          <GeckoLogo size={40} />
        </View>
        {multiRole ? (
          <View style={{ marginTop: 10 }}>
            <ViewingAs role="tutor" />
          </View>
        ) : null}
      </View>

      <Body ref={scrollRef} contentStyle={{ paddingTop: 8 }}>
        {/* Next session + payout — real upcoming booking, or a CTA when there's none */}
        {next ? (
          <View style={[styles.nextCard, { backgroundColor: t.accent }]}>
            <GeckoLogo style={styles.geckoDeco} />
            <View style={styles.rowBetween}>
              <Text style={[styles.nextEyebrow, { color: t.onAccent }]}>YOUR NEXT SESSION</Text>
              <Badge label={next.subject} tone="ink" />
            </View>
            <View style={styles.nextTutorRow}>
              <Avatar size={40} label={studentName.charAt(0) || 'S'} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.nextName, { color: t.onAccent }]}>{studentName}</Text>
                <Text style={[styles.nextMeta, { color: t.onAccent }]}>
                  {sessionMeta(next.scheduledAt, next.location)}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.payout, { color: t.onAccent }]}>${next.tutorPayoutAmount}</Text>
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
        ) : (
          <View style={[styles.nextCard, { backgroundColor: t.accent }]}>
            <GeckoLogo style={styles.geckoDeco} />
            <Text style={[styles.nextEyebrow, { color: t.onAccent }]}>NO UPCOMING SESSIONS</Text>
            <Text style={[styles.nextName, { color: t.onAccent, marginTop: 8 }]}>You&apos;re all caught up</Text>
            <Text style={[styles.nextMeta, { color: t.onAccent }]}>
              Open your availability so students can book you.
            </Text>
            <View style={[styles.nextActions, { marginTop: 12 }]}>
              <Pressable onPress={() => router.push('/edit_availability')} style={[styles.nextBtn, { backgroundColor: t.surface }]}>
                <Text style={[styles.nextBtnLabel, { color: t.accent, fontWeight: '700' }]}>Set availability</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* This week stats */}
        <View style={styles.sectionHead}>
          <H2 style={{ fontSize: 17 }}>This week</H2>
          <Text onPress={openEarnings} style={[styles.earningsLink, { color: t.accent }]}>
            Earnings →
          </Text>
        </View>
        <View style={styles.statsRow}>
          <StatCard icon="dollar" big={stats ? `$${Math.round(stats.earnedThisWeek)}` : '—'} label="Earned this week" />
          <StatCard icon="cap" big={stats ? String(stats.sessionsTaught) : '—'} label="Sessions taught" />
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

        {/* Recent message — live from the tutor's most recent conversation */}
        {recent ? (
          <>
            <Eyebrow style={{ marginTop: 8 }}>Recent message</Eyebrow>
            <Card onPress={openChat} style={styles.msgRow}>
              <Avatar size={40} label={recent.name.charAt(0) || 'S'} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.msgName, { color: t.text }]}>{recent.name}</Text>
                <Text numberOfLines={1} style={[styles.msgPreview, { color: t.text3 }]}>
                  {recent.preview}
                </Text>
              </View>
              <Ic name="chevR" size={17} color={t.text3} strokeWidth={2} />
            </Card>
          </>
        ) : null}
      </Body>

      <TabBar active={active} onTab={onTab} role={role} />
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
  geckoDeco: { position: 'absolute', right: -10, bottom: -18, width: 100, height: 100, opacity: 0.16, transform: [{ rotate: '10deg' }] },
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
