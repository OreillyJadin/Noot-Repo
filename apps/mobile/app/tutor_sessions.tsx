// TS Tutor Sessions — ported from screens-home.jsx (TutorSessions). Upcoming/Past
// segmented list of a tutor's sessions. Tab root (tutor Sessions tab).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView as HorizontalScrollView, View, Text, Pressable, Alert, StyleSheet, type ScrollView } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, Body, BandHeader, TabBar, Button, Badge, Avatar, Ic, EmptyState, Skeleton, AdaptiveRow, ListSection, useTheme, TEXT_CAPS } from '@noot/ui';
import { api, tutorEarnedAmount, sessionPhase, canReportNoShow } from '@noot/core';
import type { Booking } from '@noot/core';
import { useApp } from '../lib/store';
import { draftFromBooking } from '../lib/bookingDraft';
import { toTutor } from '../lib/data';
import { formatSessionTime } from '../lib/formatSessionTime';
import { useTabNav } from '../lib/useTabNav';
import { usePullToRefresh } from '../lib/usePullToRefresh';
import { canRateBooking, isRatedBooking, type RatedLookup } from '../lib/rating';
import { useSessionClock } from '../lib/useSessionClock';
import { JoinVideoButton } from '../lib/JoinVideoButton';
import { confirmAction } from '../lib/confirm';

type Tab = 'upcoming' | 'past';

interface SessionRow { id: string; name: string; av: string; course: string; when: string; where: string; pay: string; status: string; booking: Booking; }

