// S5 My Sessions — ported from screens-tabs.jsx (SessionsTab). Upcoming / Past / Saved
// segmented tabs. Upcoming, Past and Saved all read live via @noot/core
// because the backend has no past-sessions endpoint (see TODO(api) below).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView as HorizontalScrollView, View, Text, StyleSheet, Alert, Pressable, type ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Screen, Body, BandHeader, Avatar, Badge, Button, AdaptiveRow, Ic, TabBar, EmptyState, Skeleton, ListSection, useTheme, TEXT_CAPS } from '@noot/ui';
import { useTabNav } from '../lib/useTabNav';
import { usePullToRefresh } from '../lib/usePullToRefresh';
import { api, sessionPhase, canReportNoShow } from '@noot/core';
import type { Booking } from '@noot/core';
import { useApp } from '../lib/store';
import { toTutor, type Tutor } from '../lib/data';
import { draftFromBooking } from '../lib/bookingDraft';
import { canRateBooking, isRatedBooking, type RatedLookup } from '../lib/rating';
import { VERIFIED_EXPLAINER } from '../lib/VerifiedBadge';
import { tutorMeta } from '../lib/tutorMeta';
import { formatSessionTime } from '../lib/formatSessionTime';
import { useSessionClock } from '../lib/useSessionClock';

type SegmentKey = 'upcoming' | 'past' | 'saved';

/** An upcoming booking joined with its resolved tutor (name/rate come from getById). */
interface UpcomingItem {
  booking: Booking;
  tutor: Tutor | null;
}

/** Where a booking happens — meeting link for video, location for in-person. */
function formatWhere(b: Booking): string {
  // "Zoom" was never true — nothing sets meeting_link, and video isn't sold at launch
  // (T14). Existing 'video' rows just read "Online".
  if (b.sessionType === 'video') return 'Online';
  return b.location ?? 'In person';
}

