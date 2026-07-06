// S2 Student Home (For You) — ported from screens-home.jsx (StudentHomeFeed).
// Study hub: next-session countdown, exam nudge, streak/goals, "pick up where you
// left off". This is a tab root (Home tab). No live session store yet — the next
// session + weekly numbers are demo data, same as the prototype.
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Body, TabBar, Wordmark, Card, Badge, Avatar, Ic, H2, useTheme, type IconName } from '@noot/ui';
import { api } from '@noot/core';
import { useApp } from '../lib/store';
import { tutorById, toTutor, type Tutor } from '../lib/data';
import { useMe, firstName } from '../lib/useMe';

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

function TutorRow({
  name,
  meta,
  course,
  rate,
  onPress,
}: {
  name: string;
  meta: string;
  course: string;
  rate: string;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Card onPress={onPress} style={styles.tutorRow}>
      <Avatar size={46} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.rowBetween}>
          <Text style={[styles.tutorName, { color: t.text }]}>{name}</Text>
          <Text style={[styles.tutorRate, { color: t.text }]}>
            {rate}
            <Text style={{ fontSize: 11, color: t.text3, fontWeight: '500' }}>/hr</Text>
          </Text>
        </View>
        <Text style={[styles.tutorMeta, { color: t.text3 }]}>{meta}</Text>
        <View style={styles.tutorBadges}>
          <Badge label={course} tone="accentSoft" />
          <Badge label="Verified" tone="good" />
          <Text style={[styles.tutorSessions, { color: t.text3 }]}>— sessions</Text>
        </View>
      </View>
    </Card>
  );
}

const POP: [string, string, string, string, string][] = [
  ['Sara W.', 'sara', 'Senior · Management', 'MGT 300', '$28'],
  ['Devon R.', 'devon', 'Grad · MBA', 'MGT 300', '$34'],
  ['Priya N.', 'priya', 'Senior · Chemistry', 'CH 101', '$30'],
];