export default function TutorSessions() {
  const now = useSessionClock();
  const { reloadKey, onRefresh } = usePullToRefresh();
  const t = useTheme();
  const router = useRouter();
  const { role, patchBooking } = useApp();
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(tabParam === 'past' ? 'past' : 'upcoming');

  // Upcoming includes requests and confirmed future sessions; Past = listPast (includes past-but-confirmed
  // sessions the tutor still needs to "Mark complete" → capture payment + payout).
  const [upcoming, setUpcoming] = useState<SessionRow[]>([]);
  const [past, setPast] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [ratedLookup, setRatedLookup] = useState<RatedLookup | null>(null);
  useEffect(() => {
    let active = true;
    const toRow = (b: import('@noot/core').Booking, names: Record<string, { firstName: string; lastName: string }>): SessionRow => {
      const nm = names[b.studentId];
      const name = (nm ? `${nm.firstName} ${nm.lastName}`.trim() : '') || 'Student';
      return {
        id: b.id,
        booking: b,
        name,
        av: name.charAt(0) || 'S',
        course: b.subject,
        when: formatSessionTime(b.scheduledAt),
        where: b.sessionType === 'video' ? 'Virtual' : b.location ?? 'In person',
        pay: `$${tutorEarnedAmount(b).toFixed(2)}`,
        status: b.status,
      };
    };
    // Resolve real student names via the edge function (RLS blocks a tutor reading a
    // student row directly). Falls back to "Student" if it's unavailable.
    Promise.all([
      api.listUpcoming('tutor'),
      api.listPast('tutor').catch(() => []),
      api.resolveParticipantNames().catch(() => ({} as Record<string, { firstName: string; lastName: string }>)),
    ])
      .then(([up, pastRows, names]) => {
        if (!active) return;
        setUpcoming(up.map((b) => toRow(b, names)));
        setPast(pastRows.map((b) => toRow(b, names)));
      })
      .catch(() => { /* no session / offline → empty state */ })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reloadKey, now]);

  const completedBookingKey = past.filter((r) => r.booking.status === 'completed').map((r) => r.id).sort().join(',');
  useFocusEffect(useCallback(() => {
    let active = true;
    setRatedLookup(null);
    const bookingIds = completedBookingKey ? completedBookingKey.split(',') : [];
    api.reviews
      .listRatedBookingIds(bookingIds)
      .then((ids) => {
        if (active) setRatedLookup({ checked: new Set(bookingIds), rated: new Set(ids) });
      })
      .catch(() => { if (active) setRatedLookup(null); });
    return () => { active = false; };
  }, [completedBookingKey, reloadKey]));

  const scrollRef = useRef<ScrollView>(null);
  const { active, onTab } = useTabNav({ scrollRef, onReselect: () => setTab('upcoming') });
  // Carry the tapped session into the draft tb2 and the chat read (B2) — it used to open
  // whatever draft was left in the store.
  const openDetail = (r: SessionRow) => {
    patchBooking(draftFromBooking(r.booking));
    router.push('/tb2');
  };

  const rate = (r: SessionRow) => {
    patchBooking(draftFromBooking(r.booking));
    router.push('/c3');
  };

  const reportNoShow = async (r: SessionRow) => {
    if (busyId || !canReportNoShow(r.booking, now)) return;
    setBusyId(r.id);
    try {
      const me = await api.getMe();
      const tutor = me ? await api.tutors.getById(me.id) : null;
      if (!tutor) throw new Error('Tutor profile not found. Please try again.');
      patchBooking({ ...draftFromBooking(r.booking), tutor: toTutor(tutor) });
      router.push('/xns');
    } catch (e) {
      Alert.alert('Could not open no-show report', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const acceptRequest = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    try {
      await api.bookings.respond({ bookingId: id, action: 'accept' });
      const acceptedAt = new Date().toISOString();
      const row = upcoming.find((r) => r.id === id);
      setUpcoming((rows) => rows.map((r) => r.id === id
        ? { ...r, status: 'confirmed', booking: { ...r.booking, status: 'confirmed', acceptedAt } }
        : r));
      // Accept creates the conversation, so the tutor can message the student now.
      if (row) {
        patchBooking(draftFromBooking({ ...row.booking, status: 'confirmed', acceptedAt }));
        router.push('/chat_tutor');
      }
    } catch (e) {
      Alert.alert('Could not accept request', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const declineRequest = (r: SessionRow) => {
    patchBooking(draftFromBooking(r.booking));
    router.push('/xbr');
  };

  // Tutor marks a past confirmed session complete → capture payment + transfer payout.
  const markComplete = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    try {
      const result = await api.bookings.complete(id);
      setPast((rows) => rows.map((r) => (r.id === id
        ? { ...r, booking: { ...r.booking, completionClaimedAt: new Date().toISOString() } }
        : r)));
      Alert.alert(
        'Completion submitted',
        result.objectBy
          ? 'The student has 24 hours to object. Payment will be processed after that window.'
          : 'The session was completed.',
      );
    } catch (e) {
      Alert.alert('Could not complete', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const contestNoShow = (booking: Booking) => {
    if (busyId) return;
    confirmAction({
      title: 'Were you at the session?',
      message: 'Contesting this no-show claim sends it to the noot team for review.',
      cancelText: 'Not now',
      confirmText: 'I was there',
      onConfirm: () => {
        setBusyId(booking.id);
        void api.bookings.contestClaim({ bookingId: booking.id, kind: 'no_show' })
          .then((result) => setPast((rows) => rows.map((r) => {
            if (r.id !== booking.id) return r;
            const contestedAt = new Date().toISOString();
            if (result.status === 'no_show') {
              return { ...r, status: 'no_show', booking: { ...r.booking, status: 'no_show', noShowContestedAt: contestedAt } };
            }
            return { ...r, booking: { ...r.booking, disputeStatus: 'flagged', noShowContestedAt: contestedAt } };
          })))
          .catch((error) => Alert.alert('Could not submit', error instanceof Error ? error.message : 'Please try again.'))
          .finally(() => setBusyId(null));
      },
    });
  };

  return (
    <Screen>
      <Body
        ref={scrollRef}
        onRefresh={onRefresh}
        refreshTint={t.onBand}
        pad={20}
        header={<BandHeader title="Sessions" />}
      >
        <HorizontalScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          accessibilityRole="tablist"
          style={styles.segmentsViewport}
          contentContainerStyle={styles.segments}
        >
          {(['upcoming', 'past'] as const).map((value) => {
            const on = tab === value;
            return (
              <Pressable
                key={value}
                onPress={() => setTab(value)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                style={[styles.segmentPill, { backgroundColor: on ? t.accentWeak : 'transparent' }]}
              >
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                  maxFontSizeMultiplier={TEXT_CAPS.label}
                  style={[styles.segmentLabel, { color: on ? t.accent : t.text2, fontWeight: on ? '600' : '400' }]}
                >
                  {value === 'upcoming' ? 'Upcoming' : 'Past'}
                </Text>
              </Pressable>
            );
          })}
        </HorizontalScrollView>
        {tab === 'upcoming' ? (
          loading ? (
            <View style={{ gap: 10 }}>
              <Skeleton height={92} radius={16} />
              <Skeleton height={92} radius={16} />
            </View>
          ) : upcoming.length === 0 ? (
            <EmptyState icon="cal" title="No upcoming sessions" subtitle="Sessions students book with you will show up here." />
          ) : (
            <ListSection label="Upcoming sessions">
              {upcoming.map((r) => (
                <View key={r.id} style={styles.sessionRow}>
                  <Pressable
                    disabled={r.status !== 'confirmed'}
                    onPress={() => openDetail(r)}
                    accessibilityRole={r.status === 'confirmed' ? 'button' : undefined}
                    accessibilityLabel={r.status === 'confirmed' ? `${r.name}, ${r.course}, ${r.when}. View session details` : undefined}
                    style={({ pressed }) => [styles.sessionContent, { backgroundColor: pressed ? t.surface2 : 'transparent' }]}
                  >
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
                        {sessionPhase(r.booking, now) === 'active' ? <Badge label="Session in progress" tone="good" /> : null}
                        {r.status === 'pending' ? (
                          <>
                            <Text style={[styles.meta, { color: t.accent, fontWeight: '600' }]}>
                              New request · respond by {formatSessionTime(r.booking.acceptBy ?? r.booking.scheduledAt)}
                            </Text>
                            {r.booking.requestNote ? (
                              <Text numberOfLines={3} style={[styles.meta, { color: t.text2, marginTop: 4 }]}>
                                “{r.booking.requestNote}”
                              </Text>
                            ) : null}
                          </>
                        ) : null}
                        <View style={styles.whereRow}>
                          <Ic name={r.booking.sessionType === 'video' ? 'video' : 'pin'} size={13} color={t.accent} strokeWidth={1.8} />
                          <Text style={[styles.whereText, { color: t.text2 }]}>{r.where}</Text>
                        </View>
                      </View>
                    </View>
                  </Pressable>
                  {r.booking.sessionType === 'video' ? <JoinVideoButton bookingId={r.id} /> : null}
                  {r.status === 'pending' ? (
                    <AdaptiveRow style={styles.requestActions}>
                      <Button
                        label={busyId === r.id ? 'Accepting…' : 'Accept'}
                        kind="primary"
                        size="sm"
                        style={{ flex: 1 }}
                        disabled={!!busyId}
                        onPress={() => void acceptRequest(r.id)}
                      />
                      <Button
                        label="Decline"
                        kind="secondary"
                        size="sm"
                        style={{ flex: 1 }}
                        disabled={!!busyId}
                        onPress={() => declineRequest(r)}
                      />
                    </AdaptiveRow>
                  ) : null}
                </View>
              ))}
            </ListSection>
          )
        ) : loading ? (
          <View style={{ gap: 10 }}>
            <Skeleton height={92} radius={16} />
            <Skeleton height={92} radius={16} />
          </View>
        ) : past.length === 0 ? (
          <EmptyState icon="list" title="No past sessions yet" subtitle="Your completed sessions will appear here." />
        ) : (
          <ListSection label="Past sessions">
            {past.map((r) => {
              const done = r.status === 'completed';
              const needsComplete = r.status === 'confirmed'
                && !r.booking.completionClaimedAt && !r.booking.noShowClaimedAt;
              return (
                <View key={r.id} style={styles.pastRow}>
                  <View style={styles.upcomingRow}>
                    <Avatar size={44} label={r.av} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={styles.rowBetween}>
                        <Text style={[styles.name, { color: t.text }]}>{r.name}</Text>
                        <Text style={[styles.pastPay, { color: done ? t.good : t.text2 }]}>{r.pay}</Text>
                      </View>
                      <Text style={[styles.meta, { color: t.text3 }]}>
                        {r.course} · {r.when}
                      </Text>
                    </View>
                  </View>
                  {r.booking.sessionType === 'video' && r.status === 'confirmed' ? <JoinVideoButton bookingId={r.id} /> : null}
                  {needsComplete ? (
                    <Button
                      label={busyId === r.id ? 'Submitting…' : 'Mark session complete'}
                      kind="primary"
                      size="md"
                      full
                      disabled={!!busyId}
                      onPress={() => markComplete(r.id)}
                      style={{ marginTop: 12 }}
                    />
                  ) : r.booking.noShowClaimedAt && r.status === 'confirmed' ? (
                    <View style={{ marginTop: 10, alignSelf: 'flex-start' }}>
                      <Badge label="No-show claim pending" tone="neutral" />
                    </View>
                  ) : r.booking.completionClaimedAt && r.status === 'confirmed' ? (
                    <View style={{ marginTop: 10, alignSelf: 'flex-start' }}>
                      <Badge label="Awaiting student response" tone="neutral" />
                    </View>
                  ) : (
                    <View style={{ marginTop: 10, alignSelf: 'flex-start' }}>
                      <Badge
                        label={
                          done ? 'Completed · paid out'
                            : r.status === 'no_show' ? 'No-show'
                              : r.booking.cancelReason === 'tutor_declined' ? 'Declined'
                                : r.booking.cancelReason === 'tutor_no_response' ? 'Expired, not accepted'
                                  : r.status === 'cancelled' && r.booking.cancelledByRole === 'tutor' ? 'You cancelled'
                                    : r.status === 'cancelled' && r.booking.cancelledByRole === 'student' ? 'Student cancelled'
                                      : 'Cancelled'
                        }
                        tone={done ? 'good' : 'neutral'}
                      />
                    </View>
                  )}
                  {r.booking.disputeStatus === 'flagged' ? (
                    <View style={{ marginTop: 10, alignSelf: 'flex-start' }}>
                      <Badge label="Under review" tone="neutral" />
                    </View>
                  ) : null}
                  {r.booking.noShowClaimParty === 'tutor' && r.booking.noShowClaimedAt
                    && !r.booking.noShowContestedAt && r.booking.disputeStatus !== 'flagged' ? (
                    <View style={{ marginTop: 10 }}>
                      <Text style={{ color: t.text2, fontSize: 13, lineHeight: 19 }}>
                        You were reported as a no-show. Contest within 24 hours if you were there.
                      </Text>
                      <Button label={busyId === r.id ? 'Submitting…' : 'I was there'} kind="tint" size="md" full
                        disabled={!!busyId} onPress={() => contestNoShow(r.booking)} style={{ marginTop: 8 }} />
                    </View>
                  ) : null}
                  {r.booking.noShowClaimParty === 'student' && r.booking.noShowClaimedAt
                    && !r.booking.noShowContestedAt && r.booking.disputeStatus !== 'flagged' ? (
                    <Text style={{ marginTop: 10, color: t.text2, fontSize: 13, lineHeight: 19 }}>
                      You reported a no-show. The other person has 24 hours to respond.
                    </Text>
                  ) : null}
                  {!r.booking.noShowClaimedAt && r.booking.disputeStatus === 'none' && canReportNoShow(r.booking, now) ? (
                    <Button label="Report a student no-show" kind="tint" size="md" full
                      disabled={!!busyId} onPress={() => void reportNoShow(r)} style={{ marginTop: 12 }} />
                  ) : null}
                  {canRateBooking(r.booking, ratedLookup) ? (
                    <Button
                      label="Rate student"
                      kind="secondary"
                      size="md"
                      full
                      disabled={!!busyId}
                      onPress={() => rate(r)}
                      style={{ marginTop: 12 }}
                    />
                  ) : isRatedBooking(r.booking, ratedLookup) ? (
                    <View style={{ marginTop: 10, alignSelf: 'flex-start' }}>
                      <Badge label="Rated" tone="neutral" />
                    </View>
                  ) : null}
                </View>
              );
            })}
          </ListSection>
        )}
      </Body>

      <TabBar active={active} onTab={onTab} role={role} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  segmentsViewport: { flexGrow: 0, marginHorizontal: -20 },
  segments: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingVertical: 2 },
  segmentPill: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  segmentLabel: { fontSize: 14 },
  rowBetween: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 10, alignItems: 'baseline', justifyContent: 'space-between' },

  sessionRow: { paddingVertical: 4 },
  sessionContent: { paddingHorizontal: 14, paddingVertical: 10 },
  requestActions: { gap: 8, marginTop: 10, marginHorizontal: 14, paddingBottom: 14 },
  upcomingRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  name: { fontSize: 16, fontWeight: '600', flexShrink: 1 },
  pay: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 13, marginTop: 2 },
  whereRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  whereText: { fontSize: 12.5 },

  pastRow: { padding: 14 },
  pastPay: { fontSize: 15, fontWeight: '700' },
});
