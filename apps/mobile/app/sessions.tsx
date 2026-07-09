// S5 My Sessions — ported from screens-tabs.jsx (SessionsTab). Upcoming / Past / Saved
// segmented tabs. Upcoming + Saved read live via @noot/core; Past is still demo data
// because the backend has no past-sessions endpoint (see TODO(api) below).
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Alert, type ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Screen, Body, Card, Avatar, Badge, Chip, Button, Ic, H1, TabBar, useTheme } from '@noot/ui';
import { useTabNav } from '../lib/useTabNav';
import { api } from '@noot/core';
import type { Booking } from '@noot/core';
import { useApp } from '../lib/store';
import { TUTORS, tutorById, toTutor, type Tutor } from '../lib/data';

type SegmentKey = 'upcoming' | 'past' | 'saved';

interface DemoSession {
  id: string;
  course: string;
  when: string;
  where?: string;
  soon?: boolean;
  rated?: boolean;
}

/** An upcoming booking joined with its resolved tutor (name/rate come from getById). */
interface UpcomingItem {
  booking: Booking;
  tutor: Tutor | null;
}

// TODO(api): no past-sessions endpoint — keep demo Past data until one exists.
const PAST: DemoSession[] = [
  { id: 'maya', course: 'MGT 300', when: 'Last Tue · 4:00 PM', rated: true },
  { id: 'alex', course: 'MGT 300', when: 'Last Thu · 1:30 PM', rated: false },
];

/** Format a booking's scheduledAt into the "Today · 3:00 PM" style the card uses. */
function formatWhen(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const day = sameDay(d, today) ? 'Today' : sameDay(d, tomorrow) ? 'Tomorrow' : d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  return `${day} · ${time}`;
}

