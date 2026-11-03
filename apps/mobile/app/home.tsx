// S2 Student Home (For You) — ported from screens-home.jsx (StudentHomeFeed).
// Study hub: next-session countdown, exam nudge, streak/goals, "pick up where you
// left off". This is a tab root (Home tab). The next session + weekly numbers are
// real data via @noot/core.
import React, { useEffect, useRef, useState } from 'react';
import { Alert, View, Text, Pressable, StyleSheet, type ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Body, BandHeader, TabBar, Card, Avatar, Ic, ViewingAs, useTheme, useLargeText, AdaptiveRow, ListSection, TEXT_CAPS } from '@noot/ui';
import { formatCampusDate, formatCampusSession, api } from '@noot/core';
import { useApp } from '../lib/store';
import { toTutor, type Tutor } from '../lib/data';
import { useMe } from '../lib/useMe';
import { useTabNav } from '../lib/useTabNav';
import { usePullToRefresh } from '../lib/usePullToRefresh';
import { AdminShortcut } from '../lib/AdminShortcut';
import { NotificationBell } from '../lib/NotificationBell';
import { VERIFIED_EXPLAINER } from '../lib/VerifiedBadge';
import { tutorMeta } from '../lib/tutorMeta';
import { nudgeCourse } from '../lib/browse';
import { countdownLabel } from '../lib/countdownLabel';
import { useSessionClock } from '../lib/useSessionClock';
import { GraduatedCap } from '../lib/GraduatedCap';

/** scheduledAt ISO → "Tomorrow · 3:00 PM" style label (matches the prototype). */
function formatWhen(iso: string): string {
  return formatCampusSession(iso);
}

