// TH Tutor Home (Dashboard) — ported from screens-home.jsx (TutorHome).
// Lightweight dashboard: next session + payout countdown, weekly stats, quick
// management actions. Tab root (tutor Home tab).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, Alert, StyleSheet, type ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Body, BandHeader, TabBar, Card, Avatar, Ic, H2, Button, ViewingAs, useTheme, useLargeText, AdaptiveRow, ListSection, ListRow, CountPill, type IconName } from '@noot/ui';
import { api, type Booking } from '@noot/core';
import { useApp } from '../lib/store';
import { draftFromBooking } from '../lib/bookingDraft';
import { useMe, firstName } from '../lib/useMe';
import { useTabNav } from '../lib/useTabNav';
import { usePullToRefresh } from '../lib/usePullToRefresh';
import { AdminShortcut } from '../lib/AdminShortcut';
import { NotificationBell } from '../lib/NotificationBell';
import { TutorStatusBanner } from '../lib/TutorStatusBanner';
import { formatSessionTime } from '../lib/formatSessionTime';
import { countdownLabel } from '../lib/countdownLabel';
import { useSessionClock } from '../lib/useSessionClock';

const ACTIONS: [IconName, string, string][] = [
  ['cal', 'Availability', 'edit_availability'],
  ['dollar', 'Rates', 'edit_rates'],
  ['user', 'Tutor profile', 'edit_tutor'],
];

