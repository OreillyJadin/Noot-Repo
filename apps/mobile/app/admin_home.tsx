import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen, NavTop, Body, Card, Badge, Ic, Eyebrow, Skeleton, useTheme, type IconName } from '@noot/ui';
import { api, attentionTotal, type AdminHubCounts } from '@noot/core';
import { useMe } from '../lib/useMe';
import { interviewLabel } from '../lib/interviewSlots';

type HubTile = {
  key: string;
  icon: IconName;
  label: string;
  hint: string;
  count: number | null;
  href: string;
};

const EMPTY_COUNTS: AdminHubCounts = {
  applications: 0,
  gradeChecks: 0,
  interviews: 0,
  nextInterviewAt: null,
  reviews: 0,
  complaints: 0,
  disputes: 0,
};

export default function AdminHome() {
  const t = useTheme();
  const router = useRouter();
  const { me, loading: meLoading } = useMe();
  const isAdmin = !!me?.roles?.includes('admin');
  const [counts, setCounts] = useState<AdminHubCounts | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      setLoading(true);
      api.admin
        .hubCounts()
        .then((value) => { if (alive) setCounts(value); })
        .catch(() => { if (alive) setCounts(null); })
        .finally(() => { if (alive) setLoading(false); });
      return () => { alive = false; };
    }, []),
  );

  if (!meLoading && me && !isAdmin) {
    router.replace('/home');
    return null;
  }

  const knownCounts = counts ?? EMPTY_COUNTS;
  const tiles: HubTile[] = [
    {
      key: 'applications',
      icon: 'cap',
      label: 'Applications',
      hint: 'Waiting for approval',
      count: counts?.applications ?? null,
      href: '/admin_tutors?tab=applications',
    },
    {
      key: 'interviews',
      icon: 'cal',
      label: 'Interviews',
      hint: counts
        ? knownCounts.interviews > 0 && knownCounts.nextInterviewAt
          ? `Next: ${interviewLabel(new Date(knownCounts.nextInterviewAt))}`
          : 'None scheduled'
        : 'Next: unavailable',
      count: counts?.interviews ?? null,
      href: '/admin_tutors?tab=interviews',
    },
    {
      key: 'grades',
      icon: 'doc',
      label: 'Grade checks',
      hint: 'Transcripts to verify',
      count: counts?.gradeChecks ?? null,
      href: '/admin_tutors?tab=grades',
    },
    {
      key: 'reviews',
      icon: 'star',
      label: 'Reviews',
      hint: 'Waiting for moderation',
      count: counts?.reviews ?? null,
      href: '/admin_reviews',
    },
    {
      key: 'complaints',
      icon: 'alert',
      label: 'Complaints',
      hint: 'Reports & auto-flags',
      count: counts?.complaints ?? null,
      href: '/admin_reports',
    },
    {
      key: 'disputes',
      icon: 'card',
      label: 'Disputes',
      hint: 'Bookings to resolve',
      count: counts?.disputes ?? null,
      href: '/admin_bookings?tab=disputes',
    },
  ];
  const manage: { icon: IconName; label: string; hint: string; href: string }[] = [
    { icon: 'user', label: 'Users', hint: 'Search, suspend, ban', href: '/admin_users' },
    { icon: 'cal', label: 'All bookings', hint: 'Every session on the platform', href: '/admin_bookings?tab=all' },
    { icon: 'chat', label: 'Admin team chat', hint: 'Private group thread for admins', href: '/admin_chat' },
  ];
  const needsLook = counts ? attentionTotal(counts) : null;

  return (
    <Screen>
      <NavTop title="Noot Admin" onBack={() => router.back()} />
      <Body pad={20}>
        <Text style={[styles.heading, { color: t.text }]}>Team hub</Text>
        {loading ? (
          <Skeleton width={165} height={18} style={{ marginBottom: 14 }} />
        ) : (
          <Text style={[styles.subtitle, { color: t.text3 }]}>
            {needsLook === null
              ? '— things need a look'
              : needsLook === 0
                ? 'All caught up'
                : needsLook === 1
                  ? '1 thing needs a look'
                  : `${needsLook} things need a look`}
          </Text>
        )}

        <Eyebrow style={{ color: t.text3, marginTop: 18, marginBottom: 10 }}>Tutors</Eyebrow>
        {loading ? (
          <View style={styles.grid}>
            {[0, 1, 2, 3].map((key) => <Skeleton key={key} height={124} style={styles.skeletonTile} />)}
          </View>
        ) : (
          <View style={styles.grid}>
            {tiles.slice(0, 4).map((tile) => (
              <HubMetricTile key={tile.key} tile={tile} onPress={() => router.push(tile.href as never)} />
            ))}
          </View>
        )}

        <Eyebrow style={{ color: t.text3, marginTop: 18, marginBottom: 10 }}>Students &amp; safety</Eyebrow>
        {loading ? (
          <View style={styles.grid}>
            {[0, 1].map((key) => <Skeleton key={key} height={124} style={styles.skeletonTile} />)}
          </View>
        ) : (
          <View style={styles.grid}>
            {tiles.slice(4).map((tile) => (
              <HubMetricTile key={tile.key} tile={tile} onPress={() => router.push(tile.href as never)} />
            ))}
          </View>
        )}

        <Eyebrow style={{ color: t.text3, marginTop: 18, marginBottom: 10 }}>Manage</Eyebrow>
        <View style={{ gap: 8 }}>
          {manage.map((item) => (
            <Card
              key={item.label}
              onPress={() => router.push(item.href as never)}
              style={styles.manageRow}
            >
              <View style={[styles.iconBox, { backgroundColor: t.accentWeak }]}>
                <Ic name={item.icon} size={17} color={t.accent} strokeWidth={1.8} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.manageTitle, { color: t.text }]}>{item.label}</Text>
                <Text style={[styles.manageHint, { color: t.text3 }]}>{item.hint}</Text>
              </View>
              <Ic name="chevR" size={17} color={t.text3} strokeWidth={2} />
            </Card>
          ))}
        </View>
        <Text style={[styles.note, { color: t.text3 }]}>
          Admin actions are verified server-side. This panel is visible only to admin accounts.
        </Text>
      </Body>
    </Screen>
  );
}

