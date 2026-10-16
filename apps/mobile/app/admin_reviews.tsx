import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { api, type AdminReview } from '@noot/core';
import { Avatar, Body, Button, EmptyState, Ic, NavTop, Screen, Skeleton, useTheme } from '@noot/ui';
import { useMe } from '../lib/useMe';
import { AdminTabs, tutorTabs, useAdminHubCounts } from '../lib/AdminTabs';
import { AdminMfaGate } from '../lib/AdminMfaGate';

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '—';
}

function relativeTime(iso: string, now: number): string {
  const age = Math.max(0, now - Date.parse(iso));
  const minutes = Math.floor(age / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function AdminReviewsScreen() {
  const t = useTheme();
  const router = useRouter();
  const [now] = useState(() => Date.now());
  const { me, loading: meLoading } = useMe();
  const isAdmin = !!me?.roles?.includes('admin');
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const counts = useAdminHubCounts();

  useEffect(() => {
    let alive = true;
    api.admin
      .listPendingReviews()
      .then((result) => { if (alive) setReviews(result); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (!meLoading && me && !isAdmin) {
    router.replace('/home');
    return null;
  }

  const decide = async (review: AdminReview, decision: 'approved' | 'rejected') => {
    if (busy) return;
    setBusy(review.id);
    try {
      await api.admin.moderateReview(review.id, decision);
      setReviews((previous) => previous.filter((item) => item.id !== review.id));
    } catch (error) {
      Alert.alert('Could not update', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <NavTop title="Reviews" onBack={() => router.back()} />
      <Body pad={20} contentStyle={styles.content}>
        <AdminTabs tabs={tutorTabs(counts)} active="reviews" />
        {loading ? (
          <View style={styles.loading}>
            <Skeleton height={140} />
            <Skeleton height={140} />
          </View>
        ) : reviews.length === 0 ? (
          <EmptyState icon="star" title="Nothing to moderate" subtitle="Submitted reviews awaiting approval will appear here." />
        ) : (
          <>
            <Text style={[styles.sectionLabel, { color: t.text3 }]}>{reviews.length} awaiting moderation</Text>
            {reviews.map((review) => (
              <View key={review.id} style={[styles.item, { backgroundColor: t.surface, borderRadius: Number.parseFloat(t.cardRadius) || 16 }]}>
                <View style={styles.head}>
                  <Avatar size={38} label={initials(review.reviewerName)} />
                  <View style={styles.person}>
                    <Text style={[styles.name, { color: t.text }]}>{review.reviewerName}</Text>
                    <Text style={[styles.meta, { color: t.text3 }]}>Review for {review.subjectName} · {relativeTime(review.createdAt, now)}</Text>
                  </View>
                  <View style={styles.stars}>
                    <Ic name="star" size={14} color={t.accent} fill={t.accent} strokeWidth={0} />
                    <Text style={[styles.rating, { color: t.text }]}>{review.rating}</Text>
                  </View>
                </View>
                <Text style={[styles.course, { color: t.text2, borderTopColor: t.border }]}>Course · {review.course}</Text>
                <Text style={[styles.comment, { color: review.comment ? t.text2 : t.text3 }]}>
                  {review.comment ? `“${review.comment}”` : 'No written comment.'}
                </Text>
                <View style={styles.actions}>
                  <Button label="Reject" kind="secondary" size="md" style={{ flex: 1 }} disabled={busy === review.id} onPress={() => decide(review, 'rejected')} />
                  <Button label="Approve" kind="primary" size="md" style={{ flex: 1.4 }} disabled={busy === review.id} onPress={() => decide(review, 'approved')} />
                </View>
              </View>
            ))}
          </>
        )}
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 13, paddingBottom: 24 },
  loading: { gap: 10 },
  sectionLabel: { fontSize: 12, fontWeight: '600' },
  item: { padding: 15, gap: 9 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  person: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 11.5, marginTop: 2 },
  stars: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rating: { fontSize: 14, fontWeight: '700' },
  course: { fontSize: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  comment: { fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
});

export default function AdminReviews() {
  return (
    <AdminMfaGate>
      <AdminReviewsScreen />
    </AdminMfaGate>
  );
}