/** Where a booking happens — meeting link for video, location for in-person. */
function formatWhere(b: Booking): string {
  if (b.sessionType === 'video') return b.meetingLink ? 'Online · Zoom' : 'Online';
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
  const t = useTheme();
  const router = useRouter();
  const { patchBooking, role } = useApp();
  const [tab, setTab] = useState<SegmentKey>('upcoming');

  // Upcoming: confirmed future bookings, each joined to its tutor via getById.
  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([]);
  // Saved: the student's saved-tutors list.
  const [saved, setSaved] = useState<Tutor[]>([]);
  useEffect(() => {
    let active = true;
    api
      .listUpcoming()
      .then(async (bookings) => {
        const items = await Promise.all(
          bookings.map(async (b) => {
            const summary = await api.tutors.getById(b.tutorId).catch(() => null);
            return { booking: b, tutor: summary ? toTutor(summary) : null } as UpcomingItem;
          }),
        );
        if (active) setUpcoming(items);
      })
      .catch(() => { /* no session / offline → keep empty */ });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    api.tutors
      .listSaved()
      .then((list) => { if (active) setSaved(list.map(toTutor)); })
      .catch(() => { /* no session / offline → keep empty */ });
    return () => { active = false; };
  }, []);

  // Navigation into the mutation flows below is unchanged (read-only pass); each carries
  // the resolved tutor into the target screen via the local booking store.
  const message = (tutor: Tutor) => {
    patchBooking({ tutor });
    router.push('/chat');
  };
  const bookAgain = (tutor: Tutor, course?: string) => {
    patchBooking({ tutor, course: course || 'MGT 300', slot: undefined, dayIndex: undefined, tag: undefined, message: '' });
    router.push('/b3');
  };
  // Change/completion flows act on a real booking id. Upcoming items carry `b.id`;
  // when reached without one (e.g. the dev launcher), we keep the old local behavior so
  // nothing breaks. The X*/C* screens read booking.bookingId to run the real mutation.
  const reschedule = (tutor: Tutor, bookingId?: string) => {
    try {
      if (!bookingId) {
        // Dev launcher / no real booking — keep the current demo behavior.
        patchBooking({ tutor });
        router.push('/xsr');
        return;
      }
      patchBooking({ tutor, bookingId });
      router.push('/xsr');
    } catch (e) {
      Alert.alert('Something went wrong', 'Could not open reschedule. Please try again.');
    }
  };
  const cancelSession = (tutor: Tutor, bookingId?: string) => {
    try {
      if (!bookingId) {
        patchBooking({ tutor });
        router.push('/xsc');
        return;
      }
      patchBooking({ tutor, bookingId });
      router.push('/xsc');
    } catch (e) {
      Alert.alert('Something went wrong', 'Could not open cancel. Please try again.');
    }
  };
  const reportNoShow = (tutor: Tutor, bookingId?: string) => {
    try {
      if (!bookingId) {
        patchBooking({ tutor });
        router.push('/xns');
        return;
      }
      patchBooking({ tutor, bookingId });
      router.push('/xns');
    } catch (e) {
      Alert.alert('Something went wrong', 'Could not open no-show report. Please try again.');
    }
  };
  const rate = (tutor: Tutor, bookingId?: string) => {
    // TODO(api): Past items are demo data with no real booking id, so we can't call the
    // real rating mutation yet — Past needs real booking ids from a past-sessions
    // endpoint. Until then, keep the current local behavior of just opening /c1.
    try {
      if (!bookingId) {
        router.push('/c1');
        return;
      }
      patchBooking({ tutor, bookingId });
      router.push('/c1');
    } catch (e) {
      Alert.alert('Something went wrong', 'Could not open rating. Please try again.');
    }
  };
  const openTutor = (tutor: Tutor, course?: string) => {
    patchBooking({ tutor, course: course || 'MGT 300' });
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
      <Body ref={scrollRef} pad={20} contentStyle={{ paddingTop: 4 }}>
        {tab === 'saved' ? (
          <View style={{ gap: 10 }}>
            <Text style={[styles.count, { color: t.text3 }]}>{saved.length} tutors saved for later</Text>
            {saved.map((tutor) => {
              return (
                <Card key={tutor.id} onPress={() => openTutor(tutor)} style={styles.savedRow}>
                  {/* TODO(api): un-save handler (remove from saved tutors) — write action, not wired this pass. */}
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
                      <Badge label="✓ Verified" tone="good" />
                      <Text style={[styles.sessions, { color: t.text3 }]}>{tutor.sessions} sessions</Text>
                    </View>
                  </View>
                  <Ic name="bookmark" size={19} color={t.accent} strokeWidth={1.6} fill={t.accent} />
                </Card>
              );
            })}
          </View>
        ) : tab === 'upcoming' ? (
          <View style={{ gap: 12 }}>
            {upcoming.map(({ booking: b, tutor: joined }) => {
              const tutor = joined ?? TUTORS[0]!;
              const when = formatWhen(b.scheduledAt);
              const where = formatWhere(b);
              const online = b.sessionType === 'video';
              // "Starts soon" if the session begins within the next hour.
              const soon = new Date(b.scheduledAt).getTime() - Date.now() < 3_600_000;
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
                        <Text style={[styles.name, { color: t.text }]}>{tutor.name}</Text>
                        <Text style={[styles.sub, { color: t.text3 }]}>{b.subject}</Text>
                      </View>
                      <Badge label={tutor.name.split(' ')[0] ?? ''} tone="accentSoft" />
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
                    <View style={styles.btnRow}>
                      <Button label="Message" kind="secondary" size="sm" iconRight="chat" style={{ flex: 1 }} onPress={() => message(tutor)} />
                      <Button label="Reschedule" kind="tint" size="sm" style={{ flex: 1 }} onPress={() => reschedule(tutor, b.id)} />
                    </View>
                    <View style={styles.linkRow}>
                      <Text onPress={() => cancelSession(tutor, b.id)} style={[styles.link, { color: t.text3 }]}>Cancel session</Text>
                      <Text style={[styles.link, { color: t.text3 }]}>·</Text>
                      <Text onPress={() => reportNoShow(tutor, b.id)} style={[styles.link, { color: t.text3 }]}>Report a no-show</Text>
                    </View>
                  </View>
                </Card>
              );
            })}
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {/* TODO(api): no past-sessions endpoint — Past stays demo data (see PAST above).
                These items have no real booking id, so the Rate action can't yet run the
                real rating mutation; a past-sessions endpoint must supply real ids. */}
            {PAST.map((s, i) => {
              const tutor = tutorById(s.id) ?? TUTORS[0]!;
              return (
                <Card key={i} style={{ padding: 14 }}>
                  <View style={styles.pastHead}>
                    <Avatar size={44} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.nameSm, { color: t.text }]}>{tutor.name}</Text>
                      <Text style={[styles.sub, { color: t.text3 }]}>
                        {s.course} · {s.when}
                      </Text>
                    </View>
                    {s.rated ? (
                      <Badge label="✓ Rated" tone="neutral" />
                    ) : (
                      // TODO(api): rating submit is wired in the /c1 flow. Past items are
                      // demo with no real booking id, so rate() falls back to the local
                      // behavior until real ids exist.
                      <Button label="Rate" kind="primary" size="sm" onPress={() => rate(tutor)} />
                    )}
                  </View>
                  <View style={styles.btnRow}>
                    <Button label="Message" kind="secondary" size="sm" iconRight="chat" style={{ flex: 1 }} onPress={() => message(tutor)} />
                    <Button label="Book again" kind="tint" size="sm" iconRight="plus" style={{ flex: 1 }} onPress={() => bookAgain(tutor, s.course)} />
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
