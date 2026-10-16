import React, { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api, NO_SHOW_FLAG_AT, TUTOR_CANCEL_FLAG_OVER, type AdminUserHistory, type AdminUserHistoryBooking } from '@noot/core';
import { Avatar, Body, Button, EmptyState, NavTop, Screen, Skeleton, useTheme } from '@noot/ui';
import { useMe } from '../lib/useMe';
import { errText } from '../lib/errText';
import { AdminMfaGate } from '../lib/AdminMfaGate';
import { AdminRow, AdminSection, StatusDot, WARNING_AMBER } from '../lib/adminUi';

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

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '—';
}

function CountSection({ title, rows }: { title: string; rows: [string, number][] }) {
  const t = useTheme();
  return (
    <AdminSection label={title}>
      {rows.map(([label, count]) => (
        <AdminRow
          key={label}
          title={label}
          trailing={<Text style={[styles.countValue, { color: t.text }]}>{count}</Text>}
        />
      ))}
    </AdminSection>
  );
}

function AdminUserScreen() {
  const t = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const userId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { me, loading: meLoading, isAdmin } = useMe();
  const currentUserId = useRef(userId);
  const [history, setHistory] = useState<AdminUserHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    currentUserId.current = userId;
    setHistory(null);
    setFailed(null);
    setLoading(true);
    if (!userId) {
      setFailed('Account id is missing.');
      setLoading(false);
      return () => { active = false; };
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
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
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
  const flaggedNoShows = (counts?.noShowsAsStudent ?? 0) + (counts?.noShowsAsTutor ?? 0) >= NO_SHOW_FLAG_AT;
  const isSelf = user?.id === me?.id;
  const deleted = user?.status === 'deleted';

  const updateStatus = async (next: 'active' | 'suspended' | 'banned') => {
    if (!user || isSelf || deleted || busy) return;
    const targetId = user.id;
    setBusy(true);
    try {
      await api.admin.setUserStatus(targetId, next);
      if (currentUserId.current === targetId) {
        setHistory((previous) => previous?.user?.id === targetId
        ? { ...previous, user: { ...previous.user, status: next } }
        : previous);
      }
      try {
        const refreshed = await api.admin.userHistory(targetId);
        if (currentUserId.current === targetId) setHistory(refreshed);
      } catch {}
    } catch (error) {
      Alert.alert('Could not update', errText(error, 'Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const confirmStatus = (next: 'active' | 'suspended' | 'banned') => {
    if (!user || isSelf || deleted || busy) return;
    if (next === 'active') {
      void updateStatus(next);
      return;
    }
    const action = next === 'banned' ? 'Ban' : 'Suspend';
    Alert.alert(`${action} account?`, `${name} will ${next === 'banned' ? 'lose access to' : 'be temporarily unable to use'} Noot.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: action, style: 'destructive', onPress: () => void updateStatus(next) },
    ]);
  };

  return (
    <Screen>
      <NavTop title={user ? name : 'User history'} onBack={() => router.back()} />
      <Body pad={20} contentStyle={styles.content}>
        {loading ? (
          <View style={styles.loading}>
            <Skeleton height={104} />
            <Skeleton height={190} />
            <Skeleton height={150} />
          </View>
        ) : failed ? (
          <EmptyState icon="user" title="Couldn't load user history" subtitle={failed} />
        ) : !user || !history || !counts ? (
          <EmptyState icon="user" title="No account history" subtitle="This account could not be found." />
        ) : (
          <>
            <View style={styles.profile}>
              <Avatar size={58} label={initials(name)} />
              <View style={styles.profileText}>
                <Text style={[styles.name, { color: t.text }]}>{name}</Text>
                <Text style={[styles.email, { color: t.text2 }]}>{user.email}</Text>
                <Text style={[styles.roles, { color: t.text3 }]}>
                  {user.roles.map((role) => role[0]!.toUpperCase() + role.slice(1)).join(' · ')}
                </Text>
                <View style={styles.profileStatus}>
                  <StatusDot
                    label={user.status[0]!.toUpperCase() + user.status.slice(1)}
                    color={user.status === 'active' ? t.good : user.status === 'suspended' ? WARNING_AMBER : t.text3}
                  />
                  <Text style={[styles.joined, { color: t.text3 }]}>Joined {dateLabel(user.createdAt)}</Text>
                </View>
              </View>
            </View>

            {!isSelf && !deleted ? (
              <View style={styles.actions}>
                {user.status === 'active' ? (
                  <>
                    <Button label={busy ? 'Working…' : 'Suspend'} kind="secondary" size="sm" style={{ flex: 1 }} disabled={busy} onPress={() => confirmStatus('suspended')} />
                    <Button label={busy ? 'Working…' : 'Ban'} kind="tint" size="sm" style={{ flex: 1 }} disabled={busy} onPress={() => confirmStatus('banned')} />
                  </>
                ) : (
                  <Button label={busy ? 'Working…' : 'Reactivate'} kind="primary" size="sm" style={{ flex: 1 }} disabled={busy} onPress={() => confirmStatus('active')} />
                )}
              </View>
            ) : null}

            <AdminSection label="Flags">
              {flaggedCancels ? (
                <AdminRow title="Tutor cancellations" subtitle={`${counts.tutorCancels30d} cancels / 30d`} trailing={<Text style={[styles.warning, { color: WARNING_AMBER }]}>Review</Text>} />
              ) : null}
              {flaggedNoShows ? (
                <AdminRow title="No-shows" subtitle={`${counts.noShowsAsStudent + counts.noShowsAsTutor} no-shows`} trailing={<Text style={[styles.warning, { color: WARNING_AMBER }]}>Review</Text>} />
              ) : null}
              {!flaggedCancels && !flaggedNoShows ? <AdminRow title="No current flags" muted /> : null}
            </AdminSection>

            <CountSection
              title="Sessions"
              rows={[
                ['As student', counts.sessionsAsStudent],
                ['As tutor', counts.sessionsAsTutor],
                ['Completed as student', counts.completedAsStudent],
                ['Completed as tutor', counts.completedAsTutor],
              ]}
            />
            <CountSection
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
            <CountSection title="No-shows" rows={[['As student', counts.noShowsAsStudent], ['As tutor', counts.noShowsAsTutor]]} />
            <CountSection title="Reports" rows={[['Received', counts.reportsReceived], ['Filed', counts.reportsFiled]]} />

            <AdminSection label="Recent bookings">
              {history.bookings.length ? history.bookings.map((booking) => (
                <AdminRow
                  key={booking.id}
                  title={booking.subject}
                  subtitleLines={0}
                  subtitle={`${dateTimeLabel(booking.scheduledAt)} · ${booking.role === 'student' ? 'Student' : 'Tutor'} · ${booking.counterpartName}`}
                  detail={<Text style={[styles.historyDetail, { color: t.text2 }]}>{bookingOutcome(booking)}</Text>}
                  trailing={<Text style={[styles.status, { color: t.text3 }]}>{booking.status.replaceAll('_', ' ')}</Text>}
                />
              )) : <AdminRow title="No bookings" muted />}
            </AdminSection>

            <AdminSection label="Reports against this user">
              {history.reports.length ? history.reports.map((report) => (
                <AdminRow
                  key={report.id}
                  title={report.reason.replaceAll('_', ' ')}
                  subtitleLines={0}
                  subtitle={`${report.targetKind} · ${report.status} · ${dateTimeLabel(report.createdAt)}`}
                  detail={report.detail ? <Text style={[styles.historyDetail, { color: t.text2 }]}>{report.detail}</Text> : undefined}
                />
              )) : <AdminRow title="No reports" muted />}
            </AdminSection>

            <AdminSection label="Admin actions">
              {history.adminActions.length ? history.adminActions.map((action, index) => (
                <AdminRow
                  key={`${action.action}-${action.createdAt}-${index}`}
                  title={action.action.replaceAll('.', ' ')}
                  subtitleLines={0}
                  subtitle={`By ${action.actorName} · ${dateTimeLabel(action.createdAt)}`}
                  detail={Object.keys(action.details).length
                    ? <Text style={[styles.historyDetail, { color: t.text2 }]}>{JSON.stringify(action.details)}</Text>
                    : undefined}
                />
              )) : <AdminRow title="No admin actions" muted />}
            </AdminSection>
          </>
        )}
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 17, paddingBottom: 24 },
  loading: { gap: 10 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, backgroundColor: 'transparent' },
  profileText: { flex: 1, minWidth: 0, gap: 3 },
  name: { fontSize: 19, fontWeight: '700' },
  email: { fontSize: 13 },
  roles: { fontSize: 12, marginTop: 1 },
  profileStatus: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 5 },
  joined: { fontSize: 11.5 },
  actions: { flexDirection: 'row', gap: 8 },
  warning: { fontSize: 11, fontWeight: '600' },
  historyDetail: { fontSize: 12, lineHeight: 17 },
  countValue: { fontSize: 13, fontWeight: '700' },
  status: { fontSize: 11, textTransform: 'capitalize' },
});

export default function AdminUser() {
  return (
    <AdminMfaGate>
      <AdminUserScreen />
    </AdminMfaGate>
  );
}
