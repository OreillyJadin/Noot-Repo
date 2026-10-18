import React, { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, attentionTotal, type AdminCalendarEvent, type AdminHubCounts } from '@noot/core';
import { Body, Ic, Screen, Skeleton, TabBar, useTheme } from '@noot/ui';
import { useMe } from '../lib/useMe';
import { interviewLabel } from '../lib/interviewSlots';
import { AdminMfaGate } from '../lib/AdminMfaGate';
import { AdminLargeHeader, AdminRow, AdminSection, CalendarEventRow } from '../lib/adminUi';
import { useRoleSwitch } from '../lib/useRoleSwitch';
import { useTabNav } from '../lib/useTabNav';

const EMPTY_COUNTS: AdminHubCounts = {
  applications: 0,
  gradeChecks: 0,
  interviews: 0,
  nextInterviewAt: null,
  reviews: 0,
  complaints: 0,
  disputes: 0,
  ambassadorApplications: 0,
  cashouts: 0,
};

function AdminHomeScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [today, setToday] = useState(() => new Date());
  const bodyRef = useRef<ScrollView>(null);
  const { active, onTab } = useTabNav({ scrollRef: bodyRef });
  const { exitAdmin } = useRoleSwitch();
  const { me, loading: meLoading } = useMe();
  const isAdmin = !!me?.roles?.includes('admin');
  const [counts, setCounts] = useState<AdminHubCounts | null>(null);
  const [events, setEvents] = useState<AdminCalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      const now = new Date();
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      setToday(now);
      setLoading(true);
      setEventsLoading(true);
      api.admin
        .hubCounts()
        .then((value) => { if (alive) setCounts(value); })
        .catch(() => { if (alive) setCounts(null); })
        .finally(() => { if (alive) setLoading(false); });
      api.admin
        .calendar(now.toISOString(), tomorrow.toISOString())
        .then((value) => {
          if (alive) {
            setEvents(value
              .filter((event) => Date.parse(event.startsAt) >= now.getTime())
              .filter((event) => event.kind !== 'booking' || (event.status !== 'cancelled' && event.status !== 'no_show'))
              .slice(0, 3));
          }
        })
        .catch(() => { if (alive) setEvents([]); })
        .finally(() => { if (alive) setEventsLoading(false); });
      return () => { alive = false; };
    }, []),
  );

  if (!meLoading && me && !isAdmin) {
    router.replace('/home');
    return null;
  }

  const knownCounts = counts ?? EMPTY_COUNTS;
  const needsLook = counts ? attentionTotal(counts) : null;
  const dateSubtitle = today.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  const ambassadorWork = (counts?.ambassadorApplications ?? 0) + (counts?.cashouts ?? 0);

  const tutorRows = [
    {
      icon: 'cap' as const,
      title: 'Applications',
      subtitle: counts ? (knownCounts.applications ? 'Waiting for approval' : 'All caught up') : 'Loading',
      count: counts?.applications ?? 0,
      href: '/admin_tutors?tab=applications',
    },
    {
      icon: 'clock' as const,
      title: 'Interviews',
      subtitle: counts?.nextInterviewAt
        ? `Next: ${interviewLabel(new Date(counts.nextInterviewAt))}`
        : counts ? 'All caught up' : 'Loading',
      count: counts?.interviews ?? 0,
      href: '/admin_tutors?tab=interviews',
    },
    {
      icon: 'doc' as const,
      title: 'Grade checks',
      subtitle: counts ? (knownCounts.gradeChecks ? 'Transcripts to verify' : 'All caught up') : 'Loading',
      count: counts?.gradeChecks ?? 0,
      href: '/admin_tutors?tab=grades',
    },
    {
      icon: 'star' as const,
      title: 'Reviews',
      subtitle: counts ? (knownCounts.reviews ? 'Waiting for moderation' : 'All caught up') : 'Loading',
      count: counts?.reviews ?? 0,
      href: '/admin_reviews',
    },
  ];
  const safetyRows = [
    {
      icon: 'alert' as const,
      title: 'Complaints',
      subtitle: counts ? (knownCounts.complaints ? 'Reports & auto-flags' : 'All caught up') : 'Loading',
      count: counts?.complaints ?? 0,
      href: '/admin_reports',
    },
    {
      icon: 'card' as const,
      title: 'Disputes',
      subtitle: counts ? (knownCounts.disputes ? 'Bookings to resolve' : 'All caught up') : 'Loading',
      count: counts?.disputes ?? 0,
      href: '/admin_bookings?tab=disputes',
    },
  ];

  return (
    <Screen style={{ paddingTop: insets.top }}>
      <Body ref={bodyRef} pad={20} contentStyle={styles.content}>
        <AdminLargeHeader
          title="Admin"
          subtitle={dateSubtitle}
          trailing={
            <View style={styles.headerActions}>
              <Pressable
                onPress={() => router.push('/admin_chat')}
                accessibilityRole="button"
                accessibilityLabel="Open admin team chat"
                style={({ pressed }) => [
                  styles.iconButton,
                  { backgroundColor: pressed ? t.surface2 : t.surface, borderRadius: 18 },
                ]}
              >
                <Ic name="chat" size={18} color={t.text2} />
              </Pressable>
              <Pressable
                onPress={exitAdmin}
                accessibilityRole="button"
                accessibilityLabel="Exit admin"
                style={({ pressed }) => [
                  styles.exitButton,
                  { backgroundColor: pressed ? t.surface2 : t.surface },
                ]}
              >
                <Ic name="logout" size={16} color={t.text2} />
                <Text style={[styles.exitText, { color: t.text2 }]}>Exit</Text>
              </Pressable>
            </View>
          }
        />

        <View style={styles.hero}>
          {loading ? (
            <Skeleton width={54} height={48} radius={12} />
          ) : needsLook === 0 ? (
            <View style={[styles.heroCheck, { backgroundColor: t.goodWeak }]}>
              <Ic name="check" size={22} color={t.good} strokeWidth={2.2} />
            </View>
          ) : (
            <Text style={[styles.heroNumber, { color: t.text }]}>{needsLook ?? '—'}</Text>
          )}
          <Text style={[styles.heroLabel, { color: t.text2 }]}>
            {loading ? 'things need a look' : needsLook === 0 ? 'All caught up' : 'things need a look'}
          </Text>
        </View>

        <AdminSection label="Up next" action={{ label: 'Calendar', onPress: () => router.push('/admin_calendar') }}>
          {eventsLoading ? (
            <View style={styles.eventSkeletons}>
              <Skeleton height={62} />
              <Skeleton height={62} />
            </View>
          ) : events.length ? (
            events.map((event) => (
              <CalendarEventRow
                key={`${event.kind}-${event.id}`}
                event={event}
                variant="hub"
                onPress={() => router.push(event.kind === 'interview' ? '/admin_tutors?tab=interviews' : '/admin_bookings?tab=all')}
              />
            ))
          ) : (
            <AdminRow title="Nothing else today" muted />
          )}
        </AdminSection>

        <AdminSection label="Tutors">
          {tutorRows.map((row) => (
            <AdminRow
              key={row.title}
              icon={row.icon}
              title={row.title}
              subtitle={row.subtitle}
              count={row.count}
              muted={!!counts && row.count === 0}
              onPress={() => router.push(row.href as never)}
            />
          ))}
        </AdminSection>

        <AdminSection label="Safety">
          {safetyRows.map((row) => (
            <AdminRow
              key={row.title}
              icon={row.icon}
              title={row.title}
              subtitle={row.subtitle}
              count={row.count}
              muted={!!counts && row.count === 0}
              onPress={() => router.push(row.href as never)}
            />
          ))}
          <AdminRow
            icon="list"
            title="All bookings"
            subtitle="Every session on Noot"
            onPress={() => router.push('/admin_bookings?tab=all')}
          />
        </AdminSection>

        <AdminSection label="Ambassadors">
          <AdminRow
            icon="gift"
            title="Ambassadors"
            subtitle={
              counts
                ? ambassadorWork
                  ? [
                    knownCounts.ambassadorApplications ? `${knownCounts.ambassadorApplications} to approve` : '',
                    knownCounts.cashouts ? `${knownCounts.cashouts} cash-out${knownCounts.cashouts === 1 ? '' : 's'} to pay` : '',
                  ].filter(Boolean).join(' · ')
                  : 'All caught up'
                : 'Loading'
            }
            subtitleLines={2}
            count={ambassadorWork}
            muted={!!counts && ambassadorWork === 0}
            onPress={() => router.push('/admin_ambassadors' as never)}
          />
        </AdminSection>

        <Text style={[styles.note, { color: t.text3 }]}>
          Admin actions are verified server-side. This panel is visible only to admin accounts.
        </Text>
      </Body>
      <TabBar role="admin" active={active} onTab={onTab} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 4, gap: 19, paddingBottom: 22 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 2 },
  iconButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  exitButton: { height: 36, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11 },
  exitText: { fontSize: 12.5, fontWeight: '600' },
  hero: { flexDirection: 'row', alignItems: 'baseline', gap: 10, minHeight: 52, paddingHorizontal: 2 },
  heroNumber: { fontSize: 46, fontWeight: '700', letterSpacing: -1.5, lineHeight: 50 },
  heroLabel: { fontSize: 15, fontWeight: '500' },
  heroCheck: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  eventSkeletons: { gap: 1, paddingHorizontal: 14 },
  note: { fontSize: 11.5, lineHeight: 17, textAlign: 'center', marginHorizontal: 8, marginTop: 1 },
});

export default function AdminHome() {
  return (
    <AdminMfaGate>
      <AdminHomeScreen />
    </AdminMfaGate>
  );
}