export default function Sessions() {
  const now = useSessionClock();
  const { reloadKey, onRefresh } = usePullToRefresh();
  const t = useTheme();
  const router = useRouter();
  const { patchBooking, role } = useApp();
  // Optional deep-link: /sessions?tab=past lands on the Past (completed) segment —
  // e.g. tapping "Sessions completed" on Home. Defaults to Upcoming.
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const initialTab: SegmentKey = tabParam === 'past' || tabParam === 'saved' ? tabParam : 'upcoming';
  const [tab, setTab] = useState<SegmentKey>(initialTab);

  // Upcoming: pending requests and confirmed future bookings, joined to their tutor.
  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([]);
  // Saved: the student's saved-tutors list.
  const [saved, setSaved] = useState<Tutor[]>([]);
  const [past, setPast] = useState<UpcomingItem[]>([]);
  const [ratedLookup, setRatedLookup] = useState<RatedLookup | null>(null);
  const [loading, setLoading] = useState(true);
  const [savedLoading, setSavedLoading] = useState(true);

  /** Remove a saved tutor. Optimistic, restoring the row if the write fails. */
  const unsaveTutor = async (tutorId: string) => {
    const previous = saved;
    setSaved((list) => list.filter((x) => x.id !== tutorId));
    try {
      await api.tutors.unsave(tutorId);
    } catch {
      setSaved(previous);
      Alert.alert('Could not remove that tutor', 'Please try again.');
    }
  };
  const [pastLoading, setPastLoading] = useState(true);
  useEffect(() => {
    let active = true;
    api
      .listUpcoming('student')
      .then(async (bookings) => {
        const items = await Promise.all(
          bookings.map(async (b) => {
            const summary = await api.tutors.getById(b.tutorId).catch(() => null);
            return { booking: b, tutor: summary ? toTutor(summary) : null } as UpcomingItem;
          }),
        );
        if (active) setUpcoming(items);
      })
      .catch(() => { /* no session / offline → empty state */ })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reloadKey, now]);
  useEffect(() => {
    let active = true;
    api.tutors
      .listSaved()
      .then((list) => { if (active) setSaved(list.map(toTutor)); })
      .catch(() => { /* no session / offline → empty state */ })
      .finally(() => { if (active) setSavedLoading(false); });
    return () => { active = false; };
  }, [reloadKey]);
  // Past: real completed/elapsed sessions, each joined to its (approved) tutor.
  useEffect(() => {
    let active = true;
    api
      .listPast('student')
      .then(async (bookings) => {
        const items = await Promise.all(
          bookings.map(async (b) => {
            const summary = await api.tutors.getById(b.tutorId).catch(() => null);
            return { booking: b, tutor: summary ? toTutor(summary) : null } as UpcomingItem;
          }),
        );
        if (active) setPast(items);
      })
      .catch(() => { /* no session / offline → empty state */ })
      .finally(() => { if (active) setPastLoading(false); });
    return () => { active = false; };
  }, [reloadKey, now]);

  const completedBookingKey = past.filter(({ booking }) => booking.status === 'completed').map(({ booking }) => booking.id).sort().join(',');
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

  // Navigation into the mutation flows below is unchanged (read-only pass); each carries
  // the resolved tutor into the target screen via the local booking store.
  const message = (tutor: Tutor | null) => {
    patchBooking({ tutor: tutor ?? undefined });
    router.push('/chat');
  };
  const rate = (tutor: Tutor, b: Booking) => {
    patchBooking({ ...draftFromBooking(b), tutor });
    router.push('/c2');
  };
  // Change/completion flows act on a real booking id. Upcoming items carry the full booking;
  // when reached without one (e.g. the dev launcher), the proposer screen keeps its demo state.
  const reschedule = (tutor: Tutor | null, b?: Booking) => {
    try {
      if (!b) {
        patchBooking({ tutor: tutor ?? undefined });
        router.push('/xtr');
        return;
      }
      patchBooking({
        tutor: tutor ?? undefined,
        bookingId: b.id,
        tutorId: b.tutorId,
        scheduledAt: b.scheduledAt,
        lengthMin: b.durationMinutes,
        rescheduleProposedAt: b.rescheduleProposedAt,
        rescheduleProposedBy: b.rescheduleProposedBy,
      });
      router.push(b.rescheduleProposedAt && b.rescheduleProposedBy === b.tutorId ? '/xsr' : '/xtr');
    } catch (e) {
      Alert.alert('Something went wrong', 'Could not open reschedule. Please try again.');
    }
  };
  const cancelSession = (tutor: Tutor | null, bookingId?: string, scheduledAt?: string) => {
    try {
      if (!bookingId) {
        patchBooking({ tutor: tutor ?? undefined, tutorPayoutAmount: undefined });
        router.push('/xsc');
        return;
      }
      const realBooking = upcoming.find((item) => item.booking.id === bookingId)?.booking;
      patchBooking({
        tutor: tutor ?? undefined,
        bookingId,
        scheduledAt,
        status: realBooking?.status,
        acceptBy: realBooking?.acceptBy,
        price: realBooking?.price,
        studentFee: realBooking?.studentFee,
        creditApplied: realBooking?.creditApplied,
        tutorPayoutAmount: realBooking?.tutorPayoutAmount,
        course: realBooking?.subject,
        lengthMin: realBooking?.durationMinutes,
      });
      router.push('/xsc');
    } catch (e) {
      Alert.alert('Something went wrong', 'Could not open cancel. Please try again.');
    }
  };
  const reportNoShow = (tutor: Tutor | null, b: Booking) => {
    try {
      patchBooking({ ...draftFromBooking(b), tutor: tutor ?? undefined });
      router.push('/xns');
    } catch (e) {
      Alert.alert('Something went wrong', 'Could not open no-show report. Please try again.');
    }
  };
  const openTutor = (tutor: Tutor, course?: string) => {
    patchBooking({ tutor, course: course || '' });
    router.push('/b2');
  };

  const scrollRef = useRef<ScrollView>(null);
  // Re-tapping Sessions returns to the Upcoming segment + scrolls to top.
  const { active, onTab } = useTabNav({ scrollRef, onReselect: () => setTab('upcoming') });

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
          {(
            [
              ['upcoming', 'Upcoming'],
              ['past', 'Past'],
              ['saved', 'Saved'],
            ] as [SegmentKey, string][]
          ).map(([value, label]) => (
            <Pressable
              key={value}
              onPress={() => setTab(value)}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === value }}
              style={[styles.segmentPill, { backgroundColor: tab === value ? t.accentWeak : 'transparent' }]}
            >
              <Text maxFontSizeMultiplier={TEXT_CAPS.label} style={[styles.segmentLabel, { color: tab === value ? t.accent : t.text2, fontWeight: tab === value ? '600' : '400' }]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </HorizontalScrollView>
        {tab === 'saved' ? (
          savedLoading ? (
            <View style={{ gap: 10 }}>
              <Skeleton height={84} radius={16} />
              <Skeleton height={84} radius={16} />
            </View>
          ) : saved.length === 0 ? (
            <EmptyState
              icon="bookmark"
              title="No saved tutors yet"
              subtitle="Tap the bookmark on any tutor to keep them here for later."
              actionLabel="Find tutors"
              onAction={() => router.replace('/student_home')}
            />
          ) : (
            <>
              <Text style={[styles.count, { color: t.text3 }]}>
                {saved.length} tutor{saved.length === 1 ? '' : 's'} saved for later
              </Text>
              <ListSection label="Saved tutors">
                {saved.map((tutor) => {
                  const meta = tutorMeta(tutor);
                  const nameDetails = [tutor.year, tutor.major].filter(Boolean).join(' · ');
                  const sessionsLabel = `${tutor.sessions} ${tutor.sessions === 1 ? 'session' : 'sessions'}`;
                  return (
                    <View key={tutor.id} style={styles.savedRow}>
                      <Pressable
                        onPress={() => openTutor(tutor)}
                        accessibilityRole="button"
                        accessibilityLabel={`${tutor.name}${meta.course ? `, ${meta.course}` : ''}${nameDetails ? `, ${nameDetails}` : ''}, ${sessionsLabel}${tutor.verified ? ', verified tutor' : ''}. $${tutor.rate} per hour`}
                        style={({ pressed }) => [styles.savedContent, { backgroundColor: pressed ? t.surface2 : 'transparent' }]}
                      >
                        <Avatar size={46} uri={tutor.avatarUrl} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={styles.rowHead}>
                            <View style={styles.nameWithCheck}>
                              <Text style={[styles.name, { color: t.text }]}>{tutor.name}</Text>
                              {tutor.verified ? (
                                <Pressable
                                  onPress={() => Alert.alert('Verified tutor', VERIFIED_EXPLAINER)}
                                  hitSlop={6}
                                  accessibilityRole="button"
                                  accessibilityLabel="Verified tutor. Tap for what this means."
                                >
                                  <Ic name="check" size={14} color={t.good} strokeWidth={2.6} />
                                </Pressable>
                              ) : null}
                            </View>
                            <Text style={[styles.rate, { color: t.text }]}>
                              ${tutor.rate}
                              <Text style={[styles.rateUnit, { color: t.text3 }]}>/hr</Text>
                            </Text>
                          </View>
                          <Text style={[styles.sub, { color: t.text2 }]}>{meta.line}</Text>
                        </View>
                      </Pressable>
                      <Pressable
                        onPress={() => unsaveTutor(tutor.id)}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${tutor.name} from saved tutors`}
                        style={styles.removeSaved}
                      >
                        <Ic name="bookmark" size={19} color={t.accent} strokeWidth={1.6} fill={t.accent} />
                      </Pressable>
                    </View>
                  );
                })}
              </ListSection>
            </>
          )
        ) : tab === 'upcoming' ? (
          loading ? (
            <View style={{ gap: 12 }}>
              <Skeleton height={150} radius={16} />
              <Skeleton height={150} radius={16} />
            </View>
          ) : upcoming.length === 0 ? (
            <EmptyState
              icon="cal"
              title="No upcoming sessions"
              subtitle="Book a tutor and your sessions will show up here."
              actionLabel="Find a tutor"
              onAction={() => router.replace('/student_home')}
            />
          ) : (
          <ListSection label="Upcoming sessions">
            {upcoming.map(({ booking: b, tutor }) => {
              const tutorName = tutor?.name ?? 'Your tutor';
              const when = formatSessionTime(b.scheduledAt);
              const where = formatWhere(b);
              const online = b.sessionType === 'video';
              const hasProposal = !!b.rescheduleProposedAt && !!b.rescheduleProposedBy;
              const fromTutor = hasProposal && b.rescheduleProposedBy === b.tutorId;
              const fromStudent = hasProposal && b.rescheduleProposedBy === b.studentId;
              const phase = sessionPhase(b, now);
              const inProgress = phase === 'active';
              const soon = phase === 'upcoming' && new Date(b.scheduledAt).getTime() - now < 3_600_000;
              return (
                <View key={b.id}>
                  {soon || inProgress ? (
                    <View style={[styles.soonBanner, { backgroundColor: t.accent }]}>
                      <Ic name="clock" size={13} color={t.onAccent} strokeWidth={2.2} />
                      <Text style={[styles.soonText, { color: t.onAccent }]}>{inProgress ? 'Session in progress' : 'Starts soon · reminder set'}</Text>
                    </View>
                  ) : null}
                  <View style={{ padding: 14 }}>
                    <View style={styles.upcomingHead}>
                      <Avatar size={46} uri={tutor?.avatarUrl} />
                      <View style={{ flex: 1, minWidth: 140 }}>
                        <Text style={[styles.name, { color: t.text }]}>{tutorName}</Text>
                        <Text style={[styles.sub, { color: t.text3 }]}>{b.subject}</Text>
                      </View>
                      <Badge label={tutorName.split(' ')[0] ?? ''} tone="accentSoft" />
                    </View>
                    <View style={{ gap: 8, marginTop: 12 }}>
                      <View style={styles.metaRow}>
                        <Ic name="cal" size={15} color={t.accent} strokeWidth={1.8} />
                        <Text style={[styles.metaText, { color: t.text2 }]}>{when}</Text>
                      </View>
                      <View style={styles.metaRow}>
                        <Ic name={online ? 'video' : 'pin'} size={15} color={t.accent} strokeWidth={1.8} />
                        <Text style={[styles.metaText, { color: t.text2 }]}>{where}</Text>
                      </View>
                    </View>
                    {b.status === 'pending' ? (
                      <>
                        <Text style={[styles.metaText, { color: t.accent, marginTop: 12, fontWeight: '600' }]}>
                          Waiting for {tutorName} to accept · by {formatSessionTime(b.acceptBy ?? b.scheduledAt)}
                        </Text>
                        <Button
                          label="Cancel request"
                          kind="tint"
                          size="sm"
                          full
                          style={{ marginTop: 12 }}
                          onPress={() => cancelSession(tutor, b.id, b.scheduledAt)}
                        />
                      </>
                    ) : (
                      <>
                        <AdaptiveRow style={styles.btnRow}>
                          <Button label="Message" kind="secondary" size="sm" iconRight="chat" style={{ flex: 1 }} onPress={() => message(tutor)} />
                          <Button
                            label={fromTutor ? 'Review new time' : fromStudent ? 'Request sent' : 'Reschedule'}
                            kind="tint"
                            size="sm"
                            style={{ flex: 1 }}
                            disabled={fromStudent || inProgress}
                            onPress={() => reschedule(tutor, b)}
                          />
                        </AdaptiveRow>
                        <View style={styles.linkRow}>
                          {phase === 'upcoming' ? (
                            <Text onPress={() => cancelSession(tutor, b.id, b.scheduledAt)} style={[styles.link, { color: t.text3 }]}>Cancel session</Text>
                          ) : (
                            <Text style={[styles.link, { color: t.text2 }]}>No-show reports open in Past after the scheduled end.</Text>
                          )}
                        </View>
                      </>
                    )}
                  </View>
                </View>
              );
            })}
          </ListSection>
          )
        ) : pastLoading ? (
          <View style={{ gap: 12 }}>
            <Skeleton height={90} radius={16} />
            <Skeleton height={90} radius={16} />
          </View>
        ) : past.length === 0 ? (
          <EmptyState icon="list" title="No past sessions yet" subtitle="Your completed sessions will appear here." />
        ) : (
          <ListSection label="Past sessions">
            {past.map(({ booking: b, tutor }) => {
              const canRate = canRateBooking(b, ratedLookup);
              return (
                <View key={b.id} style={styles.pastRow}>
                  <View style={styles.pastHead}>
                    <Avatar size={44} uri={tutor?.avatarUrl} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.nameSm, { color: t.text }]}>{tutor?.name ?? 'Your tutor'}</Text>
                      <Text style={[styles.sub, { color: t.text3 }]}>
                        {b.subject} · {formatSessionTime(b.scheduledAt)}
                      </Text>
                      <View style={styles.pastBadges}>
                        {b.cancelReason ? (
                          <Badge
                            label={b.cancelReason === 'tutor_declined' ? 'Declined' : 'Expired, not accepted'}
                            tone="neutral"
                          />
                        ) : b.status === 'cancelled' ? (
                          <Badge
                            label={
                              b.cancelledByRole === 'student'
                                ? 'You cancelled'
                                : b.cancelledByRole === 'tutor'
                                  ? 'Tutor cancelled'
                                  : 'Cancelled'
                            }
                            tone="neutral"
                          />
                        ) : null}
                        {isRatedBooking(b, ratedLookup) ? <Badge label="Rated" tone="good" /> : null}
                      </View>
                    </View>
                  </View>
                  <AdaptiveRow style={styles.btnRow}>
                    <Button label="Message" kind="secondary" size="sm" iconRight="chat" style={{ flex: 1 }} onPress={() => message(tutor)} />
                    {tutor && canRate ? (
                      <Button
                        label="Rate session"
                        kind="primary"
                        size="sm"
                        iconRight="star"
                        style={{ flex: 1 }}
                        onPress={() => rate(tutor, b)}
                      />
                    ) : null}
                  </AdaptiveRow>
                  {tutor && canReportNoShow(b, now) ? (
                    <Button label="Report a no-show" kind="tint" size="sm" full
                      style={{ marginTop: 10 }} onPress={() => reportNoShow(tutor, b)} />
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
  segmentLabel: { fontSize: 14, fontWeight: '400' },
  count: { fontSize: 13, marginBottom: 2 },
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  savedContent: { flex: 1, minWidth: 0, flexDirection: 'row', gap: 12, alignItems: 'center', padding: 12 },
  removeSaved: { paddingHorizontal: 12, paddingVertical: 14 },
  pastRow: { padding: 14 },
  soonBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 6 },
  soonText: { fontSize: 12, fontWeight: '700' },
  upcomingHead: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  metaText: { flexShrink: 1, fontSize: 13 },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  linkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10, justifyContent: 'center' },
  link: { fontSize: 12, fontWeight: '600' },
  pastHead: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  pastBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  rowHead: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, justifyContent: 'space-between', alignItems: 'baseline' },
  nameWithCheck: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  name: { fontSize: 16, fontWeight: '600' },
  nameSm: { fontSize: 15, fontWeight: '600' },
  rate: { fontSize: 15, fontWeight: '700' },
  rateUnit: { fontSize: 11, fontWeight: '500' },
  sub: { fontSize: 13, marginTop: 1 },
});
