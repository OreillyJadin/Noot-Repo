import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { campusDayKey, campusInstant, formatCampusTime, formatCampusSession, api, type AdminBooking } from '@noot/core';
import { Body, EmptyState, NavTop, Screen, Skeleton, useTheme } from '@noot/ui';
import { useMe } from '../lib/useMe';
import { AdminTabs, safetyTabs, useAdminHubCounts } from '../lib/AdminTabs';
import { AdminMfaGate } from '../lib/AdminMfaGate';
import { AdminRow, AdminSection, StatusDot } from '../lib/adminUi';

function when(iso: string): string {
  return formatCampusTime(iso);
}

function dayLabel(key: string, today: Date): string {
  const [year, month, day] = key.split('-').map(Number);
  const date = campusInstant({ year: year!, month: month!, day: day! });
  return formatCampusSession(date, today).split(' · ')[0]!;
}

function statusColor(status: string, t: ReturnType<typeof useTheme>): string {
  if (status === 'confirmed' || status === 'completed') return t.good;
  if (status === 'pending') return t.accent;
  if (status === 'cancelled' || status === 'no_show') return t.text3;
  return t.text2;
}

function AdminBookingsScreen() {
  const t = useTheme();
  const router = useRouter();
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const tab = tabParam === 'disputes' ? 'disputes' : 'all';
  const { me, loading: meLoading } = useMe();
  const [today, setToday] = useState(() => new Date());
  const isAdmin = !!me?.roles?.includes('admin');
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const counts = useAdminHubCounts();

  useFocusEffect(useCallback(() => {
    setToday(new Date());
  }, []));

  useEffect(() => {
    let alive = true;
    api.admin
      .listBookings()
      .then((result) => { if (alive) setBookings(result); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (!meLoading && me && !isAdmin) {
    router.replace('/home');
    return null;
  }

  const visibleBookings = tab === 'disputes'
    ? bookings.filter((booking) => booking.disputeStatus === 'flagged')
    : bookings;

  const dispute = async (booking: AdminBooking, action: 'flag' | 'resolve') => {
    if (busy) return;
    setBusy(booking.id);
    try {
      const result = await api.admin.resolveDispute(
        booking.id,
        action,
        action === 'flag' ? { reason: 'Flagged by admin' } : { resolution: 'Resolved by admin' },
      );
      setBookings((previous) => previous.map((item) => (
        item.id === booking.id ? { ...item, disputeStatus: result.disputeStatus } : item
      )));
    } catch (error) {
      Alert.alert('Could not update', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const groups = [...visibleBookings]
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))
    .reduce<Record<string, AdminBooking[]>>((result, booking) => {
      const key = campusDayKey(booking.scheduledAt);
      (result[key] ??= []).push(booking);
      return result;
    }, {});

  return (
    <Screen>
      <NavTop title="Bookings" onBack={() => router.back()} />
      <Body pad={20} contentStyle={styles.content}>
        <AdminTabs tabs={safetyTabs(counts)} active={tab} />
        {loading ? (
          <View style={styles.loading}>
            <Skeleton height={96} />
            <Skeleton height={96} />
          </View>
        ) : visibleBookings.length === 0 ? (
          <EmptyState
            icon={tab === 'disputes' ? 'alert' : 'cal'}
            title={tab === 'disputes' ? 'No open disputes' : 'No bookings'}
            subtitle={tab === 'disputes' ? 'Flagged bookings will appear here.' : 'Bookings across the platform will appear here.'}
          />
        ) : (
          <>
            <Text style={[styles.countLine, { color: t.text3 }]}>
              {tab === 'disputes' ? `${visibleBookings.length} open disputes` : `${visibleBookings.length} recent bookings`}
            </Text>
            {Object.entries(groups).map(([date, dayBookings]) => (
              <AdminSection key={date} label={dayLabel(date, today)}>
                {dayBookings!.map((booking) => (
                  <BookingRow
                    key={booking.id}
                    booking={booking}
                    disputedOnly={tab === 'disputes'}
                    busy={busy === booking.id}
                    onFlag={() => void dispute(booking, 'flag')}
                    onResolve={() => void dispute(booking, 'resolve')}
                  />
                ))}
              </AdminSection>
            ))}
          </>
        )}
      </Body>
    </Screen>
  );
}

function BookingRow({
  booking,
  disputedOnly,
  busy,
  onFlag,
  onResolve,
}: {
  booking: AdminBooking;
  disputedOnly: boolean;
  busy: boolean;
  onFlag: () => void;
  onResolve: () => void;
}) {
  const t = useTheme();
  const action = booking.disputeStatus === 'none' ? 'Flag' : booking.disputeStatus === 'flagged' ? 'Resolve' : null;
  const color = booking.disputeStatus === 'flagged' ? '#C2783A' : statusColor(booking.status, t);
  const amount = `$${(booking.price + booking.studentFee).toFixed(2).replace(/\.00$/, '')}`;
  const subtitle = `${booking.subject} · ${when(booking.scheduledAt)}`;
  return (
    <AdminRow
      title={`${booking.studentName} → ${booking.tutorName}`}
      subtitle={subtitle}
      subtitleLines={disputedOnly ? 0 : 1}
      detail={disputedOnly && booking.disputeReason
        ? <Text style={[styles.reason, { color: t.text2 }]}>{booking.disputeReason}</Text>
        : undefined}
      trailing={
        <View style={styles.trailing}>
          <Text style={[styles.amount, { color: t.text }]}>{amount}</Text>
          <StatusDot
            label={booking.disputeStatus === 'flagged' ? 'Disputed' : booking.status.replaceAll('_', ' ')}
            color={color}
          />
          {action ? (
            <Pressable
              onPress={action === 'Flag' ? onFlag : onResolve}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`${action} dispute for ${booking.subject}`}
              style={({ pressed }) => [styles.action, { opacity: pressed || busy ? 0.55 : 1 }]}
            >
              <Text style={[styles.actionText, { color: booking.disputeStatus === 'flagged' ? '#C2783A' : t.text2 }]}>
                {busy ? '…' : action}
              </Text>
            </Pressable>
          ) : null}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, paddingBottom: 24 },
  loading: { gap: 10 },
  countLine: { fontSize: 12, fontWeight: '600' },
  trailing: { alignItems: 'flex-end', gap: 5, minWidth: 62 },
  amount: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  reason: { fontSize: 12, lineHeight: 17 },
  action: { paddingVertical: 2, paddingHorizontal: 4 },
  actionText: { fontSize: 11.5, fontWeight: '700' },
});

export default function AdminBookings() {
  return (
    <AdminMfaGate>
      <AdminBookingsScreen />
    </AdminMfaGate>
  );
}
