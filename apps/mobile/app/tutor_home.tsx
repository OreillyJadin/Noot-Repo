// TH Tutor Home (Dashboard) — ported from screens-home.jsx (TutorHome).
// Lightweight dashboard: next session + payout countdown, weekly stats, quick
// management actions. Tab root (tutor Home tab).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, Alert, StyleSheet, type ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Body, TabBar, Wordmark, Card, Badge, Avatar, Ic, H2, Eyebrow, Button, Skeleton, ViewingAs, PreviewBanner, useTheme, useLargeText, AdaptiveRow, TEXT_CAPS, type IconName } from '@noot/ui';
import { api, type Booking } from '@noot/core';
import { useApp } from '../lib/store';
import { draftFromBooking } from '../lib/bookingDraft';
import { useMe, firstName } from '../lib/useMe';
import { useTabNav } from '../lib/useTabNav';
import { usePullToRefresh } from '../lib/usePullToRefresh';
import { GeckoLogo } from '../lib/GeckoLogo';
import { AdminShortcut } from '../lib/AdminShortcut';
import { NotificationBell } from '../lib/NotificationBell';
import { TutorStatusBanner } from '../lib/TutorStatusBanner';
import { formatSessionTime } from '../lib/formatSessionTime';
import { CountdownPills } from '../lib/CountdownPills';

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
  const { reloadKey, onRefresh } = usePullToRefresh();
  const t = useTheme();
  const large = useLargeText();
  const router = useRouter();
  const { role, patchBooking } = useApp();
  const { me, loading, tutorStatus, gradesVerified } = useMe();
  const multiRole = (me?.roles ?? []).filter((r) => r === 'student' || r === 'tutor' || r === 'ambassador').length > 1;
  // Reachable before approval (via the switcher, or straight off T10). Branch on the
  // APPLICATION state, not the role: the tutor role only lands when an admin approves, so a
  // role check would keep saying "preview" to someone who is already a verified tutor.
  const previewing = tutorStatus !== 'approved';

  // Next confirmed session and pending requests from the live API.
  const [next, setNext] = useState<Booking | null>(null);
  const [requests, setRequests] = useState<Booking[]>([]);
  const [busyRequest, setBusyRequest] = useState<string | null>(null);
  // Live dashboard numbers + counterparty names.
  const [stats, setStats] = useState<{ sessionsTaught: number; earnedThisWeek: number } | null>(null);
  const [names, setNames] = useState<Record<string, { firstName: string; lastName: string }>>({});
  useEffect(() => {
    let active = true;
    api.listUpcoming('tutor').then((list) => {
      if (!active) return;
      setNext(list.find((booking) => booking.status === 'confirmed') ?? null);
      setRequests(list.filter((booking) => booking.status === 'pending'));
    }).catch(() => {});
    api.tutorStats().then((s) => { if (active) setStats(s); }).catch(() => {});
    api.resolveParticipantNames().then((n) => { if (active) setNames(n); }).catch(() => {});
    return () => { active = false; };
  }, [reloadKey]);

  // Countdown to the real session when we have one.
  const target = useMemo(() => (next ? new Date(next.scheduledAt).getTime() : Date.now()), [next]);
  const studentName = next && names[next.studentId]
    ? `${names[next.studentId]!.firstName} ${names[next.studentId]!.lastName}`.trim() || 'Your student'
    : 'Your student';

  const scrollRef = useRef<ScrollView>(null);
  const { active, onTab } = useTabNav({ scrollRef });
  // Both open the NEXT session, so the draft carries it (B2) — without it the chat had no
  // student to open and session details had nothing to show.
  const openChat = () => {
    if (next) patchBooking(draftFromBooking(next));
    router.push('/chat_tutor');
  };
  const openNextDetail = () => {
    if (next) patchBooking(draftFromBooking(next));
    router.push('/tb2');
  };
  const acceptRequest = async (request: Booking) => {
    if (busyRequest) return;
    setBusyRequest(request.id);
    try {
      await api.bookings.respond({ bookingId: request.id, action: 'accept' });
      setRequests((rows) => rows.filter((row) => row.id !== request.id));
      const accepted: Booking = { ...request, status: 'confirmed', acceptedAt: new Date().toISOString() };
      setNext((current) =>
        !current || new Date(accepted.scheduledAt).getTime() < new Date(current.scheduledAt).getTime()
          ? accepted
          : current,
      );
      // Accept creates the conversation, so the tutor can message the student now.
      patchBooking(draftFromBooking(accepted));
      router.push('/chat_tutor');
    } catch (e) {
      Alert.alert('Could not accept request', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusyRequest(null);
    }
  };
  const declineRequest = (request: Booking) => {
    patchBooking(draftFromBooking(request));
    router.push('/xbr');
  };
  const openEarnings = () =>
    Alert.alert('Earnings', stats ? `You've earned $${stats.earnedThisWeek.toFixed(2)} this week.` : 'Loading…');

  // At large text the header scrolls with the content instead of pinning half the screen.
  const header = (
    <View style={[styles.header, large && styles.headerInline]}>
      <View style={styles.headerTop}>
        <Wordmark size={22} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {/* Verified = grades checked by an admin (T6), not merely approved. */}
          {tutorStatus === 'approved' && gradesVerified ? <Badge label="✓ Verified" tone="good" /> : null}
          {tutorStatus === 'pending' ? <Badge label="In review" tone="accentSoft" /> : null}
          <AdminShortcut />
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
      {multiRole || previewing ? (
        <View style={{ marginTop: 10 }}>
          <ViewingAs role="tutor" preview={previewing} />
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: t.bg }]}>
      {large ? null : header}

      <Body ref={scrollRef} onRefresh={onRefresh} contentStyle={{ paddingTop: 8 }}>
        {large ? header : null}
        {previewing ? <TutorStatusBanner status={tutorStatus} onApply={() => router.push('/t1')} /> : null}

        {/* Next session + payout — real upcoming booking, or a CTA when there's none */}
        {next ? (
          <View style={[styles.nextCard, { backgroundColor: t.accent }]}>
            <GeckoLogo style={styles.geckoDeco} />
            <View style={styles.rowBetween}>
              <Text style={[styles.nextEyebrow, { color: t.onAccent }]}>YOUR NEXT SESSION</Text>
              <Badge label={next.subject} tone="ink" />
            </View>
            <AdaptiveRow style={styles.nextTutorRow}>
              <Avatar size={40} label={studentName.charAt(0) || 'S'} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.nextName, { color: t.onAccent }]}>{studentName}</Text>
                <Text style={[styles.nextMeta, { color: t.onAccent }]}>
                  {sessionMeta(next.scheduledAt, next.location)}
                </Text>
              </View>
              <View style={{ alignItems: large ? 'flex-start' : 'flex-end' }}>
                <Text style={[styles.payout, { color: t.onAccent }]}>${next.tutorPayoutAmount.toFixed(2)}</Text>
                <Text style={[styles.payoutLabel, { color: t.onAccent }]}>payout</Text>
              </View>
            </AdaptiveRow>
            <CountdownPills target={target} />
            <AdaptiveRow style={styles.nextActions}>
              <Pressable onPress={openChat} style={[styles.nextBtn, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
                <Ic name="chat" size={15} color={t.onAccent} strokeWidth={1.9} />
                <Text style={[styles.nextBtnLabel, { color: t.onAccent }]}>Message</Text>
              </Pressable>
              <Pressable onPress={openNextDetail} style={[styles.nextBtn, { backgroundColor: t.surface }]}>
                <Text style={[styles.nextBtnLabel, { color: t.accent, fontWeight: '700' }]}>Details</Text>
              </Pressable>
            </AdaptiveRow>
          </View>
        ) : (
          <View style={[styles.nextCard, { backgroundColor: t.accent }]}>
            <GeckoLogo style={styles.geckoDeco} />
            <Text style={[styles.nextEyebrow, { color: t.onAccent }]}>NO UPCOMING SESSIONS</Text>
            <Text style={[styles.nextName, { color: t.onAccent, marginTop: 8 }]}>You&apos;re all caught up</Text>
            <Text style={[styles.nextMeta, { color: t.onAccent }]}>
              Open your availability so students can book you.
            </Text>
            <AdaptiveRow style={[styles.nextActions, { marginTop: 12 }]}>
              <Pressable onPress={() => router.push('/edit_availability')} style={[styles.nextBtn, { backgroundColor: t.surface }]}>
                <Text style={[styles.nextBtnLabel, { color: t.accent, fontWeight: '700' }]}>Set availability</Text>
              </Pressable>
            </AdaptiveRow>
          </View>
        )}

        {requests.length ? (
          <View style={{ marginTop: 18, gap: 10 }}>
            <View style={styles.sectionHead}>
              <H2 style={{ fontSize: 17 }}>Session requests</H2>
              <Text style={{ color: t.text3 }}>{requests.length}</Text>
            </View>
            {requests.map((request) => {
              const name = names[request.studentId];
              const requestName = name ? `${name.firstName} ${name.lastName}`.trim() : 'Student';
              return (
                <Card key={request.id} style={{ padding: 14 }}>
                  <Text style={{ color: t.text, fontSize: 15, fontWeight: '700' }}>{requestName} · {request.subject}</Text>
                  <Text style={{ color: t.accent, fontSize: 13, marginTop: 4 }}>
                    New request · respond by {formatSessionTime(request.acceptBy ?? request.scheduledAt)}
                  </Text>
                  <AdaptiveRow style={{ gap: 8, marginTop: 12 }}>
                    <Button label={busyRequest === request.id ? 'Accepting…' : 'Accept'} kind="primary" size="sm" style={{ flex: 1 }} disabled={!!busyRequest} onPress={() => void acceptRequest(request)} />
                    <Button label="Decline" kind="secondary" size="sm" style={{ flex: 1 }} disabled={!!busyRequest} onPress={() => declineRequest(request)} />
                  </AdaptiveRow>
                </Card>
              );
            })}
          </View>
        ) : null}

        {/* This week stats */}
        <View style={styles.sectionHead}>
          <H2 style={{ fontSize: 17 }}>This week</H2>
          <Text onPress={openEarnings} style={[styles.earningsLink, { color: t.accent }]}>
            Earnings →
          </Text>
        </View>
        <AdaptiveRow style={styles.statsRow}>
          <StatCard icon="dollar" big={stats ? `$${Math.round(stats.earnedThisWeek)}` : '—'} label="Earned this week" />
          <StatCard icon="cap" big={stats ? String(stats.sessionsTaught) : '—'} label="Sessions taught" />
        </AdaptiveRow>

        {/* Quick actions */}
        <Eyebrow style={{ marginTop: 8 }}>Manage</Eyebrow>
        <View style={{ gap: 8 }}>
          {ACTIONS.map(([icon, label, key]) => (
            <Card key={label} onPress={() => router.push(`/${key}`)} style={styles.actionRow}>
              <View style={[styles.actionIcon, { backgroundColor: t.accentWeak }]}>
                <Ic name={icon} size={17} color={t.accent} strokeWidth={1.8} />
              </View>
              <Text maxFontSizeMultiplier={TEXT_CAPS.label} style={[styles.actionLabel, { color: t.text }]}>{label}</Text>
              <Ic name="chevR" size={17} color={t.text3} strokeWidth={2} />
            </Card>
          ))}
        </View>

      </Body>

      <TabBar active={active} onTab={onTab} role={role} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 },
  headerInline: { paddingHorizontal: 0, paddingTop: 0 },
  headerTop: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  welcomeRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  welcomeLabel: { fontSize: 13 },
  rowBetween: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' },

  nextCard: { position: 'relative', overflow: 'hidden', borderRadius: 20, padding: 16, marginBottom: 4 },
  geckoDeco: { position: 'absolute', right: -10, bottom: -18, width: 100, height: 100, opacity: 0.16, transform: [{ rotate: '10deg' }] },
  nextEyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1, opacity: 0.9 },
  nextTutorRow: { alignItems: 'center', gap: 10, marginVertical: 12 },
  nextName: { fontSize: 16, fontWeight: '700' },
  nextMeta: { fontSize: 12.5, opacity: 0.85, marginTop: 1 },
  payout: { fontSize: 18, fontWeight: '800' },
  payoutLabel: { fontSize: 10, opacity: 0.8 },
  nextActions: { gap: 8, marginTop: 12 },
  nextBtn: { flex: 1, minHeight: 40, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  nextBtnLabel: { fontSize: 14, fontWeight: '600' },

  sectionHead: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 },
  earningsLink: { fontSize: 12.5, fontWeight: '600' },
  statsRow: { gap: 10 },
  statCard: { flex: 1, padding: 12, borderRadius: 16, borderWidth: 1 },
  statIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statBig: { fontWeight: '800', fontSize: 20, lineHeight: 22 },
  statLabel: { fontSize: 11.5, marginTop: 3, lineHeight: 15 },

  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  actionIcon: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { flex: 1, fontSize: 15 },

});