export default function Home() {
  const t = useTheme();
  const router = useRouter();
  const { patchBooking, role } = useApp();
  const { me } = useMe();

  // Next session: live from api.listUpcoming()[0] when there's a session; demo fallback otherwise.
  const sara = tutorById('sara')!;
  const [next, setNext] = useState<{ course: string; when: string; where: string; tutor: Tutor; at: number }>({
    course: 'MGT 300',
    when: 'Tomorrow · 3:00 PM',
    where: 'Gorgas Library',
    tutor: sara,
    at: Date.now() + 27 * 3600000,
  });
  useEffect(() => {
    let active = true;
    api
      .listUpcoming()
      .then(async (bookings) => {
        const b = bookings[0];
        if (!b) return; // no upcoming session → keep demo fallback
        const summary = await api.tutors.getById(b.tutorId);
        if (!active) return;
        setNext({
          course: b.subject,
          when: formatWhen(b.scheduledAt),
          where: b.location ?? 'Online',
          tutor: summary ? toTutor(summary) : sara,
          at: new Date(b.scheduledAt).getTime(),
        });
      })
      .catch(() => { /* no session / offline → keep demo fallback */ });
    return () => { active = false; };
  }, []);

  // TODO(api): no read endpoint for study streak / monthly goal / hours — demo values.
  const goalDone = 3;
  const goalTotal = 5;

  const goTab = (key: string) => router.replace((`/${key}`) as any);

  const openTutor = (id: string, course: string) => {
    patchBooking({ tutor: tutorById(id), course });
    router.push('/b2');
  };
  const openChat = () => {
    patchBooking({ tutor: next.tutor });
    router.push('/chat'); // TODO(api): real chat thread
  };
  const grabSlot = () => {
    patchBooking({ tutor: sara, course: 'MGT 300' });
    router.push('/b3');
  };
  const notify = () => Alert.alert('Notifications', 'Coming soon — built with backend'); // TODO(api)

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: t.bg }]}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Wordmark size={22} />
          <Pressable onPress={notify} style={[styles.bellBtn, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Ic name="bell" size={19} color={t.text2} strokeWidth={1.7} />
          </Pressable>
        </View>
        <View style={styles.welcomeRow}>
          <View>
            <Text style={[styles.welcomeLabel, { color: t.text3 }]}>Welcome back</Text>
            <H2 style={{ fontSize: 24 }}>Hey, {firstName(me, 'there')}</H2>
          </View>
          <Text style={{ fontSize: 40 }}>🦎</Text>
        </View>
      </View>

      <Body contentStyle={{ paddingTop: 8 }}>
        {/* Next session countdown */}
        <View style={[styles.nextCard, { backgroundColor: t.accent }]}>
          <Text style={styles.geckoDeco}>🦎</Text>
          <View style={styles.rowBetween}>
            <Text style={[styles.nextEyebrow, { color: t.onAccent }]}>YOUR NEXT SESSION</Text>
            <Badge label={next.course} tone="ink" />
          </View>
          <View style={styles.nextTutorRow}>
            <Avatar size={40} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.nextName, { color: t.onAccent }]}>{next.tutor.name}</Text>
              <Text style={[styles.nextMeta, { color: t.onAccent }]}>
                {next.when} · {next.where}
              </Text>
            </View>
          </View>
          <CountdownPills target={next.at} />
          <View style={styles.nextActions}>
            <Pressable onPress={openChat} style={[styles.nextBtn, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
              <Ic name="chat" size={15} color={t.onAccent} strokeWidth={1.9} />
              <Text style={[styles.nextBtnLabel, { color: t.onAccent }]}>Message</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/sessions')} style={[styles.nextBtn, { backgroundColor: t.surface }]}>
              <Text style={[styles.nextBtnLabel, { color: t.accent, fontWeight: '700' }]}>Details</Text>
            </Pressable>
          </View>
        </View>

        {/* Exam radar — course-aware nudge */}
        {/* TODO(api): no exam-schedule or tutor-availability read endpoint — demo copy. */}
        <Card flat style={[styles.examCard, { backgroundColor: t.accentWeak, borderColor: t.accentBorder }]}>
          <View style={[styles.examIcon, { backgroundColor: t.surface }]}>
            <Ic name="cap" size={20} color={t.accent} strokeWidth={1.8} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.examTitle, { color: t.text }]}>MGT 300 exam in 10 days</Text>
            <Text style={[styles.examSub, { color: t.text2 }]}>Sara W. has 4 open times</Text>
          </View>
          <Pressable onPress={grabSlot} style={[styles.examBtn, { backgroundColor: t.accent }]}>
            <Text style={[styles.examBtnLabel, { color: t.onAccent }]}>Grab a slot</Text>
          </Pressable>
        </Card>

        {/* Streak + goals */}
        <View style={styles.sectionHead}>
          <H2 style={{ fontSize: 17 }}>Your momentum</H2>
          <Text style={{ fontSize: 12.5, color: t.text3 }}>This month</Text>
        </View>
        <View style={styles.statsRow}>
          <StatCard icon="flame" big="4 wk" label="Study streak — keep it alive!" />
          <StatCard icon="target" big={`${goalDone}/${goalTotal}`} label="Sessions toward your goal" />
          <StatCard icon="trophy" big="12h" label="Hours learned" />
        </View>
        <View style={[styles.goalBox, { backgroundColor: t.accentWeak, borderColor: t.accentBorder }]}>
          <View style={styles.rowBetween}>
            <Text style={[styles.goalLabel, { color: t.text }]}>
              Monthly goal · {goalDone} of {goalTotal} sessions
            </Text>
            <Text style={[styles.goalPct, { color: t.accent }]}>{Math.round((goalDone / goalTotal) * 100)}%</Text>
          </View>
          <View style={[styles.goalTrack, { backgroundColor: t.surface2 }]}>
            <View style={[styles.goalFill, { width: `${(goalDone / goalTotal) * 100}%`, backgroundColor: t.accent }]} />
          </View>
        </View>

        {/* Continue / popular */}
        <View style={[styles.sectionHead, { marginTop: 10 }]}>
          <H2 style={{ fontSize: 17 }}>Pick up where you left off</H2>
          <Text onPress={() => router.replace('/student_home' as any)} style={[styles.browseLink, { color: t.accent }]}>
            Browse
          </Text>
        </View>
        <View style={{ gap: 10 }}>
          {POP.map(([n, id, meta, course, rate]) => (
            <TutorRow key={id} onPress={() => openTutor(id, course)} name={n} meta={meta} course={course} rate={rate} />
          ))}
        </View>
      </Body>

      <TabBar active="home" onTab={goTab} role={role} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  bellBtn: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  welcomeRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  welcomeLabel: { fontSize: 13 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  nextCard: { position: 'relative', overflow: 'hidden', borderRadius: 20, padding: 16, marginBottom: 4 },
  geckoDeco: { position: 'absolute', right: -10, bottom: -18, fontSize: 100, opacity: 0.16, transform: [{ rotate: '10deg' }] },
  nextEyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1, opacity: 0.9 },
  nextTutorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 12 },
  nextName: { fontSize: 16, fontWeight: '700' },
  nextMeta: { fontSize: 12.5, opacity: 0.85, marginTop: 1 },
  nextActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  nextBtn: { flex: 1, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  nextBtnLabel: { fontSize: 14, fontWeight: '600' },

  pillsRow: { flexDirection: 'row', gap: 8 },
  pill: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.16)' },
  pillValue: { fontWeight: '800', fontSize: 22, lineHeight: 24 },
  pillLabel: { fontSize: 10, opacity: 0.85, marginTop: 3, letterSpacing: 0.6 },

  examCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  examIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  examTitle: { fontSize: 14, fontWeight: '700' },
  examSub: { fontSize: 12.5, marginTop: 1 },
  examBtn: { height: 36, paddingHorizontal: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  examBtnLabel: { fontSize: 12.5, fontWeight: '700' },

  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, padding: 12, borderRadius: 16, borderWidth: 1 },
  statIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statBig: { fontWeight: '800', fontSize: 20, lineHeight: 22 },
  statLabel: { fontSize: 11.5, marginTop: 3, lineHeight: 15 },

  goalBox: { padding: 14, borderRadius: 16, borderWidth: 1 },
  goalLabel: { fontSize: 13, fontWeight: '600' },
  goalPct: { fontSize: 12, fontWeight: '700' },
  goalTrack: { height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 8 },
  goalFill: { height: '100%', borderRadius: 4 },

  browseLink: { fontSize: 13, fontWeight: '600' },
  tutorRow: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 12 },
  tutorName: { fontSize: 16, fontWeight: '600' },
  tutorRate: { fontSize: 15, fontWeight: '700' },
  tutorMeta: { fontSize: 13, marginTop: 2 },
  tutorBadges: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 8 },
  tutorSessions: { fontSize: 12, marginLeft: 'auto' },
});
