// Admin → Booking oversight. Recent bookings across the platform with party names + status,
// and flag/resolve for disputes. Actions go through api.admin.resolveDispute → the
// resolve-dispute Edge Function (admin-verified, service role). Client guard is UI-only.
import React, { useEffect, useState } from 'react';
import { View, Text, Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, NavTop, Body, Card, Button, Badge, Eyebrow, EmptyState, Skeleton, useTheme, type BadgeTone } from '@noot/ui';
import { api, type AdminBooking } from '@noot/core';
import { useMe } from '../lib/useMe';

function when(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
const STATUS_TONE: Record<string, BadgeTone> = {
  confirmed: 'good', completed: 'accentSoft', cancelled: 'neutral', pending: 'neutral', no_show: 'neutral',
};

export default function AdminBookings() {
  const t = useTheme();
  const router = useRouter();
  const { me, loading: meLoading } = useMe();
  const isAdmin = !!me?.roles?.includes('admin');
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.admin.listBookings().then((b) => { if (alive) setBookings(b); }).catch(() => {}).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (!meLoading && me && !isAdmin) { router.replace('/home'); return null; }

  const dispute = async (b: AdminBooking, action: 'flag' | 'resolve') => {
    if (busy) return;
    setBusy(b.id);
    try {
      const res = await api.admin.resolveDispute(b.id, action, action === 'flag' ? { reason: 'Flagged by admin' } : { resolution: 'Resolved by admin' });
      setBookings((prev) => prev.map((x) => (x.id === b.id ? { ...x, disputeStatus: res.disputeStatus } : x)));
    } catch (e) {
      Alert.alert('Could not update', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <NavTop title="Booking oversight" onBack={() => router.back()} />
      <Body pad={20}>
        {loading ? (
          <View style={{ gap: 10 }}>
            <Skeleton height={96} radius={16} />
            <Skeleton height={96} radius={16} />
          </View>
        ) : bookings.length === 0 ? (
          <EmptyState icon="cal" title="No bookings" subtitle="Bookings across the platform will appear here." />
        ) : (
          <View style={{ gap: 10 }}>
            <Eyebrow style={{ color: t.text3 }}>{bookings.length} recent bookings</Eyebrow>
            {bookings.map((b) => (
              <Card key={b.id} style={{ padding: 14 }}>
                <View style={styles.row}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.parties, { color: t.text }]}>{b.studentName} ↔ {b.tutorName}</Text>
                    <Text style={[styles.meta, { color: t.text3 }]}>{b.subject} · {when(b.scheduledAt)} · ${b.price.toFixed(0)}</Text>
                  </View>
                  <Badge label={b.status} tone={STATUS_TONE[b.status] ?? 'neutral'} />
                </View>
                <View style={styles.disputeRow}>
                  {b.disputeStatus !== 'none' ? (
                    <Badge label={b.disputeStatus === 'flagged' ? '⚠ Disputed' : 'Dispute resolved'} tone={b.disputeStatus === 'flagged' ? 'accentSoft' : 'good'} />
                  ) : (
                    <Text style={[styles.noDispute, { color: t.text3 }]}>No dispute</Text>
                  )}
                  {b.disputeStatus === 'none' ? (
                    <Button label="Flag" kind="secondary" size="sm" disabled={busy === b.id} onPress={() => dispute(b, 'flag')} />
                  ) : b.disputeStatus === 'flagged' ? (
                    <Button label="Resolve" kind="primary" size="sm" disabled={busy === b.id} onPress={() => dispute(b, 'resolve')} />
                  ) : null}
                </View>
                {b.disputeReason && b.disputeStatus === 'flagged' ? (
                  <Text style={[styles.reason, { color: t.text3 }]}>{b.disputeReason}</Text>
                ) : null}
              </Card>
            ))}
          </View>
        )}
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  parties: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 12.5, marginTop: 2 },
  disputeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 12 },
  noDispute: { fontSize: 12.5 },
  reason: { fontSize: 12, marginTop: 8 },
});