function HubMetricTile({ tile, onPress }: { tile: HubTile; onPress: () => void }) {
  const t = useTheme();
  const zero = tile.count === 0;
  return (
    <Card onPress={onPress} style={styles.metricTile}>
      <View style={[styles.iconBox, { backgroundColor: t.accentWeak }]}>
        <Ic name={tile.icon} size={18} color={t.accent} strokeWidth={1.8} />
      </View>
      {tile.count !== null && tile.count > 0 ? (
        <View style={styles.metricBadge}>
          <Badge label={String(tile.count)} tone="accentSoft" />
        </View>
      ) : null}
      <View style={{ marginTop: 10 }}>
        <Text style={[styles.metricCount, { color: zero ? t.text3 : t.text }]}>
          {tile.count ?? '—'}
        </Text>
        <Text style={[styles.metricLabel, { color: t.text }]}>{tile.label}</Text>
        <Text style={[styles.metricHint, { color: t.text3 }]}>
          {zero && tile.key !== 'interviews' ? 'All caught up' : tile.hint}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 26, fontWeight: '700', letterSpacing: -0.4, marginHorizontal: 2, marginTop: 6 },
  subtitle: { fontSize: 13.5, marginHorizontal: 2, marginBottom: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  skeletonTile: { width: '48%', flexGrow: 0 },
  metricTile: { width: '48%', minHeight: 124, padding: 14, justifyContent: 'space-between', position: 'relative' },
  iconBox: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  metricBadge: { position: 'absolute', top: 10, right: 10 },
  metricCount: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5, lineHeight: 31 },
  metricLabel: { fontSize: 13.5, fontWeight: '600', marginTop: 3 },
  metricHint: { fontSize: 11.5, marginTop: 2 },
  manageRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  manageTitle: { fontSize: 14.5, fontWeight: '600' },
  manageHint: { fontSize: 12, marginTop: 1 },
  note: { fontSize: 12, lineHeight: 17, marginTop: 18, paddingHorizontal: 2 },
});