function TutorRow({
  tutor,
  course,
  onPress,
}: {
  tutor: Tutor;
  course: string;
  onPress: () => void;
}) {
  const t = useTheme();
  const large = useLargeText();
  const meta = tutorMeta(tutor, course);
  const nameDetails = [tutor.year, tutor.major].filter(Boolean).join(' · ');
  const sessionsLabel = `${tutor.sessions} ${tutor.sessions === 1 ? 'session' : 'sessions'}`;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${tutor.name}${tutor.year === 'Post Grad' ? ', Graduated' : ''}${meta.course ? `, ${meta.course}` : ''}${nameDetails ? `, ${nameDetails}` : ''}, ${sessionsLabel}${tutor.verified ? ', verified tutor' : ''}. $${tutor.rate} per hour`}
      style={({ pressed }) => [styles.tutorRow, { backgroundColor: pressed ? t.surface2 : 'transparent' }]}
    >
      {large ? null : <Avatar size={46} uri={tutor.avatarUrl} />}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.rowBetween}>
          <View style={styles.tutorNameRow}>
            <Text style={[styles.tutorName, { color: t.text }]}>{tutor.name}</Text>
            <GraduatedCap year={tutor.year} />
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
          <Text style={[styles.tutorRate, { color: t.text }]}>
            ${tutor.rate}
            <Text style={{ fontSize: 11, color: t.text3, fontWeight: '500' }}>/hr</Text>
          </Text>
        </View>
        <Text maxFontSizeMultiplier={TEXT_CAPS.label} style={[styles.tutorMeta, { color: t.text2 }]}>{meta.line}</Text>
      </View>
    </Pressable>
  );
}

export default function Home() {
  const now = useSessionClock();
  const large = useLargeText();
  const { reloadKey, onRefresh } = usePullToRefresh();
  const t = useTheme();
  const router = useRouter();
  const { patchBooking, role } = useApp();
  const { me } = useMe();
  const multiRole = (me?.roles ?? []).filter((r) => r === 'student' || r === 'tutor' || r === 'ambassador').length > 1;

  // Next session: the soonest real upcoming booking, or null → a "find a tutor" CTA.
  const [next, setNext] = useState<{ course: string; when: string; where: string; tutorName: string; tutor: Tutor | null; at: number; endsAt: number } | null>(null);
  const [nextLoading, setNextLoading] = useState(true);
  useEffect(() => {
    let active = true;
    api
      .listUpcoming('student')
      .then(async (bookings) => {
        const b = bookings.find((booking) => booking.status === 'confirmed');
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
          endsAt: new Date(b.scheduledAt).getTime() + b.durationMinutes * 60_000,
        });
      })
      .catch(() => { if (active) setNext(null); })
      .finally(() => { if (active) setNextLoading(false); });
    return () => { active = false; };
  }, [reloadKey, now]);

  // "Pick up where you left off" — real tutors from search (student's courses drive it).
  const [tutors, setTutors] = useState<Tutor[]>([]);
  useEffect(() => {
    let active = true;
    api.tutors
      .search({})
      .then((list) => { if (active) setTutors(list.map(toTutor)); })
      .catch(() => {});
    return () => { active = false; };
  }, [reloadKey]);
  const popular = tutors.slice(0, 3);
  // The course the nudge names: one of the student's that a tutor really teaches (ERR-015).
  const nudge = nudgeCourse(tutors, me?.courses ?? []);

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
  // Search results for that course (an exact course query lists only its tutors).
  const findForCourse = (course: string) => router.push({ pathname: '/b1', params: { q: course } });

  return (
    <View style={[styles.root, { backgroundColor: t.bg }]}>
      <Body
        ref={scrollRef}
        onRefresh={onRefresh}
        refreshTint={t.onBand}
        pad={20}
        header={
          <BandHeader
            title="Home"
            subtitle={formatCampusDate(now, { weekday: 'long', month: 'long', day: 'numeric' })}
            overlap={multiRole ? undefined : 56}
            trailing={
              <View style={styles.headerActions}>
                <AdminShortcut color={t.onBand} ringColor={t.band} />
                <NotificationBell color={t.onBand} ringColor={t.band} />
              </View>
            }
          />
        }
      >
        {multiRole ? <ViewingAs role="student" /> : null}
        {/* Next session countdown — real upcoming booking, or a CTA when there's none */}
        {next ? (
          <Card raised style={[styles.nextCard, { marginTop: multiRole ? 0 : -56, backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={[styles.nextLabel, { color: t.text2 }]}>
              {next.at <= now && now < next.endsAt ? 'Session in progress' : 'Next session'}
            </Text>
            <AdaptiveRow style={styles.nextTutorRow}>
              <Avatar size={44} uri={next.tutor?.avatarUrl} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.tutorNameRow}>
                  <Text style={[styles.nextName, { color: t.text }]}>{next.tutorName}</Text>
                  <GraduatedCap year={next.tutor?.year} />
                </View>
                <Text style={[styles.nextMeta, { color: t.text2 }]}>
                  {next.course} · {next.when}
                </Text>
              </View>
            </AdaptiveRow>
            <View style={styles.sessionMetaLine}>
              <Ic name="clock" size={15} color={t.accent} strokeWidth={1.8} />
              <Text style={[styles.countdown, { color: t.accent }]}>{countdownLabel(next.at, next.endsAt, now)}</Text>
              <Ic name="pin" size={15} color={t.text2} strokeWidth={1.8} />
              <Text style={[styles.nextLocation, { color: t.text2 }]}>{next.where}</Text>
            </View>
            <AdaptiveRow style={[styles.nextActions, large && styles.nextActionsLarge, { borderColor: t.border }]}>
              <Pressable
                onPress={openChat}
                style={[styles.nextAction, large ? styles.nextActionLarge : styles.nextActionDivider, { borderColor: t.border }]}
                accessibilityRole="button"
                accessibilityLabel="Message your tutor"
              >
                <Ic name="chat" size={15} color={t.accent} strokeWidth={1.9} />
                <Text style={[styles.nextBtnLabel, { color: t.accent }]}>Message</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push('/sessions')}
                style={[styles.nextAction, large && styles.nextActionLarge, { borderColor: t.border }]}
                accessibilityRole="button"
                accessibilityLabel="Session details"
              >
                <Text style={[styles.nextBtnLabel, { color: t.accent, fontWeight: '700' }]}>Details</Text>
              </Pressable>
            </AdaptiveRow>
          </Card>
        ) : (
          <Card raised style={[styles.nextCard, { marginTop: multiRole ? 0 : -56, backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={[styles.nextLabel, { color: t.text2 }]}>No upcoming sessions</Text>
            <Text style={[styles.nextName, { color: t.text, marginTop: 6 }]}>
              {nextLoading ? 'Loading…' : stats && stats.sessionsCompleted > 0 ? 'Book your next session' : 'Book your first session'}
            </Text>
            <Text style={[styles.nextMeta, { color: t.text2 }]}>
              Find a verified tutor for your courses and lock in a time.
            </Text>
            <AdaptiveRow style={[styles.nextActions, large && styles.nextActionsLarge, { borderColor: t.border }]}>
              <Pressable
                onPress={() => router.replace('/student_home')}
                style={[styles.nextAction, large && styles.nextActionLarge, { borderColor: t.border }]}
                accessibilityRole="button"
                accessibilityLabel="Find a tutor"
              >
                <Text style={[styles.nextBtnLabel, { color: t.accent, fontWeight: '700' }]}>Find a tutor</Text>
              </Pressable>
            </AdaptiveRow>
          </Card>
        )}

        {/* Course-aware nudge — a course the student takes that a tutor teaches */}
        {nudge ? (
          <ListSection label="For your courses">
            <Pressable
              onPress={() => findForCourse(nudge)}
              accessibilityRole="button"
              accessibilityLabel={`Find a tutor for ${nudge}`}
              style={({ pressed }) => [styles.nudgeRow, { backgroundColor: pressed ? t.surface2 : 'transparent' }]}
            >
              <Ic name="cap" size={20} color={t.text2} strokeWidth={1.8} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.examTitle, { color: t.text }]}>Studying {nudge}?</Text>
                <Text style={[styles.examSub, { color: t.text2 }]}>Find a tutor who's taken it</Text>
              </View>
              <Text style={[styles.examBtnLabel, { color: t.accent }]}>Find one</Text>
            </Pressable>
          </ListSection>
        ) : null}

        {/* Momentum — real counts from the student's bookings */}
        <ListSection label="Your momentum">
          <AdaptiveRow style={large ? [styles.statsRow, styles.statsRowLarge] : styles.statsRow}>
            <Pressable
              onPress={() => router.push('/sessions?tab=past')}
              accessibilityRole="button"
              accessibilityLabel={`Sessions completed: ${stats ? stats.sessionsCompleted : '—'}. View sessions`}
              style={[styles.statCell, !large && styles.statCellDivider, large && styles.statCellLarge, { borderColor: t.border }]}
            >
              <Text style={[styles.statBig, { color: t.text }]}>{stats ? String(stats.sessionsCompleted) : '—'}</Text>
              <Text style={[styles.statLabel, { color: t.text2 }]}>Sessions completed</Text>
            </Pressable>
            <View style={[styles.statCell, !large && styles.statCellDivider, large && styles.statCellLarge, { borderColor: t.border }]}>
              <Text style={[styles.statBig, { color: t.text }]}>{stats ? String(stats.upcomingCount) : '—'}</Text>
              <Text style={[styles.statLabel, { color: t.text2 }]}>Upcoming booked</Text>
            </View>
            <View style={[styles.statCell, large && styles.statCellLarge, { borderColor: t.border }]}>
              <Text style={[styles.statBig, { color: t.text }]}>{stats ? `${Math.round(stats.hoursLearned)}h` : '—'}</Text>
              <Text style={[styles.statLabel, { color: t.text2 }]}>Hours learned</Text>
            </View>
          </AdaptiveRow>
        </ListSection>

        {/* Continue / popular */}
        <ListSection label="Pick up where you left off" action={{ label: 'Browse', onPress: () => router.replace('/student_home') }}>
          {popular.map((tt) => {
            const course = tt.courses[0]?.[0] ?? '';
            return (
              <TutorRow
                key={tt.id}
                onPress={() => openTutor(tt, course)}
                tutor={tt}
                course={course}
              />
            );
          })}
          {popular.length === 0 ? <Text style={[styles.emptyTutors, { color: t.text3 }]}>Finding tutors for your courses…</Text> : null}
        </ListSection>
      </Body>

      <TabBar active={active} onTab={onTab} role={role} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowBetween: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' },

  nextCard: { padding: 16, gap: 10 },
  nextLabel: { fontSize: 13, fontWeight: '500' },
  nextTutorRow: { alignItems: 'center', gap: 10 },
  nextName: { fontSize: 16, fontWeight: '700', flexShrink: 1 },
  nextMeta: { fontSize: 13, marginTop: 1 },
  sessionMetaLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7 },
  countdown: { fontSize: 13, fontWeight: '600' },
  nextLocation: { flexShrink: 1, fontSize: 13 },
  nextActions: { flexDirection: 'row', gap: 0, marginTop: 2, borderTopWidth: StyleSheet.hairlineWidth },
  nextActionsLarge: {},
  nextAction: { flex: 1, minHeight: 46, paddingVertical: 8, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  nextActionDivider: { borderRightWidth: StyleSheet.hairlineWidth },
  nextActionLarge: { borderBottomWidth: StyleSheet.hairlineWidth },
  nextBtnLabel: { fontSize: 15, fontWeight: '600' },

  nudgeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, minHeight: 72, paddingHorizontal: 14, paddingVertical: 12 },
  examTitle: { fontSize: 14, fontWeight: '600' },
  examSub: { fontSize: 13, marginTop: 2 },
  examBtnLabel: { fontSize: 13, fontWeight: '600' },

  statsRow: { flexDirection: 'row', gap: 0, paddingVertical: 10 },
  statsRowLarge: { paddingVertical: 0 },
  statCell: { flex: 1, minWidth: 0, paddingHorizontal: 10, paddingVertical: 4, alignItems: 'center', justifyContent: 'center' },
  statCellDivider: { borderRightWidth: StyleSheet.hairlineWidth },
  statCellLarge: { width: '100%', borderRightWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth },
  statBig: { fontWeight: '700', fontSize: 22, lineHeight: 26 },
  statLabel: { fontSize: 12.5, marginTop: 3, lineHeight: 17, textAlign: 'center' },

  emptyTutors: { fontSize: 13, paddingHorizontal: 14, paddingVertical: 12 },
  tutorRow: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 12 },
  tutorNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  tutorName: { fontSize: 16, fontWeight: '600', flexShrink: 1 },
  tutorRate: { fontSize: 15, fontWeight: '700' },
  tutorMeta: { fontSize: 13, marginTop: 2 },
});