export default function TutorHome() {
  const now = useSessionClock();
  const { reloadKey, onRefresh } = usePullToRefresh();
  const t = useTheme();
  const large = useLargeText();
  const router = useRouter();
  const { role, patchBooking } = useApp();
  const { me, tutorStatus } = useMe();
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
    return () => { active = false; };
  }, [reloadKey, now]);

  useEffect(() => {
    let active = true;
    api.resolveParticipantNames().then((n) => { if (active) setNames(n); }).catch(() => {});
    return () => { active = false; };
  }, [reloadKey]);

  // Countdown to the real session when we have one.
  const target = useMemo(() => (next ? new Date(next.scheduledAt).getTime() : Date.now()), [next]);
  const endsAt = next ? target + next.durationMinutes * 60_000 : undefined;
  const inProgress = next != null && target <= now && now < (endsAt ?? target);
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

  const showRoleContext = multiRole || previewing;

  return (
    <View style={[styles.root, { backgroundColor: t.bg }]}>
      <Body
        ref={scrollRef}
        onRefresh={onRefresh}
        refreshTint={t.onBand}
        contentStyle={styles.bodyContent}
        header={
          <BandHeader
            title="Home"
            subtitle={new Date(now).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            overlap={56}
            trailing={
              <View style={styles.headerActions}>
                <AdminShortcut color={t.onBand} ringColor={t.band} />
                <NotificationBell color={t.onBand} ringColor={t.band} />
              </View>
            }
          />
        }
      >
        {next ? (
          <Card raised style={[styles.nextCard, { marginTop: -56 }]}>
            <View style={styles.nextContent}>
              <Text style={[styles.nextLabel, { color: t.text2 }]}>{inProgress ? 'Session in progress' : 'Next session'}</Text>
              <AdaptiveRow style={styles.nextTutorRow}>
                <Avatar size={44} label={studentName.charAt(0) || 'S'} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.nextName, { color: t.text }]}>{studentName}</Text>
                  <Text style={[styles.nextMeta, { color: t.text2 }]}>{next.subject} · {formatSessionTime(next.scheduledAt)}</Text>
                </View>
                <View style={{ alignItems: large ? 'flex-start' : 'flex-end' }}>
                  <Text style={[styles.payout, { color: t.text }]}>${next.tutorPayoutAmount.toFixed(2)}</Text>
                  <Text style={[styles.payoutLabel, { color: t.text3 }]}>payout</Text>
                </View>
              </AdaptiveRow>
              <View style={styles.sessionMetaLine}>
                <Ic name="clock" size={15} color={t.accent} strokeWidth={1.8} />
                <Text style={[styles.countdown, { color: t.accent }]}>{countdownLabel(target, endsAt, now)}</Text>
                {next.location ? (
                  <>
                    <Ic name="pin" size={15} color={t.text2} strokeWidth={1.8} />
                    <Text style={[styles.location, { color: t.text2 }]}>{next.location}</Text>
                  </>
                ) : null}
              </View>
              <AdaptiveRow style={[styles.nextActions, { borderTopColor: t.border }]}>
                <Pressable onPress={openChat} accessibilityRole="button" accessibilityLabel="Message student" style={styles.nextAction}>
                  <Text style={[styles.nextActionLabel, { color: t.accent }]}>Message</Text>
                </Pressable>
                <Pressable
                  onPress={openNextDetail}
                  accessibilityRole="button"
                  accessibilityLabel="Session details"
                  style={[styles.nextAction, large ? { borderTopWidth: 1, borderTopColor: t.border } : { borderLeftWidth: 1, borderLeftColor: t.border }]}
                >
                  <Text style={[styles.nextActionLabel, { color: t.accent }]}>Details</Text>
                </Pressable>
              </AdaptiveRow>
            </View>
          </Card>
        ) : (
          <Card raised style={[styles.nextCard, { marginTop: -56 }]}>
            <View style={styles.emptyCard}>
              <Text style={[styles.nextLabel, { color: t.text2 }]}>No upcoming sessions</Text>
              <Text style={[styles.emptyTitle, { color: t.text }]}>You&apos;re all caught up</Text>
              <Text style={[styles.nextMeta, { color: t.text2 }]}>Open your availability so students can book you.</Text>
              <Pressable onPress={() => router.push('/edit_availability')} accessibilityRole="button" style={styles.emptyAvailability}>
                <Text style={[styles.nextActionLabel, { color: t.accent }]}>Set availability</Text>
              </Pressable>
            </View>
          </Card>
        )}

        {previewing ? <TutorStatusBanner status={tutorStatus} onApply={() => router.push('/t1')} /> : null}
        {showRoleContext ? <ViewingAs role="tutor" preview={previewing} /> : null}
        {tutorStatus === 'pending' ? (
          <View style={[styles.reviewBadge, { backgroundColor: t.accentWeak, borderColor: t.accentBorder }]}>
            <Text style={[styles.reviewBadgeText, { color: t.accent }]}>In review</Text>
          </View>
        ) : null}

        {requests.length ? (
          <View style={styles.section}>
            <View style={styles.sectionHeading}>
              <H2 style={styles.sectionTitle}>Requests</H2>
              <CountPill count={requests.length} />
            </View>
            <ListSection>
              {requests.map((request) => {
                const name = names[request.studentId];
                const requestName = name ? `${name.firstName} ${name.lastName}`.trim() : 'Student';
                return (
                  <View key={request.id} style={[styles.requestRow, { borderBottomColor: t.border }]}>
                    <Text style={[styles.requestName, { color: t.text }]}>{requestName}</Text>
                    <Text style={[styles.requestMeta, { color: t.text2 }]}>
                      {request.subject} · {formatSessionTime(request.scheduledAt)}
                    </Text>
                    <Text style={[styles.requestReplyBy, { color: t.text3 }]}>
                      Reply by {formatSessionTime(request.acceptBy ?? request.scheduledAt)}
                    </Text>
                    <AdaptiveRow style={styles.requestActions}>
                      <Button label={busyRequest === request.id ? 'Accepting…' : 'Accept'} kind="primary" size="sm" disabled={!!busyRequest} onPress={() => void acceptRequest(request)} />
                      <Button label="Decline" kind="secondary" size="sm" disabled={!!busyRequest} onPress={() => declineRequest(request)} />
                    </AdaptiveRow>
                  </View>
                );
              })}
            </ListSection>
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <H2 style={styles.sectionTitle}>This week</H2>
            <Pressable onPress={openEarnings} accessibilityRole="button">
              <Text style={[styles.earningsLink, { color: t.accent }]}>Earnings</Text>
            </Pressable>
          </View>
          <ListSection>
            <AdaptiveRow style={styles.weekStats}>
              <View style={styles.weekStat}>
                <Text style={[styles.weekNumber, { color: t.text }]}>{stats ? `$${Math.round(stats.earnedThisWeek)}` : '—'}</Text>
                <Text style={[styles.weekLabel, { color: t.text2 }]}>earned</Text>
              </View>
              <View style={[styles.weekStat, large ? { borderTopWidth: 1, borderTopColor: t.border } : { borderLeftWidth: 1, borderLeftColor: t.border }]}>
                <Text style={[styles.weekNumber, { color: t.text }]}>{stats ? String(stats.sessionsTaught) : '—'}</Text>
                <Text style={[styles.weekLabel, { color: t.text2 }]}>sessions taught</Text>
              </View>
            </AdaptiveRow>
          </ListSection>
        </View>

        <View style={styles.section}>
          <H2 style={styles.sectionTitle}>Manage</H2>
          <ListSection>
            {ACTIONS.map(([icon, label, key]) => (
              <ListRow key={label} size="regular" icon={icon} title={label} onPress={() => router.push(`/${key}`)} />
            ))}
          </ListSection>
        </View>
      </Body>

      <TabBar active={active} onTab={onTab} role={role} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bodyContent: { paddingTop: 12, paddingBottom: 20, gap: 18 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reviewBadge: { alignSelf: 'flex-start', borderRadius: 999, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 5 },
  reviewBadgeText: { fontSize: 12, fontWeight: '600' },
  nextCard: { padding: 0, overflow: 'hidden' },
  nextContent: { padding: 16 },
  emptyCard: { padding: 16, gap: 8 },
  nextLabel: { fontSize: 13 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyAvailability: { minHeight: 46, justifyContent: 'center' },
  nextTutorRow: { alignItems: 'center', gap: 10, marginVertical: 12 },
  nextName: { fontSize: 17, fontWeight: '600' },
  nextMeta: { fontSize: 13, marginTop: 2 },
  payout: { fontSize: 17, fontWeight: '700' },
  payoutLabel: { fontSize: 12 },
  sessionMetaLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  countdown: { fontSize: 13, fontWeight: '600', marginRight: 6 },
  location: { fontSize: 13 },
  nextActions: { marginTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
  nextAction: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  nextActionLabel: { fontSize: 15, fontWeight: '600' },
  section: { gap: 10 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 20 },
  requestRow: { padding: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  requestName: { fontSize: 16, fontWeight: '600' },
  requestMeta: { fontSize: 13, marginTop: 3 },
  requestReplyBy: { fontSize: 13, marginTop: 2 },
  requestActions: { gap: 8, marginTop: 12, justifyContent: 'flex-start' },
  weekStats: { minHeight: 70, alignItems: 'stretch' },
  weekStat: { flex: 1, padding: 14, gap: 2 },
  weekNumber: { fontSize: 24, fontWeight: '700' },
  weekLabel: { fontSize: 13 },
  earningsLink: { fontSize: 14, fontWeight: '600' },
});
