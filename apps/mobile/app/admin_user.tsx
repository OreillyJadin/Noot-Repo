import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Screen,
  NavTop,
  Body,
  Card,
  Eyebrow,
  Badge,
  Skeleton,
  EmptyState,
  useTheme,
} from '@noot/ui';
import {
  api,
  NO_SHOW_FLAG_AT,
  TUTOR_CANCEL_FLAG_OVER,
  type AdminUserHistory,
  type AdminUserHistoryBooking,
} from '@noot/core';
import { useMe } from '../lib/useMe';
import { errText } from '../lib/errText';
import { AdminMfaGate } from '../lib/AdminMfaGate';

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function dateTimeLabel(iso: string): string {
  return new Date(iso).toLocaleString();
}

function bookingOutcome(booking: AdminUserHistoryBooking): string {
  if (booking.noShowParty) return `No-show: ${booking.noShowParty}`;
  if (booking.status === 'no_show') return 'No-show (who: unknown)';
  if (booking.cancelReason === 'tutor_declined') return 'Tutor declined';
  if (booking.cancelReason === 'tutor_no_response') return 'Request expired';
  if (booking.status === 'cancelled') {
    if (!booking.cancelledByRole) return 'Cancelled (who: unknown)';
    const refund = booking.refundPercent == null ? '' : ` (${booking.refundPercent}% refund)`;
    return `Cancelled by ${booking.cancelledByRole}${refund}`;
  }
  if (booking.status === 'completed') return 'Completed';
  if (booking.status === 'pending') return 'Request pending';
  if (booking.status === 'confirmed') return 'Scheduled';
  return booking.status.replaceAll('_', ' ');
}

function CountGroup({ title, rows }: { title: string; rows: [string, number][] }) {
  const t = useTheme();
  return (
    <Card style={styles.card}>
      <Eyebrow style={{ color: t.text3 }}>{title}</Eyebrow>
      {rows.map(([label, count]) => (
        <View key={label} style={[styles.countRow, { borderBottomColor: t.border }]}>
          <Text style={{ flex: 1, fontSize: 13, color: t.text2 }}>{label}</Text>
          <Text style={{ fontSize: 13, fontWeight: '700', color: t.text }}>{count}</Text>
        </View>
      ))}
    </Card>
  );
}

