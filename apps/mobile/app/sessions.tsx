// S5 My Sessions — ported from screens-tabs.jsx (SessionsTab). Upcoming / Past / Saved
// segmented tabs. Upcoming, Past and Saved all read live via @noot/core
// because the backend has no past-sessions endpoint (see TODO(api) below).
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Alert, Pressable, type ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Screen, Body, Card, Avatar, Badge, Chip, Button, Ic, H1, TabBar, EmptyState, Skeleton, useTheme } from '@noot/ui';
import { useTabNav } from '../lib/useTabNav';
import { usePullToRefresh } from '../lib/usePullToRefresh';
import { api } from '@noot/core';
import type { Booking } from '@noot/core';
import { useApp } from '../lib/store';
import { toTutor, type Tutor } from '../lib/data';
import { VerifiedBadge } from '../lib/VerifiedBadge';
import { formatSessionTime } from '../lib/formatSessionTime';

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
  }, [reloadKey]);
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
      .listPast()
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
  }, [reloadKey]);

  // Navigation into the mutation flows below is unchanged (read-only pass); each carries
  // the resolved tutor into the target screen via the local booking store.
  const message = (tutor: Tutor | null) => {
    patchBooking({ tutor: tutor ?? undefined });
    router.push('/chat');
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
        patchBooking({ tutor: tutor ?? undefined });
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
      });
      router.push('/xsc');
    } catch (e) {
      Alert.alert('Something went wrong', 'Could not open cancel. Please try again.');
    }
  };
  const reportNoShow = (tutor: Tutor | null, bookingId?: string) => {
    try {
      if (!bookingId) {
        patchBooking({ tutor: tutor ?? undefined });
        router.push('/xns');
        return;
      }
      patchBooking({ tutor: tutor ?? undefined, bookingId });
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
      <Body ref={scrollRef} onRefresh={onRefresh} pad={20} contentStyle={{ paddingTop: 4 }}>
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
          <View style={{ gap: 10 }}>
            <Text style={[styles.count, { color: t.text3 }]}>{saved.length} tutors saved for later</Text>
            {saved.map((tutor) => {
              return (
                <Card key={tutor.id} onPress={() => openTutor(tutor)} style={styles.savedRow}>
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
                      <VerifiedBadge verified={tutor.verified} />
                      <Text style={[styles.sessions, { color: t.text3 }]}>{tutor.sessions} sessions</Text>
                    </View>
                  </View>
                  {/* Its own Pressable, and hitSlop'd, so it doesn't just open the profile. */}
                  <Pressable
                    onPress={() => unsaveTutor(tutor.id)}
                    hitSlop={10}
                    accessibilityLabel={`Remove ${tutor.name} from saved tutors`}
                  >
                    <Ic name="bookmark" size={19} color={t.accent} strokeWidth={1.6} fill={t.accent} />
                  </Pressable>
                </Card>
              );
            })}
          </View>
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
          <View style={{ gap: 12 }}>
            {upcoming.map(({ booking: b, tutor }) => {
              const tutorName = tutor?.name ?? 'Your tutor';
              const when = formatSessionTime(b.scheduledAt);
              const where = formatWhere(b);
              const online = b.sessionType === 'video';
              const hasProposal = !!b.rescheduleProposedAt && !!b.rescheduleProposedBy;
              const fromTutor = hasProposal && b.rescheduleProposedBy === b.tutorId;
              const fromStudent = hasProposal && b.rescheduleProposedBy === b.studentId;
              // "Starts soon" if the session begins within the next hour.
              const soon = b.status === 'confirmed' && new Date(b.scheduledAt).getTime() - Date.now() < 3_600_000;
              return (
                <Card key={b.id} style={styles.cardNoPad}>
                  {soon ? (
                    <View style={[styles.soonBanner, { backgroundColor: t.accent }]}>
                      <Ic name="clock" size={13} color={t.onAccent} strokeWidth={2.2} />
                      <Text style={[styles.soonText, { color: t.onAccent }]}>Starts soon · reminder set</Text>
                    </View>
                  ) : null}
                  <View style={{ padding: 14 }}>
                    <View style={styles.upcomingHead}>
                      <Avatar size={46} />
                      <View style={{ flex: 1 }}>
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
                        <View style={styles.btnRow}>
                          <Button label="Message" kind="secondary" size="sm" iconRight="chat" style={{ flex: 1 }} onPress={() => message(tutor)} />
                          <Button label="Cancel request" kind="tint" size="sm" style={{ flex: 1 }} onPress={() => cancelSession(tutor, b.id, b.scheduledAt)} />
                        </View>
                      </>
                    ) : (
                      <>
                        <View style={styles.btnRow}>
                          <Button label="Message" kind="secondary" size="sm" iconRight="chat" style={{ flex: 1 }} onPress={() => message(tutor)} />
                          <Button
                            label={fromTutor ? 'Review new time' : fromStudent ? 'Request sent' : 'Reschedule'}
                            kind="tint"
                            size="sm"
                            style={{ flex: 1 }}
                            disabled={fromStudent}
                            onPress={() => reschedule(tutor, b)}
                          />
                        </View>
                        <View style={styles.linkRow}>
                          <Text onPress={() => cancelSession(tutor, b.id, b.scheduledAt)} style={[styles.link, { color: t.text3 }]}>Cancel session</Text>
                          <Text style={[styles.link, { color: t.text3 }]}>·</Text>
                          <Text onPress={() => reportNoShow(tutor, b.id)} style={[styles.link, { color: t.text3 }]}>Report a no-show</Text>
                        </View>
                      </>
                    )}
                  </View>
                </Card>
              );
            })}
          </View>
          )
        ) : pastLoading ? (
          <View style={{ gap: 12 }}>
            <Skeleton height={90} radius={16} />
            <Skeleton height={90} radius={16} />
          </View>
        ) : past.length === 0 ? (
          <EmptyState icon="list" title="No past sessions yet" subtitle="Your completed sessions will appear here." />
        ) : (
          <View style={{ gap: 12 }}>
            {past.map(({ booking: b, tutor }) => {
              return (
                <Card key={b.id} style={{ padding: 14 }}>
                  <View style={styles.pastHead}>
                    <Avatar size={44} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.nameSm, { color: t.text }]}>{tutor?.name ?? 'Your tutor'}</Text>
                      <Text style={[styles.sub, { color: t.text3 }]}>
                        {b.subject} · {formatSessionTime(b.scheduledAt)}
                      </Text>
                      {b.cancelReason ? (
                        <Badge
                          label={b.cancelReason === 'tutor_declined' ? 'Declined' : 'Expired, not accepted'}
                          tone="neutral"
                        />
                      ) : null}
                    </View>
                    <Button label="Message" kind="secondary" size="sm" iconRight="chat" onPress={() => message(tutor)} />
                  </View>
                </Card>
              );
            })}
          </View>
        )}
      </Body>
      <TabBar active={active} onTab={onTab} role={role} />
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
  linkRow: { flexDirection: 'row', gap: 10, marginTop: 10, justifyContent: 'center' },
  link: { fontSize: 12, fontWeight: '600' },
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
