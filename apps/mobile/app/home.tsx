// S2 Student Home (For You) — ported from screens-home.jsx (StudentHomeFeed).
// Study hub: next-session countdown, exam nudge, streak/goals, "pick up where you
// left off". This is a tab root (Home tab). No live session store yet — the next
// session + weekly numbers are demo data, same as the prototype.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, type ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Body, TabBar, Wordmark, Card, Badge, Avatar, Ic, H2, Skeleton, ViewingAs, useTheme, type IconName } from '@noot/ui';
import { api } from '@noot/core';
import { useApp } from '../lib/store';
import { toTutor, type Tutor } from '../lib/data';
import { useMe, firstName } from '../lib/useMe';
import { useTabNav } from '../lib/useTabNav';
import { usePullToRefresh } from '../lib/usePullToRefresh';
import { GeckoLogo } from '../lib/GeckoLogo';
import { NotificationBell } from '../lib/NotificationBell';
import { VerifiedBadge, VERIFIED_EXPLAINER } from '../lib/VerifiedBadge';

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

function StatCard({ icon, big, label, onPress }: { icon: IconName; big: string; label: string; onPress?: () => void }) {
  const t = useTheme();
  const inner = (
    <>
      <View style={[styles.statIcon, { backgroundColor: t.accentWeak }]}>
        <Ic name={icon} size={16} color={t.accent} strokeWidth={1.9} />
      </View>
      <Text style={[styles.statBig, { color: t.text }]}>{big}</Text>
      <Text style={[styles.statLabel, { color: t.text3 }]}>{label}</Text>
    </>
  );
  // The whole card is the tap target (full flex:1 hit area), not just the text.
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={[styles.statCard, { backgroundColor: t.surface, borderColor: t.border }]}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${big}. View sessions`}
      >
        {inner}
      </Pressable>
    );
  }
  return <View style={[styles.statCard, { backgroundColor: t.surface, borderColor: t.border }]}>{inner}</View>;
}

function TutorRow({
  name,
  meta,
  course,
  rate,
  sessions,
  verified,
  onPress,
}: {
  name: string;
  meta: string;
  course: string;
  rate: string;
  sessions: number;
  verified: boolean;
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
          {course ? <Badge label={course} tone="accentSoft" /> : null}
          <VerifiedBadge verified={verified} />
          <Text style={[styles.tutorSessions, { color: t.text3 }]}>{sessions} sessions</Text>
        </View>
      </View>
    </Card>
  );
}

export default function Home() {
  const { reloadKey, onRefresh } = usePullToRefresh();
  const t = useTheme();
  const router = useRouter();
  const { patchBooking, role } = useApp();
  const { me, loading } = useMe();
  const multiRole = (me?.roles ?? []).filter((r) => r === 'student' || r === 'tutor' || r === 'ambassador').length > 1;

  // Next session: the soonest real upcoming booking, or null → a "find a tutor" CTA.
  const [next, setNext] = useState<{ course: string; when: string; where: string; tutorName: string; tutor: Tutor | null; at: number } | null>(null);
  const [nextLoading, setNextLoading] = useState(true);
  useEffect(() => {
    let active = true;
    api
      .listUpcoming()
      .then(async (bookings) => {
        const b = bookings[0];
        if (!b) { if (active) setNext(null); return; }
        const summary = await api.tutors.getById(b.tutorId).catch(() => null);
        if (!active) return;
        const tutor = summary ? toTutor(summary) : null;
        setNext({
          course: b.subject,
          when: formatWhen(b.scheduledAt),
          where: b.location ?? 'Online',
          tutorName: tutor?.name ?? 'Your tutor',
          tutor,
          at: new Date(b.scheduledAt).getTime(),
        });
      })
      .catch(() => { if (active) setNext(null); })
      .finally(() => { if (active) setNextLoading(false); });
    return () => { active = false; };
  }, [reloadKey]);

  // "Pick up where you left off" — real tutors from search (student's courses drive it).
  const [popular, setPopular] = useState<Tutor[]>([]);
  useEffect(() => {
    let active = true;
    api.tutors
      .search({})
      .then((list) => { if (active) setPopular(list.map(toTutor).slice(0, 3)); })
      .catch(() => {});
    return () => { active = false; };
  }, [reloadKey]);

  // Real study stats (sessions completed / hours / upcoming). No streak or monthly-goal
  // data model exists, so those fabricated numbers are gone — these are honest zeros
  // for a brand-new student (ARCHITECTURE §7).
  const [stats, setStats] = useState<{ sessionsCompleted: number; upcomingCount: number; hoursLearned: number } | null>(null);
  useEffect(() => {
    let active = true;
    api.studentStats().then((s) => { if (active) setStats(s); }).catch(() => {});
    return () => { active = false; };
  }, [reloadKey]);

  const scrollRef = useRef<ScrollView>(null);
  const { active, onTab } = useTabNav({ scrollRef });

  const openTutor = (tutor: Tutor, course: string) => {
    patchBooking({ tutor, course });
    router.push('/b2');
  };
  const openChat = () => {
    if (!next?.tutor) return;
    patchBooking({ tutor: next.tutor });
    router.push('/chat');
  };
  const grabSlot = () => {
    const first = popular[0];
    if (first) openTutor(first, first.courses[0]?.[0] ?? '');
    else router.replace('/student_home');
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: t.bg }]}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Wordmark size={22} />
          <NotificationBell />
        </View>
        <View style={styles.welcomeRow}>
          <View>
            <Text style={[styles.welcomeLabel, { color: t.text3 }]}>Welcome back</Text>
            {loading ? <Skeleton width={150} height={26} /> : <H2 style={{ fontSize: 24 }}>Hey, {firstName(me, 'there')}</H2>}
          </View>
          <GeckoLogo size={40} />
        </View>
        {multiRole ? (
          <View style={{ marginTop: 10 }}>
            <ViewingAs role="student" />
          </View>
        ) : null}
      </View>

      <Body ref={scrollRef} onRefresh={onRefresh} contentStyle={{ paddingTop: 8 }}>
        {/* Next session countdown — real upcoming booking, or a CTA when there's none */}
        {next ? (
          <View style={[styles.nextCard, { backgroundColor: t.accent }]}>
            <GeckoLogo style={styles.geckoDeco} />
            <View style={styles.rowBetween}>
              <Text style={[styles.nextEyebrow, { color: t.onAccent }]}>YOUR NEXT SESSION</Text>
              <Badge label={next.course} tone="ink" />
            </View>
            <View style={styles.nextTutorRow}>
              <Avatar size={40} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.nextName, { color: t.onAccent }]}>{next.tutorName}</Text>
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
        ) : (
          <View style={[styles.nextCard, { backgroundColor: t.accent }]}>
            <GeckoLogo style={styles.geckoDeco} />
            <Text style={[styles.nextEyebrow, { color: t.onAccent }]}>NO UPCOMING SESSIONS</Text>
            <Text style={[styles.nextName, { color: t.onAccent, marginTop: 8 }]}>
              {nextLoading ? 'Loading…' : 'Book your first session'}
            </Text>
            <Text style={[styles.nextMeta, { color: t.onAccent, marginBottom: 12 }]}>
              Find a verified tutor for your courses and lock in a time.
            </Text>
            <View style={styles.nextActions}>
              <Pressable onPress={() => router.replace('/student_home')} style={[styles.nextBtn, { backgroundColor: t.surface }]}>
                <Text style={[styles.nextBtnLabel, { color: t.accent, fontWeight: '700' }]}>Find a tutor</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Course-aware nudge — driven by the student's real enrolled courses */}
        {me?.courses?.length ? (
          <Card flat style={[styles.examCard, { backgroundColor: t.accentWeak, borderColor: t.accentBorder }]}>
            <View style={[styles.examIcon, { backgroundColor: t.surface }]}>
              <Ic name="cap" size={20} color={t.accent} strokeWidth={1.8} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.examTitle, { color: t.text }]}>Studying {me.courses[0]}?</Text>
              <Text style={[styles.examSub, { color: t.text2 }]}>Find a verified tutor who aced it</Text>
            </View>
            <Pressable onPress={grabSlot} style={[styles.examBtn, { backgroundColor: t.accent }]}>
              <Text style={[styles.examBtnLabel, { color: t.onAccent }]}>Find one</Text>
            </Pressable>
          </Card>
        ) : null}

        {/* Momentum — real counts from the student's bookings */}
        <View style={styles.sectionHead}>
          <H2 style={{ fontSize: 17 }}>Your momentum</H2>
        </View>
        <View style={styles.statsRow}>
          <StatCard
            icon="cap"
            big={stats ? String(stats.sessionsCompleted) : '—'}
            label="Sessions completed"
            onPress={() => router.push('/sessions?tab=past')}
          />
          <StatCard icon="target" big={stats ? String(stats.upcomingCount) : '—'} label="Upcoming booked" />
          <StatCard icon="trophy" big={stats ? `${Math.round(stats.hoursLearned)}h` : '—'} label="Hours learned" />
        </View>

        {/* Continue / popular */}
        <View style={[styles.sectionHead, { marginTop: 10 }]}>
          <H2 style={{ fontSize: 17 }}>Pick up where you left off</H2>
          <Text onPress={() => router.replace('/student_home')} style={[styles.browseLink, { color: t.accent }]}>
            Browse
          </Text>
        </View>
        <View style={{ gap: 10 }}>
          {popular.map((tt) => {
            const course = tt.courses[0]?.[0] ?? '';
            return (
              <TutorRow
                key={tt.id}
                onPress={() => openTutor(tt, course)}
                name={tt.name}
                meta={`${tt.year} · ${tt.major}`}
                course={course}
                rate={`$${tt.rate}`}
                sessions={tt.sessions}
                verified={tt.verified}
              />
            );
          })}
          {popular.length === 0 ? (
            <Text style={{ fontSize: 13, color: t.text3 }}>Finding tutors for your courses…</Text>
          ) : null}
        </View>
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