function AdminUserScreen() {
  const t = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const userId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { me, loading: meLoading, isAdmin } = useMe();
  const [history, setHistory] = useState<AdminUserHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setHistory(null);
    setFailed(null);
    setLoading(true);
    if (!userId) {
      setFailed('Account id is missing.');
      setLoading(false);
      return () => {
        active = false;
      };
    }
    api.admin
      .userHistory(userId)
      .then((result) => {
        if (active) {
          setHistory(result);
          if (!result.user) setFailed('This account could not be found.');
        }
      })
      .catch((error) => {
        if (active) setFailed(errText(error, 'Could not load account history.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  if (!meLoading && me && !isAdmin) {
    router.replace('/home');
    return null;
  }

  const user = history?.user;
  const name = user
    ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || (user.status === 'deleted' ? 'Deleted account' : '—')
    : 'User history';
  const counts = history?.counts;
  const flaggedCancels = (counts?.tutorCancels30d ?? 0) > TUTOR_CANCEL_FLAG_OVER;
  const flaggedNoShows =
    (counts?.noShowsAsStudent ?? 0) + (counts?.noShowsAsTutor ?? 0) >= NO_SHOW_FLAG_AT;

  return (
    <Screen>
      <NavTop title="User history" onBack={() => router.back()} />
      <Body pad={20}>
        {loading ? (
          <View style={{ gap: 10 }}>
            <Skeleton height={132} radius={16} />
            <Skeleton height={190} radius={16} />
            <Skeleton height={150} radius={16} />
          </View>
        ) : failed ? (
          <EmptyState icon="user" title="Couldn't load user history" subtitle={failed} />
        ) : !user || !history || !counts ? (
          <EmptyState icon="user" title="No account history" subtitle="This account could not be found." />
        ) : (
          <View style={styles.sections}>
            <Card style={styles.card}>
              <Text style={[styles.name, { color: t.text }]}>{name}</Text>
              <Text style={{ fontSize: 13, color: t.text2 }}>{user.email}</Text>
              <View style={styles.badges}>
                <Badge
                  label={user.status}
                  tone={user.status === 'active' ? 'good' : user.status === 'suspended' ? 'accentSoft' : 'neutral'}
                />
                {user.roles.map((role) => (
                  <Badge key={role} label={role} tone="neutral" />
                ))}
              </View>
              <Text style={{ fontSize: 12, color: t.text3 }}>Joined {dateLabel(user.createdAt)}</Text>
            </Card>

            <View style={{ gap: 8 }}>
              <Eyebrow style={{ color: t.text3 }}>Flags</Eyebrow>
              {flaggedCancels || flaggedNoShows ? (
                <View style={styles.badges}>
                  {flaggedCancels ? (
                    <Badge label={`${counts.tutorCancels30d} cancels / 30d`} tone="accentSoft" />
                  ) : null}
                  {flaggedNoShows ? (
                    <Badge
                      label={`${counts.noShowsAsStudent + counts.noShowsAsTutor} no-shows`}
                      tone="accentSoft"
                    />
                  ) : null}
                </View>
              ) : (
                <Text style={{ fontSize: 13, color: t.text3 }}>No current flags.</Text>
              )}
            </View>

            <View style={{ gap: 8 }}>
              <Eyebrow style={{ color: t.text3 }}>Counts</Eyebrow>
              <CountGroup
                title="Sessions"
                rows={[
                  ['As student', counts.sessionsAsStudent],
                  ['As tutor', counts.sessionsAsTutor],
                  ['Completed as student', counts.completedAsStudent],
                  ['Completed as tutor', counts.completedAsTutor],
                ]}
              />
              <CountGroup
                title="Cancellations"
                rows={[
                  ['Student confirmed · full refund', counts.studentCancelsFull],
                  ['Student confirmed · partial refund', counts.studentCancelsPartial],
                  ['Student pending requests', counts.studentRequestCancels],
                  ['Tutor confirmed', counts.tutorCancels],
                  ['Tutor confirmed · last 30 days', counts.tutorCancels30d],
                  ['Tutor declines', counts.tutorDeclines],
                  ['Requests expired', counts.requestsExpired],
                ]}
              />
              <CountGroup
                title="No-shows"
                rows={[
                  ['As student', counts.noShowsAsStudent],
                  ['As tutor', counts.noShowsAsTutor],
                ]}
              />
              <CountGroup
                title="Reports"
                rows={[
                  ['Received', counts.reportsReceived],
                  ['Filed', counts.reportsFiled],
                ]}
              />
            </View>

            <View style={{ gap: 8 }}>
              <Eyebrow style={{ color: t.text3 }}>Recent bookings</Eyebrow>
              {history.bookings.length === 0 ? (
                <EmptyState icon="cal" title="No bookings" subtitle="Booking history will appear here." />
              ) : (
                history.bookings.map((booking) => (
                  <Card key={booking.id} style={styles.card}>
                    <View style={styles.bookingHead}>
                      <Text style={[styles.itemTitle, { color: t.text }]}>{booking.subject}</Text>
                      <Badge
                        label={booking.status.replaceAll('_', ' ')}
                        tone={booking.status === 'completed' ? 'good' : booking.status === 'cancelled' ? 'accentSoft' : 'neutral'}
                      />
                    </View>
                    <Text style={{ fontSize: 12, color: t.text3 }}>{dateTimeLabel(booking.scheduledAt)}</Text>
                    <Text style={{ fontSize: 13, color: t.text2 }}>
                      {booking.role === 'student' ? 'Student' : 'Tutor'} · {booking.counterpartName}
                    </Text>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: t.text }}>
                      {bookingOutcome(booking)}
                    </Text>
                  </Card>
                ))
              )}
            </View>

            <View style={{ gap: 8 }}>
              <Eyebrow style={{ color: t.text3 }}>Reports against this user</Eyebrow>
              {history.reports.length === 0 ? (
                <EmptyState icon="alert" title="No reports" subtitle="Reports against this account will appear here." />
              ) : (
                history.reports.map((report) => (
                  <Card key={report.id} style={styles.card}>
                    <View style={styles.bookingHead}>
                      <Badge label={report.reason.replaceAll('_', ' ')} tone="accentSoft" />
                      <Text style={{ fontSize: 11, color: t.text3 }}>{report.targetKind}</Text>
                    </View>
                    {report.detail ? <Text style={{ fontSize: 13, color: t.text2 }}>{report.detail}</Text> : null}
                    <Text style={{ fontSize: 12, color: t.text3 }}>
                      {report.status} · {dateTimeLabel(report.createdAt)}
                    </Text>
                  </Card>
                ))
              )}
            </View>

            <View style={{ gap: 8 }}>
              <Eyebrow style={{ color: t.text3 }}>Admin actions</Eyebrow>
              {history.adminActions.length === 0 ? (
                <EmptyState icon="user" title="No admin actions" subtitle="Admin actions for this account will appear here." />
              ) : (
                history.adminActions.map((action, index) => (
                  <Card key={`${action.action}-${action.createdAt}-${index}`} style={styles.card}>
                    <Text style={[styles.itemTitle, { color: t.text }]}>{action.action.replaceAll('.', ' ')}</Text>
                    <Text style={{ fontSize: 13, color: t.text2 }}>By {action.actorName}</Text>
                    {Object.keys(action.details).length > 0 ? (
                      <Text style={{ fontSize: 12, color: t.text3 }}>{JSON.stringify(action.details)}</Text>
                    ) : null}
                    <Text style={{ fontSize: 12, color: t.text3 }}>{dateTimeLabel(action.createdAt)}</Text>
                  </Card>
                ))
              )}
            </View>
          </View>
        )}
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sections: { gap: 18, paddingBottom: 24 },
  card: { padding: 14, gap: 8 },
  name: { fontSize: 20, fontWeight: '700' },
  itemTitle: { flex: 1, fontSize: 14, fontWeight: '700' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  countRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 5 },
  bookingHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
});

export default function AdminUser() {
  return (
    <AdminMfaGate>
      <AdminUserScreen />
    </AdminMfaGate>
  );
}
