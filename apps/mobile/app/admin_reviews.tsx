// Admin → Review moderation. Lists reviews awaiting moderation (they're hidden from
// everyone until approved) and lets an admin approve/reject. Actions go through
// api.admin.moderateReview → the moderate-review Edge Function (re-verifies admin, is the
// only writer of reviews.approval_status, and recomputes the tutor's rating on approve).
import React, { useEffect, useState } from 'react';
import { View, Text, Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, NavTop, Body, Card, Button, Badge, Ic, Eyebrow, EmptyState, Skeleton, useTheme } from '@noot/ui';
import { api, type AdminReview } from '@noot/core';
import { useMe } from '../lib/useMe';

export default function AdminReviews() {
  const t = useTheme();
  const router = useRouter();
  const { me, loading: meLoading } = useMe();
  const isAdmin = !!me?.roles?.includes('admin');
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.admin.listPendingReviews().then((r) => { if (alive) setReviews(r); }).catch(() => {}).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (!meLoading && me && !isAdmin) { router.replace('/home'); return null; }

  const decide = async (r: AdminReview, decision: 'approved' | 'rejected') => {
    if (busy) return;
    setBusy(r.id);
    try {
      await api.admin.moderateReview(r.id, decision);
      setReviews((prev) => prev.filter((x) => x.id !== r.id));
    } catch (e) {
      Alert.alert('Could not update', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <NavTop title="Review moderation" onBack={() => router.back()} />
      <Body pad={20}>
        {loading ? (
          <View style={{ gap: 10 }}>
            <Skeleton height={120} radius={16} />
            <Skeleton height={120} radius={16} />
          </View>
        ) : reviews.length === 0 ? (
          <EmptyState icon="star" title="Nothing to moderate" subtitle="Submitted reviews awaiting approval will appear here." />
        ) : (
          <View style={{ gap: 12 }}>
            <Eyebrow style={{ color: t.text3 }}>{reviews.length} awaiting moderation</Eyebrow>
            {reviews.map((r) => (
              <Card key={r.id} style={{ padding: 16 }}>
                <View style={styles.headRow}>
                  <Text style={[styles.who, { color: t.text }]}>{r.reviewerName} → {r.subjectName}</Text>
                  <View style={styles.stars}>
                    <Ic name="star" size={14} color={t.accent} fill={t.accent} strokeWidth={0} />
                    <Text style={[styles.rating, { color: t.text }]}>{r.rating}</Text>
                  </View>
                </View>
                {r.course ? <Badge label={r.course} tone="accentSoft" /> : null}
                {r.comment ? (
                  <Text style={[styles.comment, { color: t.text2 }]}>“{r.comment}”</Text>
                ) : (
                  <Text style={[styles.comment, { color: t.text3 }]}>No written comment.</Text>
                )}
                <View style={styles.actions}>
                  <Button label="Reject" kind="secondary" size="md" style={{ flex: 1 }} disabled={busy === r.id} onPress={() => decide(r, 'rejected')} />
                  <Button label="Approve" kind="primary" size="md" style={{ flex: 1.4 }} disabled={busy === r.id} onPress={() => decide(r, 'approved')} />
                </View>
              </Card>
            ))}
          </View>
        )}
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 },
  who: { fontSize: 15, fontWeight: '700', flex: 1 },
  stars: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rating: { fontSize: 14, fontWeight: '700' },
  comment: { fontSize: 14, lineHeight: 20, marginTop: 10 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
});
